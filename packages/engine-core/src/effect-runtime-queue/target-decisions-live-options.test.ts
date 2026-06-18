import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  EffectQueueEntry,
  SelectTargetsDecision,
  TargetRequest,
} from "@optcg/types";

import { resolveImplementedDslEffectDefinition } from "../effect-runtime-definition-lookup.js";
import {
  applyAction,
  must,
  processEffectRuntime,
  targetSelectionQueueState,
  toEffectId,
} from "./test-support.js";
import { createEffectRuntimeQueueTargetDecisions } from "./target-decisions.js";

const liveOptions = {
  includeStateHash: false,
  validateInvariants: false,
} as const;

const createTargetDecisions = () =>
  createEffectRuntimeQueueTargetDecisions({
    resolveImplementedDslEffectDefinition,
    createUnsupportedPendingRuntimeWorkError: (work) => ({
      type: "effectRuntimeError",
      effectId: toEffectId("effect-runtime"),
      details: { reason: "unsupported-pending-runtime-work", work },
    }),
    queueBattleKOTriggers: (state) => ({ ok: true, state }),
    queueEffectResolvedCustomTriggers: () => undefined,
  });

test("target decision creation preserves omitted state hash", () => {
  const { state, entry, request } = targetSelectionQueueState();
  const targetDecisions = createTargetDecisions();

  const result = targetDecisions.createSelectTargetsDecisionForQueuedEffect(
    state,
    entry,
    request,
    {
      rollbackState: state,
      priorEvents: [],
      errorCount: state.effectQueue.length,
      ...liveOptions,
    },
  );

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision?.type, "selectTargets");
  assert.equal(result.stateHash, "");
});

test("live target decision response preserves omitted state hash", () => {
  const { state } = targetSelectionQueueState();
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectTargets");
  const selected = must(decision.candidates[0], "first target").card;

  const result = applyAction(
    paused.state,
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "targets", targets: [selected] },
    },
    liveOptions,
  );

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.stateHash, "");
  assert.equal(
    result.events.some((event) => event.type === "cardMoved"),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "effectResolved"),
    true,
  );
});

test("target request failure includes unsupported queue diagnostics", () => {
  const { state, entry, request } = targetSelectionQueueState();
  const targetDecisions = createTargetDecisions();
  const invalidRequest: TargetRequest = {
    ...request,
    chooser: "unsupported-chooser" as TargetRequest["chooser"],
  };

  const result = targetDecisions.createSelectTargetsDecisionForQueuedEffect(
    state,
    entry,
    invalidRequest,
    {
      rollbackState: state,
      priorEvents: [],
      errorCount: state.effectQueue.length,
      ...liveOptions,
    },
  );
  const firstError = result.errors?.[0] as
    | {
        details?: {
          work?: {
            gate?: string;
            queueReason?: string;
            queueEntryId?: string;
            effectId?: string;
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
    "unsupported-target-request",
  );
  assert.equal(firstError.details.work.queueEntryId, String(entry.id));
  assert.equal(firstError.details.work.effectId, String(entry.effectBlockId));
});

test("target request fallback redacts hidden source queue identity", () => {
  const { state, entry, request } = targetSelectionQueueState();
  const targetDecisions = createTargetDecisions();
  const hiddenEntry: EffectQueueEntry = {
    ...entry,
    source: {
      ...entry.source,
      zone: {
        zone: "life" as const,
        playerId: entry.controllerId,
        slot: "life" as const,
        index: 0,
      },
    },
  };
  const invalidRequest: TargetRequest = {
    ...request,
    chooser: "unsupported-chooser" as TargetRequest["chooser"],
  };

  const result = targetDecisions.createSelectTargetsDecisionForQueuedEffect(
    state,
    hiddenEntry,
    invalidRequest,
    {
      rollbackState: state,
      priorEvents: [],
      errorCount: state.effectQueue.length,
      ...liveOptions,
    },
  );
  const firstError = result.errors?.[0] as
    | {
        details?: {
          work?: {
            queueEntryId?: string;
            effectId?: string;
          };
        };
      }
    | undefined;

  assert.ok(firstError !== undefined);
  assert.ok(firstError.details !== undefined);
  assert.ok(firstError.details.work !== undefined);
  assert.equal(firstError.details.work.queueEntryId, undefined);
  assert.equal(firstError.details.work.effectId, undefined);
});

test("unsupported target continuation includes queue diagnostics", () => {
  const { state } = targetSelectionQueueState();
  const targetDecisions = createTargetDecisions();

  const result = targetDecisions.failUnsupportedTargetEffectContinuation(state);
  const firstError = result.errors?.[0] as
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
    "unsupported-target-continuation",
  );
});

test("failed selected target continuation includes safe queue identity", () => {
  const { state, entry } = targetSelectionQueueState();
  const targetDecisions = createTargetDecisions();
  const paused = processEffectRuntime(state);
  const decision = must(
    paused.state.pendingDecision,
    "selectTargets decision",
  ) as SelectTargetsDecision;
  const mismatchedDecision: SelectTargetsDecision = {
    ...decision,
    request: {
      ...decision.request,
      min: decision.request.min + 1,
    },
  };

  const result = targetDecisions.continueSelectedTargetEffect(
    paused.state,
    mismatchedDecision,
    [],
  );
  const firstError = result.errors?.[0] as
    | {
        details?: {
          work?: {
            queueReason?: string;
            queueEntryId?: string;
            effectId?: string;
          };
        };
      }
    | undefined;

  assert.ok(firstError !== undefined);
  assert.ok(firstError.details !== undefined);
  assert.ok(firstError.details.work !== undefined);
  assert.equal(
    firstError.details.work.queueReason,
    "unsupported-target-continuation",
  );
  assert.equal(firstError.details.work.queueEntryId, String(entry.id));
  assert.equal(firstError.details.work.effectId, String(entry.effectBlockId));
});
