import assert from "node:assert/strict";
import { test } from "vitest";

import { applyAction, getLegalActions } from "../../actions.js";
import {
  installActivateMainDrawDefinition,
  makeMainPhaseLegalActionState,
  toCardId,
  toEffectId,
} from "../../action-dispatcher-test-support.js";
import { must, p1, resolvedCard } from "../../action-test-fixtures.js";

test("activate main suppresses and rejects unpayable initial source-rest costs", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.characters[0], "character");
  character.state = "rested";
  const effectId = toEffectId("activate-main-character-rest-self-cost");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(character.cardId),
    category: "character",
    definitionId: "def-activate-main-character-rest-self-cost",
    effectId,
  });
  const effectBlock = must(definition.effects[0], "activate main effect");
  effectBlock.effect = {
    type: "sequence",
    effects: [
      {
        id: "rest-source-cost",
        connector: "always",
        saveResultAs: "paidCost",
        effect: {
          type: "payCost",
          cost: { type: "restSelf", optional: true },
        },
      },
      {
        id: "draw-if-paid",
        connector: "ifYouDo",
        effect: { type: "draw", player: "self", count: 1 },
      },
    ],
  };

  const legal = getLegalActions(state, p1);
  const before = JSON.stringify(state);
  const result = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: character.instanceId,
      cardId: character.cardId,
      playerId: p1,
      zone: character.zone,
    },
    effectId,
  });

  assert.equal(
    legal.some(
      (action) =>
        action.type === "activateEffect" &&
        action.source.instanceId === character.instanceId &&
        action.effectId === effectId,
    ),
    false,
  );
  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("activate main field costs resolve exclude-self filters against the source card", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.characters[0], "source character");
  const otherHomies = must(p1State.hand[0], "other Homies character");
  p1State.characters = [
    source,
    {
      ...otherHomies,
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 1,
      },
      state: "active",
      attachedDon: [],
    },
  ];
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  const effectId = toEffectId("activate-main-trash-other-homies-rest-source");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(source.cardId),
    category: "character",
    definitionId: "def-activate-main-trash-other-homies-rest-source",
    effectId,
  });
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "source manifest card"),
    types: ["Homies"],
  };
  state.cardManifest.cards[otherHomies.cardId] = resolvedCard({
    cardId: otherHomies.cardId,
    category: "character",
    cost: 2,
    power: 3000,
  });
  state.cardManifest.cards[otherHomies.cardId] = {
    ...must(
      state.cardManifest.cards[otherHomies.cardId],
      "other Homies manifest card",
    ),
    types: ["Homies"],
  };
  const effectBlock = must(definition.effects[0], "activate main effect");
  effectBlock.effect = {
    type: "sequence",
    effects: [
      {
        id: "trash-other-homies-cost",
        connector: "always",
        saveResultAs: "paidCost",
        effect: {
          type: "payCost",
          cost: {
            type: "sequence",
            optional: true,
            costs: [
              {
                type: "trashFromField",
                chooser: "self",
                count: 1,
                filter: {
                  categories: ["character"],
                  typesAny: ["Homies"],
                  excludeSelf: true,
                },
              },
              { type: "restSelf" },
            ],
          },
        },
      },
      {
        id: "draw-if-paid",
        connector: "ifYouDo",
        effect: { type: "draw", player: "self", count: 1 },
      },
    ],
  };

  const legal = getLegalActions(state, p1);
  const activated = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    effectId,
  });

  assert.equal(
    legal.some(
      (action) =>
        action.type === "activateEffect" &&
        action.source.instanceId === source.instanceId &&
        action.effectId === effectId,
    ),
    true,
  );
  assert.equal(activated.errors, undefined);
  assert.equal(activated.state.pendingDecision?.type, "payCost");
  const fieldOption = must(
    activated.state.pendingDecision.paymentOptions.find(
      (option) => option.type === "trashFromField",
    ),
    "trash-from-field payment option",
  );
  const paymentActions = getLegalActions(activated.state, p1).filter(
    (action) =>
      action.type === "respondToDecision" &&
      action.response.type === "payment" &&
      action.response.optionId === fieldOption.id,
  );
  assert.equal(
    paymentActions.some(
      (action) =>
        action.type === "respondToDecision" &&
        action.response.type === "payment" &&
        action.response.selectedCardInstanceIds?.[0] === otherHomies.instanceId,
    ),
    true,
  );
});
