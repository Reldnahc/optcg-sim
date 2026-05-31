import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, GameState } from "@optcg/types";

import {
  applyAction,
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  toEffectId,
  reviewedOnPlayDrawDefinition,
} from "./effect-runtime-queue-processing-test-support.js";

const setupEndOfTurnDonActivationDefinition = (
  state: GameState,
): EffectDefinition => {
  const source = must(state.players[p1], "p1").leader;
  const effectDefinitionId = "def-end-of-your-turn-don-active";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "end-of-your-turn-rules",
      sourceTextHash: "end-of-your-turn-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-end-of-your-turn-don-active"),
        trigger: { type: "endOfYourTurn" },
        effect: {
          type: "sequence",
          effects: [
            {
              id: "select-don",
              connector: "always",
              saveResultAs: "selectedDon",
              effect: {
                type: "selectTargets",
                request: {
                  timing: "onResolution",
                  chooser: "self",
                  zone: "costArea",
                  player: "self",
                  min: 0,
                  max: 1,
                  allowFewerIfUnavailable: true,
                  visibility: "public",
                  filter: { categories: ["don"], state: "rested" },
                },
              },
            },
            {
              id: "activate-don",
              connector: "then",
              effect: {
                type: "activate",
                target: {
                  type: "savedFieldObject",
                  binding: {
                    family: "selectedTargets",
                    saveResultAs: "selectedDon",
                  },
                  zone: "costArea",
                  player: "self",
                  visibility: "publicOnly",
                  onFailure: "failClosed",
                },
              },
            },
          ],
        },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

test("end-of-your-turn trigger queues reusable DON activation before turn handoff", () => {
  const state = createActiveState();
  state.turn.phase = "main";
  state.turn.turnPlayerId = p1;
  setupEndOfTurnDonActivationDefinition(state);
  const player = must(state.players[p1], "p1");
  const restedDon = must(player.donDeck[0], "don");
  player.donDeck = player.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  player.costArea = [
    {
      ...restedDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "rested",
    },
  ];
  state.cardManifest.cards[restedDon.cardId] = resolvedCard({
    cardId: restedDon.cardId,
    category: "don",
  });

  const queued = applyAction(state, { type: "endMainPhase" });

  assert.equal(queued.errors, undefined);
  assert.equal(queued.state.turn.phase, "end");
  const decision = must(queued.state.pendingDecision, "DON selection");
  assert.equal(decision.type, "selectTargets");
  assert.equal(decision.playerId, p1);
  assert.equal(decision.candidates.length, 1);

  const resolved = applyAction(queued.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: [must(decision.candidates[0], "candidate").card],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.turn.phase, "refresh");
  assert.equal(resolved.state.turn.turnPlayerId, p2);
  const activated = must(resolved.state.players[p1], "p1 after").costArea.find(
    (card) => card.instanceId === restedDon.instanceId,
  );
  assert.equal(activated?.state, "active");
});
