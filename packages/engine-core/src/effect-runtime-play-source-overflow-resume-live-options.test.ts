import assert from "node:assert/strict";
import { test } from "vitest";

import type { SelectCardsDecision } from "@optcg/types";

import { toDecisionId, toEngineResult } from "./action-results.js";
import { resumePlaySourceOverflowDecision } from "./effect-runtime-play-source-overflow-resume.js";
import {
  createActiveState,
  p1,
  queueDrawForP1,
  toEffectId,
} from "./effect-runtime-queue/test-support.js";

const liveOptions = {
  includeStateHash: false,
  validateInvariants: false,
} as const;

test("play-source overflow resume preserves omitted state hash", () => {
  const originalState = createActiveState();
  const entry = queueDrawForP1();
  originalState.effectQueue = [entry];
  const decision: SelectCardsDecision = {
    id: toDecisionId("decision:overflow"),
    type: "selectCards",
    playerId: p1,
    prompt: "Choose a character to remove.",
    causedBy: {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    },
    visibility: { type: "public" },
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "self",
      zone: "characterArea",
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
    },
    candidates: [],
    runtime: {
      playSourceOverflow: {
        queueEntryId: entry.id,
        source: entry.source,
        enterRested: false,
      },
    },
  };
  const playCardResult = toEngineResult(
    originalState,
    [],
    undefined,
    liveOptions,
  );
  const result = resumePlaySourceOverflowDecision({
    originalState,
    decision,
    playCardResult,
    createUnsupportedPendingRuntimeWorkError: (work) => ({
      type: "effectRuntimeError",
      effectId: toEffectId("effect-runtime"),
      details: { reason: "unsupported-pending-runtime-work", work },
    }),
    queueEffectResolvedCustomTriggers: () => undefined,
    options: liveOptions,
  });

  assert.ok(result !== undefined);
  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(result.stateHash, "");
});

test("play-source overflow missing queue entry includes unsupported queue diagnostics", () => {
  const originalState = createActiveState();
  const entry = queueDrawForP1();
  const decision: SelectCardsDecision = {
    id: toDecisionId("decision:overflow"),
    type: "selectCards",
    playerId: p1,
    prompt: "Choose a character to remove.",
    causedBy: {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    },
    visibility: { type: "public" },
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "self",
      zone: "characterArea",
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
    },
    candidates: [],
    runtime: {
      playSourceOverflow: {
        queueEntryId: entry.id,
        source: entry.source,
        enterRested: false,
      },
    },
  };
  const result = resumePlaySourceOverflowDecision({
    originalState,
    decision,
    playCardResult: toEngineResult(originalState, [], undefined, liveOptions),
    createUnsupportedPendingRuntimeWorkError: (work) => ({
      type: "effectRuntimeError",
      effectId: toEffectId("effect-runtime"),
      details: { reason: "unsupported-pending-runtime-work", work },
    }),
    queueEffectResolvedCustomTriggers: () => undefined,
    options: liveOptions,
  });
  const firstError = result?.errors?.[0] as
    | {
        details?: {
          work?: {
            gate?: string;
            queueReason?: string;
          };
        };
      }
    | undefined;

  assert.ok(firstError !== undefined);
  assert.ok(firstError.details !== undefined);
  assert.ok(firstError.details.work !== undefined);
  assert.equal(firstError.details.work.gate, "queue-entry-resolution");
  assert.equal(
    firstError.details.work.queueReason,
    "play-source-overflow-entry-missing",
  );
});
