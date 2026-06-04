import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, EffectDefinition } from "@optcg/types";

import { applyAction } from "../actions.js";
import { reindexZoneCards } from "../actions/state.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  reviewedMainEventDrawDefinition,
} from "../action-test-fixtures.js";
import { applyPlayCard } from "./core.js";
import { setupMainPlayState } from "./test-fixtures.js";

test("zero-cost implemented-dsl Main Event rest-DON cost pauses for multi-target refresh lock", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const eventCard = must(p1State.hand[0], "event");
  const targets = p2State.hand.slice(0, 2).map(
    (card, index): CardInstance => ({
      ...card,
      zone: { zone: "characterArea", playerId: p2, slot: "character", index },
      state: "rested",
      attachedDon: [],
      turnPlayed: 1,
    }),
  );
  assert.equal(targets.length, 2);
  p2State.hand = reindexZoneCards(p2State.hand.slice(2), "hand", p2, "hand");
  p2State.characters = targets;
  for (const target of targets) {
    state.cardManifest.cards[target.cardId] = resolvedCard({
      cardId: target.cardId,
      category: "character",
      cost: 7,
      power: 5000,
    });
  }
  const implemented = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 0,
    effectText:
      "[Main] You may rest 2 of your DON!! cards: Up to 2 of your opponent's rested Characters with a cost of 7 or less will not become active in your opponent's next Refresh Phase.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-main-event-rest-don-refresh-lock",
    },
  });
  const definition = reviewedMainEventDrawDefinition(
    eventCard.cardId,
    implemented.support,
  );
  state.cardManifest.cards[eventCard.cardId] = implemented;
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = {
    "def-main-event-rest-don-refresh-lock": {
      ...definition,
      effects: [
        {
          ...must(definition.effects[0], "event effect"),
          id: "test:event-rest-don-refresh-lock" as EffectDefinition["effects"][number]["id"],
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: {
                  type: "payCost",
                  cost: {
                    type: "restDon",
                    count: 2,
                    chooser: "self",
                    optional: true,
                  },
                },
              },
              {
                connector: "ifYouDo",
                effect: {
                  type: "cannotBecomeActive",
                  target: {
                    type: "choose",
                    request: {
                      timing: "onResolution",
                      chooser: "self",
                      player: "opponent",
                      zone: "characterArea",
                      min: 0,
                      max: 2,
                      allowFewerIfUnavailable: true,
                      visibility: "public",
                      filter: {
                        categories: ["character"],
                        state: "rested",
                        cost: { max: 7 },
                      },
                    },
                  },
                  duration: {
                    type: "untilStartOfNextTurn",
                    player: "opponent",
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };

  const opened = applyPlayCard(state, {
    type: "playCard",
    cardInstanceId: eventCard.instanceId,
  });
  const costDecision = must(opened.state.pendingDecision, "rest DON decision");
  assert.equal(opened.errors, undefined);
  assert.equal(costDecision.type, "payCost");
  assert.equal(costDecision.cost.type, "restDon");

  const openedP1 = must(opened.state.players[p1], "opened p1");
  const paid = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: costDecision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: openedP1.costArea
        .slice(0, 2)
        .map((card) => card.instanceId),
    },
  });
  assert.equal(paid.errors, undefined);
  const targetDecision = must(
    paid.state.pendingDecision,
    "refresh-lock target decision",
  );

  assert.equal(targetDecision.type, "selectTargets");
  assert.equal(targetDecision.request.max, 2);
  assert.deepEqual(
    targetDecision.candidates.map((candidate) => candidate.card.instanceId),
    targets.map((target) => target.instanceId),
  );
});
