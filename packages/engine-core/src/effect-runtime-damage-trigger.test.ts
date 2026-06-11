import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEngineEventId,
} from "./action-test-fixtures.js";
import { resolveSupportedVanillaBattle } from "./battle/actions.js";
import { processEffectRuntime } from "./effect-runtime.js";
import {
  toEffectId,
  toQueueEntryId,
} from "./effect-runtime-queue/test-support.js";

const setupDamageOrKoDefinition = (
  state: ReturnType<typeof createActiveState>,
): EffectDefinition => {
  const source = must(must(state.players[p1], "p1").leader, "p1 leader");
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-damage-or-ko",
      rulesVersion: "damage-trigger-rules",
      sourceTextHash: "damage-trigger-source",
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
        id: toEffectId("damage-or-ko-draw"),
        trigger: {
          type: "anyOf",
          triggers: [
            { type: "damageDealt", players: ["self"] },
            {
              type: "fieldRemoved",
              player: "self",
              filter: { categories: ["character"], power: { min: 6000 } },
              sourceKind: "ko",
            },
          ],
        },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-damage-or-ko": definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

test("damageDealt reactions queue from player damage events", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p2;
  state.eventJournal = [];
  setupDamageOrKoDefinition(state);
  state.eventJournal.push({
    id: toEngineEventId("event:damage-dealt:p1"),
    seq: 1,
    type: "damageDealt",
    payload: { damagedPlayerId: p1, amount: 1, reason: "battle" },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "test:damage" },
    createdAtStateSeq: state.seq,
  });

  const queued = processEffectRuntime(state);

  assert.equal(queued.errors, undefined);
  assert.equal(queued.state.effectQueue.length, 1);
  assert.equal(queued.state.effectQueue[0]?.effectBlockId, "damage-or-ko-draw");
  assert.equal(
    queued.events.map((event) => event.type).join(","),
    "effectQueued",
  );
});

test("battle leader damage resolves damageDealt reactions before battle returns", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p2;
  setupDamageOrKoDefinition(state);
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  state.cardManifest.cards[p2State.leader.cardId] = resolvedCard({
    cardId: p2State.leader.cardId,
    category: "leader",
    power: 7000,
  });
  const handBefore = p1State.hand.length;
  state.battle = {
    attacker: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
      zone: p2State.leader.zone,
    },
    originalTarget: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
      zone: p1State.leader.zone,
    },
    currentTarget: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
      zone: p1State.leader.zone,
    },
    step: "counter",
    damageCount: 1,
  };

  const result = resolveSupportedVanillaBattle(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(
    must(result.state.players[p1], "p1").hand.length,
    handBefore + 2,
  );
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "effectQueued" &&
        (event.payload as { effectBlockId?: unknown }).effectBlockId ===
          "damage-or-ko-draw",
    ),
    true,
  );
});

test("damageDealt reactions do not queue from non-damage Life movement", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p2;
  state.eventJournal = [];
  setupDamageOrKoDefinition(state);
  state.eventJournal.push({
    id: toEngineEventId("event:life-moved:not-damage"),
    seq: 1,
    type: "cardMoved",
    payload: {
      from: { zone: "life", playerId: p1, slot: "life", index: 0 },
      to: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
      reason: "moveCards",
    },
    visibility: { type: "public" },
    causedBy: {
      type: "effect",
      queueEntryId: toQueueEntryId("queue:test"),
      effectId: toEffectId("effect:test"),
    },
    createdAtStateSeq: state.seq,
  });

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(result.events.length, 0);
});

test("fieldRemoved reactions queue from matching K.O. events", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p2;
  state.eventJournal = [];
  setupDamageOrKoDefinition(state);
  const removed = must(must(state.players[p1], "p1").hand[0], "removed card");
  state.cardManifest.cards[removed.cardId] = resolvedCard({
    cardId: removed.cardId,
    category: "character",
    power: 6000,
  });
  state.eventJournal.push({
    id: toEngineEventId("event:character-ko-move"),
    seq: 1,
    type: "cardMoved",
    payload: {
      instanceId: removed.instanceId,
      cardId: removed.cardId,
      from: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 0,
      },
      to: { zone: "trash", playerId: p1, slot: "trash", index: 0 },
      reason: "ko",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "test:ko" },
    createdAtStateSeq: state.seq,
  });

  const queued = processEffectRuntime(state);

  assert.equal(queued.errors, undefined);
  assert.equal(queued.state.effectQueue.length, 1);
  assert.equal(queued.state.effectQueue[0]?.effectBlockId, "damage-or-ko-draw");
});
