import assert from "node:assert/strict";
import { test } from "vitest";

import type { GameState, ReplacementProcess } from "@optcg/types";

import { createActiveState } from "../action-test-fixtures.js";
import {
  markReplacementUsed,
  removeReplacementProcessState,
  replacementAlreadyUsed,
  replacementStateWithProcess,
} from "./process-gate.js";

const process = (): ReplacementProcess => ({
  id: "replacement-process:1",
  type: "ko",
  causedBy: { type: "ruleProcess", name: "test" },
  payload: {},
  usedReplacementIds: [],
});

test("replacementAlreadyUsed checks process-local replacement ids", () => {
  const current = { ...process(), usedReplacementIds: ["replacement:1"] };

  assert.equal(replacementAlreadyUsed(current, "replacement:1"), true);
  assert.equal(replacementAlreadyUsed(current, "replacement:2"), false);
});

test("markReplacementUsed appends without duplicating ids", () => {
  const first = markReplacementUsed(process(), "replacement:1");
  const second = markReplacementUsed(first, "replacement:1");

  assert.deepEqual(second.usedReplacementIds, ["replacement:1"]);
});

test("removeReplacementProcessState removes only the matching process", () => {
  const state: GameState = createActiveState();
  state.replacementState = [
    {
      processId: "replacement-process:1",
      type: "ko",
      payload: {},
      usedReplacementIds: [],
    },
    {
      processId: "replacement-process:2",
      type: "ko",
      payload: {},
      usedReplacementIds: [],
    },
  ];

  const next = removeReplacementProcessState(state, "replacement-process:1");

  assert.equal(next.replacementState.length, 1);
  assert.equal(next.replacementState[0]?.processId, "replacement-process:2");
});

test("replacementStateWithProcess replaces one process state with copied used ids", () => {
  const state: GameState = createActiveState();
  state.replacementState = [
    {
      processId: "replacement-process:1",
      type: "ko",
      payload: { stale: true },
      usedReplacementIds: [],
    },
  ];
  const current = markReplacementUsed(process(), "replacement:1");

  const replacementState = replacementStateWithProcess(state, current, {
    pending: true,
  });

  assert.deepEqual(replacementState, [
    {
      processId: "replacement-process:1",
      type: "ko",
      payload: { pending: true },
      usedReplacementIds: ["replacement:1"],
    },
  ]);
});
