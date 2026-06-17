import assert from "node:assert/strict";
import { test } from "vitest";

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
