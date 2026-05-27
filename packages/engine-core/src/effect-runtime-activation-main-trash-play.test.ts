import assert from "node:assert/strict";
import { test } from "vitest";

import type { SelectionId } from "@optcg/types";

import { applyAction } from "./actions.js";
import {
  installActivateMainDrawDefinition,
  makeMainPhaseLegalActionState,
  toCardId,
  toEffectId,
} from "./action-dispatcher-test-support.js";
import {
  addExtraDeckCard,
  must,
  p1,
  resolvedCard,
} from "./action-test-fixtures.js";

test("activate main supports leader-gated rest and hand-trash cost before trash-all and trash playSelected", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-trash-all-play-from-trash");
  const definition = installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-trash-all-play-from-trash",
    effectId,
  });
  const leaderCard = must(state.cardManifest.cards[leader.cardId], "leader");
  state.cardManifest.cards[leader.cardId] = { ...leaderCard, name: "Imu" };
  const fieldCharacter = must(p1State.characters[0], "field character");
  fieldCharacter.cardId = toCardId("field-character-not-eligible");
  state.cardManifest.cards[fieldCharacter.cardId] = resolvedCard({
    cardId: fieldCharacter.cardId,
    category: "character",
    power: 3000,
  });
  const fieldMetadata = must(
    state.cardManifest.cards[fieldCharacter.cardId],
    "field metadata",
  );
  fieldMetadata.name = "Field Character";
  fieldMetadata.types = ["Celestial Dragons"];
  addExtraDeckCard(state, p1);
  const trashCards = p1State.deck.slice(0, 2).map((card, index) => ({
    ...card,
    cardId: toCardId(`trash-five-elder-${String(index + 1)}`),
    zone: {
      zone: "trash" as const,
      playerId: p1,
      slot: "trash" as const,
      index,
    },
  }));
  p1State.deck = p1State.deck.slice(2).map((card, index) => ({
    ...card,
    zone: { zone: "deck", playerId: p1, slot: "deck", index },
  }));
  p1State.trash = trashCards;
  for (const [index, card] of trashCards.entries()) {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
      cost: 5,
      power: 5000,
    });
    const trashMetadata = must(
      state.cardManifest.cards[card.cardId],
      "trash metadata",
    );
    trashMetadata.name = `Elder ${String(index + 1)}`;
    trashMetadata.types = ["Five Elders"];
  }
  const effectBlock = must(definition.effects[0], "effect");
  effectBlock.condition = {
    type: "hasCardInZone",
    zone: "leaderArea",
    player: "self",
    filter: { categories: ["leader"], names: ["Imu"] },
  };
  effectBlock.effect = {
    type: "sequence",
    effects: [
      {
        id: "pay-rest-don-and-trash-hand",
        connector: "always",
        saveResultAs: "paidCost",
        effect: {
          type: "payCost",
          cost: {
            type: "sequence",
            optional: true,
            costs: [
              { type: "restDon", count: 1, chooser: "self" },
              { type: "trashFromHand", count: 1, chooser: "self" },
            ],
          },
        },
      },
      {
        id: "trash-and-play-if-paid",
        connector: "ifYouDo",
        effect: {
          type: "sequence",
          effects: [
            {
              id: "trash-all-characters",
              connector: "always",
              effect: {
                type: "trash",
                target: {
                  type: "all",
                  zone: "characterArea",
                  player: "self",
                  filter: { categories: ["character"] },
                },
              },
            },
            {
              id: "select-from-trash",
              connector: "then",
              saveResultAs: "trashSelection:play",
              effect: {
                type: "selectCards",
                zone: "trash",
                player: "self",
                chooser: "self",
                min: 0,
                max: 5,
                filter: {
                  categories: ["character"],
                  typesAny: ["Five Elders"],
                  power: { op: "eq", value: 5000 },
                  custom: "differentNames",
                },
                saveAs: "trashSelection:play" as SelectionId,
                visibility: "bothPlayers",
              },
            },
            {
              id: "play-selected",
              connector: "ifPossible",
              effect: {
                type: "playSelected",
                selection: "trashSelection:play" as SelectionId,
                ignoreCost: true,
              },
            },
          ],
        },
      },
    ],
  };

  const activated = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });
  assert.equal(activated.errors, undefined);
  const restDonDecision = must(activated.state.pendingDecision, "rest DON");
  const activeDon = must(
    p1State.costArea.find((card) => card.state === "active"),
    "active DON",
  );
  const paidDon = applyAction(activated.state, {
    type: "respondToDecision",
    decisionId: restDonDecision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [activeDon.instanceId],
    },
  });
  const trashHandDecision = must(paidDon.state.pendingDecision, "hand trash");
  const handCard = must(
    must(paidDon.state.players[p1], "after DON").hand[0],
    "hand cost card",
  );
  const paidHand = applyAction(paidDon.state, {
    type: "respondToDecision",
    decisionId: trashHandDecision.id,
    response: {
      type: "payment",
      optionId: "trashFromHand",
      selectedCardInstanceIds: [handCard.instanceId],
    },
  });
  const trashSelection = must(
    paidHand.state.pendingDecision,
    "trash selection",
  );

  assert.equal(paidDon.errors, undefined);
  assert.equal(paidHand.errors, undefined);
  assert.equal(restDonDecision.type, "payCost");
  assert.equal(trashHandDecision.type, "payCost");
  assert.equal(trashSelection.type, "selectCards");
  assert.deepEqual(
    trashSelection.candidates.map((candidate) => candidate.card.instanceId),
    trashCards.map((card) => card.instanceId),
  );

  const selected = applyAction(paidHand.state, {
    type: "respondToDecision",
    decisionId: trashSelection.id,
    response: {
      type: "cards",
      cards: trashSelection.candidates
        .slice(0, 2)
        .map((candidate) => candidate.card),
    },
  });
  const afterP1 = must(selected.state.players[p1], "resolved p1");

  assert.equal(selected.errors, undefined);
  assert.equal(
    afterP1.trash.some((card) => card.instanceId === fieldCharacter.instanceId),
    true,
  );
  assert.deepEqual(
    afterP1.characters.map((card) => card.instanceId),
    trashCards.slice(0, 2).map((card) => card.instanceId),
  );
});
