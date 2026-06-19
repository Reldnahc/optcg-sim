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
} from "../action-test-fixtures.js";
import { setupAttackState } from "../battle/test-fixtures.js";

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

test("deck-out still loses immediately without a rule modifier", () => {
  const state = setupAttackState();
  must(state.players[p1], "p1").deck = [];
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

  assert.deepEqual(result.status, { type: "completed", winner: p2 });
  assert.equal(
    events.some((event) => event.type === "gameEnded"),
    true,
  );
});

test("deck-out loss modifier delays loss until end phase", () => {
  const state = setupAttackState();
  must(state.players[p1], "p1").deck = [];
  state.ruleModifiers = [
    { type: "deckOutLossTiming", playerId: p1, timing: "endOfTurn" },
  ];
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

  assert.deepEqual(result.status, { type: "active" });
  assert.deepEqual(result.pendingRuleLosses, [
    {
      type: "deckOut",
      playerId: p1,
      turn: state.turn.globalTurn,
    },
  ]);
  assert.equal(
    events.some((event) => event.type === "gameEnded"),
    false,
  );
});

test("deck-out win modifier wins immediately instead of being treated as delayed loss", () => {
  const state = setupAttackState();
  must(state.players[p1], "p1").deck = [];
  state.ruleModifiers = [{ type: "deckOutWin", playerId: p1 }];
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

  assert.deepEqual(result.status, { type: "completed", winner: p1 });
  assert.equal(result.pendingRuleLosses, undefined);
  assert.equal(
    events.some((event) => event.type === "gameEnded"),
    true,
  );
});

test("deck-out win modifier does not delay another player with no delayed-loss modifier", () => {
  const state = setupAttackState();
  must(state.players[p1], "p1").deck = [];
  state.ruleModifiers = [{ type: "deckOutWin", playerId: p2 }];
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

  assert.deepEqual(result.status, { type: "completed", winner: p2 });
  assert.equal(result.pendingRuleLosses, undefined);
});

test("delayed deck-out loss resolves at the end of that turn", () => {
  const state = setupAttackState();
  state.turn.phase = "end";
  state.ruleModifiers = [
    { type: "deckOutLossTiming", playerId: p1, timing: "endOfTurn" },
  ];
  state.pendingRuleLosses = [
    {
      type: "deckOut",
      playerId: p1,
      turn: state.turn.globalTurn,
    },
  ];
  const events: EngineEvent[] = [];

  const result = applyRuleProcessingCheckpoint({
    state,
    events,
    phase: "end",
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

  assert.deepEqual(result.status, { type: "completed", winner: p2 });
  assert.equal(
    events.some((event) => event.type === "gameEnded"),
    true,
  );
});
