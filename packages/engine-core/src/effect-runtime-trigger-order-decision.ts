import type {
  DecisionId,
  EngineEvent,
  EngineResult,
  GameState,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "./action-results.js";
import type { EffectQueueGroup } from "./effect-runtime-queue/group-ordering.js";

export const createChooseTriggerOrderDecision = (
  state: GameState,
  earliestChoiceGroup: EffectQueueGroup,
): EngineResult => {
  const triggerIds = earliestChoiceGroup.entries.map((entry) => entry.id);
  const decisionId =
    `decision:chooseTriggerOrder:${earliestChoiceGroup.timingWindowId}:${String(
      earliestChoiceGroup.generation,
    )}:${earliestChoiceGroup.orderingGroup}:${earliestChoiceGroup.controllerId}` as DecisionId;
  const causedBy = {
    type: "ruleProcess",
    name: "effectRuntime:chooseTriggerOrder",
  } as const;
  const pendingDecision: NonNullable<GameState["pendingDecision"]> = {
    id: decisionId,
    type: "chooseTriggerOrder",
    playerId: earliestChoiceGroup.controllerId,
    prompt: "Choose next trigger to resolve.",
    causedBy,
    visibility: { type: "public" },
    triggerIds,
    constraints: { mustUseAll: true },
  };
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: pendingDecision.id,
      decisionType: pendingDecision.type,
      playerId: pendingDecision.playerId,
    },
    { type: "public" },
  );
  const created = events[0];
  if (created !== undefined) {
    created.causedBy = causedBy;
  }
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    pendingDecision,
    eventJournal: [...state.eventJournal, ...events],
  };
  return toEngineResult(nextState, events);
};
