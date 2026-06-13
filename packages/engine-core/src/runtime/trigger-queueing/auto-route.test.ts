import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEngineEventId,
} from "../../action-test-fixtures.js";
import { processEffectRuntime } from "../../effect-runtime.js";
import {
  toEffectId,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";

const setupActivatedLifeRemovedDefinition = (
  state: ReturnType<typeof createActiveState>,
): void => {
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "activated source"),
    zone: "characterArea",
  });
  p1State.hand = p1State.hand.filter(
    (card) => card.instanceId !== source.instanceId,
  );
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-activated-life-removed",
      rulesVersion: "activated-life-removed-rules",
      sourceTextHash: "activated-life-removed-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const definition: EffectDefinition = {
    ...baseDefinition,
    effects: [
      {
        ...must(baseDefinition.effects[0], "base draw effect"),
        id: toEffectId("activated-life-removed-draw"),
        category: "activate",
        trigger: { type: "lifeRemoved", players: ["self", "opponent"] },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "draw", count: 1, player: "self" },
            },
          ],
        },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-activated-life-removed": definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
};

test("automatic lifeRemoved queueing ignores activated lifeRemoved reactions", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  state.eventJournal = [];
  setupActivatedLifeRemovedDefinition(state);
  const before = must(state.players[p1], "p1 before");
  const movedLife = must(before.life[0], "life card").card;
  state.eventJournal.push({
    id: toEngineEventId("event:activated-life-removed:public"),
    seq: 1,
    type: "cardMoved",
    payload: {
      from: { zone: "life", playerId: p1, slot: "life", index: 0 },
      to: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
      reason: "moveCards",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "test:life-removed" },
    createdAtStateSeq: state.seq,
  });
  state.eventJournal.push({
    id: toEngineEventId("event:activated-life-removed:private"),
    seq: 2,
    type: "cardMoved",
    payload: {
      instanceId: movedLife.instanceId,
      cardId: movedLife.cardId,
      from: { zone: "life", playerId: p1, slot: "life", index: 0 },
      to: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
      reason: "moveCards",
    },
    visibility: { type: "private", playerId: p1 },
    causedBy: { type: "ruleProcess", name: "test:life-removed" },
    createdAtStateSeq: state.seq,
  });

  const queued = processEffectRuntime(state);

  assert.equal(queued.errors, undefined);
  assert.equal(queued.state.effectQueue.length, 0);
});
