import assert from "node:assert/strict";
import { test } from "vitest";

import type { EngineEvent, EngineEventId } from "@optcg/types";

import {
  createActiveState,
  queueDrawForP1,
  toDecisionId,
  toStateSeq,
} from "./test-support.js";
import { resolveQueuedQuantity } from "./quantity-resolution.js";

const decisionResolvedEvent = (
  entryId: string,
  quantity: number,
): EngineEvent => ({
  id: `event:quantity:${entryId}` as EngineEventId,
  seq: 1,
  type: "decisionResolved",
  payload: {
    decisionId: toDecisionId(`decision:chooseQuantity:${entryId}`),
    decisionType: "chooseQuantity",
    responseType: "chooseQuantity",
    quantity,
  },
  visibility: { type: "public" },
  createdAtStateSeq: toStateSeq(1),
});

test("resolveQueuedQuantity reads the latest matching chooseQuantity decision", () => {
  const state = createActiveState();
  const entry = queueDrawForP1();
  state.eventJournal = [
    decisionResolvedEvent(String(entry.id), 1),
    decisionResolvedEvent(String(entry.id), 2),
  ];

  assert.equal(resolveQueuedQuantity(state, entry, { min: 0, max: 3 }), 2);
});

test("resolveQueuedQuantity rejects out-of-bounds and wrong-decision events", () => {
  const state = createActiveState();
  const entry = queueDrawForP1();
  state.eventJournal = [
    decisionResolvedEvent("another-entry", 2),
    decisionResolvedEvent(String(entry.id), 4),
  ];

  assert.equal(
    resolveQueuedQuantity(state, entry, { min: 0, max: 3 }),
    undefined,
  );
});
