import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  DecisionId,
  EffectId,
  QueueEntryId,
  TimingWindowId,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  toStateSeq,
} from "../action-test-fixtures.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

const toDecisionId = (value: string): DecisionId => value as DecisionId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;
const toTimingWindowId = (value: string): TimingWindowId =>
  value as TimingWindowId;

test("chooseTriggerOrder projection includes visible trigger source cards for the decision player", () => {
  const state = createActiveState();
  const source = must(state.players[p1], "p1 state").leader;
  const triggerId = toQueueEntryId("queue-visible-a");
  state.effectQueue.push({
    id: triggerId,
    state: "pending",
    timingWindowId: toTimingWindowId("timing-visible"),
    generation: 1,
    controllerId: p1,
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: p1,
      controllerId: p1,
      zone: source.zone,
      category: "leader",
      colors: ["red"],
      keywords: [],
    },
    effectBlockId: "effect-visible" as EffectId,
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 1,
    queuedAtStateSeq: toStateSeq(state.seq),
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "visible" },
  });
  state.pendingDecision = {
    id: toDecisionId("decision:choose-trigger-order-visible"),
    type: "chooseTriggerOrder",
    playerId: p1,
    prompt: "Choose next trigger to resolve.",
    causedBy: { type: "ruleProcess", name: "effectRuntime:chooseTriggerOrder" },
    visibility: { type: "public" },
    triggerIds: [triggerId],
    constraints: { mustUseAll: true },
  };

  const view = filterStateForPlayer(state, p1);

  assert.deepEqual(
    view.pendingDecision?.type === "chooseTriggerOrder"
      ? view.pendingDecision.choices
      : undefined,
    [
      {
        triggerId,
        source: {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: p1,
          zone: source.zone,
        },
      },
    ],
  );
});
