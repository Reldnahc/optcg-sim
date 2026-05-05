import assert from "node:assert/strict";
import { test } from "vitest";

import type { EngineEvent } from "@optcg/types";

import { applyRuleProcessingCheckpoint } from "./rule-processing.js";
import {
  must,
  p1,
  p2,
  toEngineEventId,
  toStateSeq,
} from "./action-test-fixtures.js";
import { setupAttackState } from "./battle-actions-test-fixtures.js";

test("terminal status is not overwritten by later rule-processing checks", () => {
  const state = setupAttackState();
  state.status = { type: "completed", winner: p2 };
  must(state.players[p1], "p1").deck = [];
  must(state.players[p2], "p2").deck = [];
  const before = JSON.stringify(state);
  const events: EngineEvent[] = [];

  const result = applyRuleProcessingCheckpoint({
    state,
    events,
    phase: "main",
    createEvent: (
      seqOffset,
      type,
      payload,
      visibility = { type: "public" },
    ) => ({
      id: toEngineEventId(
        `event:${String(state.seq)}:${String(seqOffset)}:${type}`,
      ),
      seq: state.eventJournal.length + seqOffset,
      type,
      payload,
      visibility,
      causedBy: { type: "ruleProcess", name: "test" },
      createdAtStateSeq: toStateSeq(state.seq + 1),
    }),
  });
  assert.equal(JSON.stringify(result), before);
  assert.deepEqual(result.status, { type: "completed", winner: p2 });
  assert.equal(
    events.some((event) => event.type === "gameEnded"),
    false,
  );
});
