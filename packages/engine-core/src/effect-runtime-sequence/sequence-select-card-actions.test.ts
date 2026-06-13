import assert from "node:assert/strict";
import { test } from "vitest";

import type { Effect, SelectionId, SelectionSetId } from "@optcg/types";

import {
  applyAction,
  getLegalActions,
  must,
  p1,
  processEffectRuntime,
} from "../effect-runtime-queue/test-support.js";
import { sequenceQueueState } from "./search-reveal-test-support.js";

const revealThenSelectFromSetSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => {
  const lookedSet = "set:bot-search-candidates" as SelectionSetId;
  const selection = "revealSelection:bot-search" as SelectionId;
  return {
    type: "sequence",
    effects: [
      {
        id: "reveal-search-cards",
        connector: "always",
        effect: {
          type: "revealTop",
          player: "self",
          zone: "deck",
          count: 3,
          saveAs: lookedSet,
          visibility: "chooserOnly",
        },
      },
      {
        id: "choose-search-card",
        connector: "then",
        effect: {
          type: "selectFromSet",
          set: lookedSet,
          chooser: "self",
          min: 0,
          max: 1,
          filter: {},
          saveAs: selection,
        },
      },
      {
        id: "add-search-card",
        connector: "ifPreviousSucceeded",
        effect: {
          type: "moveSelected",
          selection,
          from: lookedSet,
          to: "hand",
        },
      },
    ],
  };
};

test("sequence select-card pauses expose a legal action for automated players", () => {
  const { state } = sequenceQueueState(revealThenSelectFromSetSequence(), 3);
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pending decision");
  assert.equal(paused.errors, undefined);
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.request.set, "set:bot-search-candidates");

  const actions = getLegalActions(paused.state, p1).filter(
    (action) =>
      action.type === "respondToDecision" && action.decisionId === decision.id,
  );

  assert.equal(actions.length, 1);
  const action = must(actions[0], "sequence select action");
  assert.equal(action.type, "respondToDecision");
  assert.equal(action.response.type, "cards");
  assert.deepEqual(
    action.response.cards.map((card) => card.instanceId),
    decision.candidates
      .slice(0, decision.request.max)
      .map((candidate) => candidate.card.instanceId),
  );
  const resolved = applyAction(paused.state, action);
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
});
