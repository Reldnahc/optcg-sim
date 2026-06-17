import assert from "node:assert/strict";
import { test } from "vitest";

import {
  applyAction,
  createActiveState,
  must,
  p1,
  processEffectRuntime,
  queueDrawForP1,
  targetSelectionQueueState,
  toDecisionId,
  toEffectId,
  toInstanceId,
} from "./effect-runtime-queue/test-support.js";

test("live selectTargets response can omit state hash and invariant validation", () => {
  const { state } = targetSelectionQueueState();
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectTargets");
  paused.state.oncePerTurn = [
    {
      cardInstanceId: toInstanceId("duplicate-usage-card"),
      effectId: toEffectId("duplicate-usage-effect"),
      turnNumber: paused.state.turn.globalTurn,
      usedAtStateSeq: paused.state.seq,
    },
    {
      cardInstanceId: toInstanceId("duplicate-usage-card"),
      effectId: toEffectId("duplicate-usage-effect"),
      turnNumber: paused.state.turn.globalTurn,
      usedAtStateSeq: paused.state.seq,
    },
  ];

  const selected = must(decision.candidates[0], "target candidate").card;
  const result = applyAction(
    paused.state,
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "targets", targets: [selected] },
    },
    {
      includeStateHash: false,
      validateInvariants: false,
    },
  );

  assert.equal(result.errors, undefined);
  assert.equal(result.stateHash, "");
});

test("live optional activation decline preserves omitted state hash", () => {
  const state = createActiveState();
  const entry = queueDrawForP1();
  state.effectQueue = [entry];
  state.pendingDecision = {
    id: toDecisionId("decision:optional-live-options"),
    type: "chooseOptionalActivation",
    playerId: p1,
    prompt: "Activate this effect?",
    causedBy: {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    },
    visibility: { type: "private", playerId: p1 },
    effectId: entry.effectBlockId,
    source: entry.source,
    options: ["activate", "decline"],
  };

  const result = applyAction(
    state,
    {
      type: "respondToDecision",
      decisionId: state.pendingDecision.id,
      response: { type: "optionalActivation", choice: "decline" },
    },
    {
      includeStateHash: false,
      validateInvariants: false,
    },
  );

  assert.equal(result.errors, undefined);
  assert.equal(result.stateHash, "");
});
