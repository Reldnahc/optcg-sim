import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectId, EngineEvent, QueueEntryId } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  toEngineEventId,
  toStateSeq,
} from "../action-test-fixtures.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

const withEvent = (
  state: ReturnType<typeof createActiveState>,
  seq: number,
  visibility: EngineEvent["visibility"],
): EngineEvent => ({
  id: toEngineEventId(`event:test:${String(seq)}`),
  seq,
  type: "decisionCreated",
  payload: { seq },
  visibility,
  createdAtStateSeq: toStateSeq(state.seq),
});

test("sanitizes player-visible effect lifecycle events without mutating the journal", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const source = {
    instanceId: p1State.leader.instanceId,
    cardId: p1State.leader.cardId,
    playerId: p1,
    zone: p1State.leader.zone,
  };
  const affected = [source];
  const queuedId = "queue-entry:visible:queued" as QueueEntryId;
  const resolvedId = "queue-entry:visible:resolved" as QueueEntryId;
  const effectId = "effect:test" as EffectId;
  const safeCausedBy = { type: "playerAction" as const, actionId: "action:1" };

  const effectQueued: EngineEvent = {
    id: toEngineEventId("event:effect-queued"),
    seq: 1,
    type: "effectQueued",
    actor: p1,
    source,
    affected,
    payload: {
      queueEntryId: queuedId,
      effectBlockId: effectId,
      triggerIds: [queuedId],
      sourceSnapshot: { cardId: source.cardId, instanceId: source.instanceId },
      orderedIds: [queuedId],
    },
    causedBy: { type: "effect", queueEntryId: queuedId, effectId },
    visibility: { type: "public" },
    createdAtStateSeq: toStateSeq(state.seq),
  };
  const effectResolved: EngineEvent = {
    id: toEngineEventId("event:effect-resolved"),
    seq: 2,
    type: "effectResolved",
    actor: p1,
    source,
    affected,
    payload: {
      queueEntryId: resolvedId,
      effectBlockId: effectId,
      result: "done",
    },
    causedBy: { type: "effect", queueEntryId: resolvedId, effectId },
    visibility: { type: "private", playerId: p1 },
    createdAtStateSeq: toStateSeq(state.seq),
  };
  const safeNonEffect: EngineEvent = {
    id: toEngineEventId("event:safe-non-effect"),
    seq: 3,
    type: "decisionResolved",
    actor: p1,
    payload: { status: "accepted" },
    causedBy: safeCausedBy,
    visibility: { type: "public" },
    createdAtStateSeq: toStateSeq(state.seq),
  };
  const contaminatedNonEffectCausedBy = {
    type: "ruleProcess",
    name: "runtime-contaminated-causality",
    queueEntryId: queuedId,
  } as unknown as NonNullable<EngineEvent["causedBy"]>;
  const unsafeNonEffectCausedBy: EngineEvent = {
    id: toEngineEventId("event:unsafe-non-effect-caused-by"),
    seq: 4,
    type: "decisionCreated",
    actor: p1,
    payload: { prompt: "Choose an option." },
    causedBy: contaminatedNonEffectCausedBy,
    visibility: { type: "public" },
    createdAtStateSeq: toStateSeq(state.seq),
  };
  const damageEvent: EngineEvent = {
    id: toEngineEventId("event:damage-continuation"),
    seq: 5,
    type: "damageDealt",
    actor: p1,
    payload: {
      amount: 1,
      damageProcess: {
        type: "multipleDamage",
        sourceKeyword: "doubleAttack",
        remainingDamagePoints: 1,
      },
      remainingDamagePoints: 1,
      sourceKeyword: "doubleAttack",
    },
    visibility: { type: "public" },
    createdAtStateSeq: toStateSeq(state.seq),
  };
  state.eventJournal = [
    effectQueued,
    effectResolved,
    safeNonEffect,
    unsafeNonEffectCausedBy,
    damageEvent,
    withEvent(state, 6, { type: "private", playerId: p2 }),
    withEvent(state, 7, { type: "hidden" }),
    withEvent(state, 8, { type: "replayOnly" }),
    withEvent(state, 9, { type: "serverOnly" }),
  ];
  const originalJournal = JSON.stringify(state.eventJournal);

  const view = filterStateForPlayer(state, p1);

  assert.deepEqual(view.events, [
    {
      id: effectQueued.id,
      seq: effectQueued.seq,
      type: "effectQueued",
      actor: effectQueued.actor,
      source: effectQueued.source,
      affected: effectQueued.affected,
      payload: { status: "queued" },
      visibility: effectQueued.visibility,
      createdAtStateSeq: effectQueued.createdAtStateSeq,
    },
    {
      id: effectResolved.id,
      seq: effectResolved.seq,
      type: "effectResolved",
      actor: effectResolved.actor,
      source: effectResolved.source,
      affected: effectResolved.affected,
      payload: { status: "resolved" },
      visibility: effectResolved.visibility,
      createdAtStateSeq: effectResolved.createdAtStateSeq,
    },
    safeNonEffect,
    {
      id: unsafeNonEffectCausedBy.id,
      seq: unsafeNonEffectCausedBy.seq,
      type: unsafeNonEffectCausedBy.type,
      actor: unsafeNonEffectCausedBy.actor,
      payload: unsafeNonEffectCausedBy.payload,
      visibility: unsafeNonEffectCausedBy.visibility,
      createdAtStateSeq: unsafeNonEffectCausedBy.createdAtStateSeq,
    },
    {
      id: damageEvent.id,
      seq: damageEvent.seq,
      type: damageEvent.type,
      actor: damageEvent.actor,
      payload: { amount: 1 },
      visibility: damageEvent.visibility,
      createdAtStateSeq: damageEvent.createdAtStateSeq,
    },
  ]);
  assert.equal(JSON.stringify(view.events).includes("queueEntryId"), false);
  assert.equal(JSON.stringify(view.events).includes("triggerIds"), false);
  assert.equal(JSON.stringify(view.events).includes("sourceSnapshot"), false);
  assert.equal(JSON.stringify(view.events).includes("orderedIds"), false);
  assert.equal(JSON.stringify(view.events).includes("damageProcess"), false);
  assert.equal(
    JSON.stringify(view.events).includes("remainingDamagePoints"),
    false,
  );
  assert.equal(JSON.stringify(view.events).includes("sourceKeyword"), false);
  assert.equal(JSON.stringify(state.eventJournal), originalJournal);
});
