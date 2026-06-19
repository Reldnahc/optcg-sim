import assert from "node:assert/strict";
import { test } from "vitest";

import type { Condition, EngineEvent } from "@optcg/types";

import {
  createActiveState,
  p1,
  queueDrawForP1,
  toEngineEventId,
  toStateSeq,
} from "../../effect-runtime-queue/test-support.js";
import {
  evaluateQueuedEffectCondition,
  isSupportedQueuedEffectConditionShape,
} from "./evaluator.js";

const cardDrawnBySourceEvent = (
  state: ReturnType<typeof createActiveState>,
  entry: ReturnType<typeof queueDrawForP1>,
): EngineEvent => ({
  id: toEngineEventId("event:drawn-by-source"),
  seq: state.eventJournal.length + 1,
  type: "cardDrawn",
  payload: {
    playerId: p1,
    turnNumber: state.turn.globalTurn,
    sourceInstanceId: entry.source.instanceId,
    sourceCardId: entry.source.cardId,
    sourceCategory: "leader",
  },
  visibility: { type: "public" },
  causedBy: {
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  },
  createdAtStateSeq: toStateSeq(state.seq),
});

test("eventHistory can count cardDrawn events produced by this source effect", () => {
  const state = createActiveState();
  const entry = queueDrawForP1();
  const condition = {
    type: "eventHistory",
    event: "cardDrawn",
    player: "self",
    window: "thisTurn",
    sourceTarget: "self",
    sourceFilter: { categories: ["leader"] },
    op: "eq",
    value: 0,
  } as unknown as Condition;

  assert.equal(isSupportedQueuedEffectConditionShape(condition), true);
  assert.deepEqual(evaluateQueuedEffectCondition(state, entry, condition), {
    supported: true,
    passed: true,
  });

  state.eventJournal = [
    {
      ...cardDrawnBySourceEvent(state, entry),
      id: toEngineEventId("event:drawn-by-other-source"),
      payload: {
        playerId: p1,
        turnNumber: state.turn.globalTurn,
        sourceInstanceId: "other-source-instance",
        sourceCardId: "OP01-999",
        sourceCategory: "leader",
      },
    },
  ];
  assert.deepEqual(evaluateQueuedEffectCondition(state, entry, condition), {
    supported: true,
    passed: true,
  });

  state.eventJournal = [cardDrawnBySourceEvent(state, entry)];
  assert.deepEqual(evaluateQueuedEffectCondition(state, entry, condition), {
    supported: true,
    passed: false,
  });
});
