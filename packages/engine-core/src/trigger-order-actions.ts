import type {
  Action,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "./action-results.js";
import { processEffectRuntimeAfterTriggerOrderChoice } from "./effect-runtime.js";

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

const hasExactIds = (
  expectedIds: readonly string[],
  receivedIds: readonly string[],
): boolean => {
  if (expectedIds.length !== receivedIds.length) {
    return false;
  }
  if (new Set(receivedIds).size !== receivedIds.length) {
    return false;
  }
  const expected = new Set(expectedIds);
  return receivedIds.every((id) => expected.has(id));
};

const resolveCurrentGroupEntries = (
  state: GameState,
  ids: readonly string[],
): GameState["effectQueue"] | null => {
  const queueById = new Map<string, GameState["effectQueue"][number]>(
    state.effectQueue.map((entry) => [entry.id, entry]),
  );
  const entries: GameState["effectQueue"] = [];
  for (const id of ids) {
    const entry = queueById.get(id);
    if (entry === undefined) {
      return null;
    }
    entries.push(entry);
  }
  const first = entries[0];
  if (first === undefined) {
    return null;
  }
  if (entries.some((entry) => entry.state !== "pending")) {
    return null;
  }
  const currentGroupIds = state.effectQueue
    .filter(
      (entry) =>
        entry.state === "pending" &&
        entry.timingWindowId === first.timingWindowId &&
        entry.generation === first.generation &&
        entry.controllerId === first.controllerId &&
        entry.orderingGroup === first.orderingGroup,
    )
    .map((entry) => entry.id);
  if (!hasExactIds(ids, currentGroupIds)) {
    return null;
  }
  const isSameGroup = entries.every(
    (entry) =>
      entry.timingWindowId === first.timingWindowId &&
      entry.generation === first.generation &&
      entry.controllerId === first.controllerId &&
      entry.orderingGroup === first.orderingGroup,
  );
  if (!isSameGroup) {
    return null;
  }
  return entries;
};

const reorderSelectedTriggerGroup = (
  queue: readonly GameState["effectQueue"][number][],
  orderedIds: readonly string[],
): GameState["effectQueue"] => {
  const orderedIdSet = new Set(orderedIds);
  const selectedById = new Map<string, GameState["effectQueue"][number]>(
    queue
      .filter((entry) => orderedIdSet.has(entry.id))
      .map((entry) => [entry.id, entry]),
  );
  const selected = orderedIds
    .map((id) => selectedById.get(id))
    .filter((entry) => entry !== undefined);
  const firstSelectedIndex = queue.findIndex((entry) =>
    orderedIdSet.has(entry.id),
  );
  if (firstSelectedIndex < 0) {
    return [...queue];
  }

  const result: GameState["effectQueue"] = [];
  let inserted = false;
  for (const entry of queue) {
    if (!inserted && result.length === firstSelectedIndex) {
      result.push(...selected);
      inserted = true;
    }
    if (!orderedIdSet.has(entry.id)) {
      result.push(entry);
    }
  }
  if (!inserted) {
    result.push(...selected);
  }
  return result;
};

export const applyChooseTriggerOrderDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (decision === undefined || decision.type !== "chooseTriggerOrder") {
    return null;
  }
  if (action.response.type !== "orderedIds") {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "Response type must be orderedIds for chooseTriggerOrder.",
      ),
    );
  }

  if (!hasExactIds(decision.triggerIds, action.response.ids)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("orderedIds must exactly match triggerIds."),
    );
  }
  const currentGroupEntries = resolveCurrentGroupEntries(
    state,
    decision.triggerIds,
  );
  if (currentGroupEntries === null) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "chooseTriggerOrder triggerIds are stale for current effectQueue.",
      ),
    );
  }
  const decisionIdsByResponseId = new Map<
    string,
    GameState["effectQueue"][number]["id"]
  >(currentGroupEntries.map((entry) => [entry.id, entry.id]));
  const orderedIds: GameState["effectQueue"][number]["id"][] = [];
  for (const responseId of action.response.ids) {
    const queueEntryId = decisionIdsByResponseId.get(responseId);
    if (queueEntryId === undefined) {
      return toEngineResult(
        state,
        [],
        invalidDecision("orderedIds must exactly match triggerIds."),
      );
    }
    orderedIds.push(queueEntryId);
  }

  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionResolved",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
      responseType: action.response.type,
    },
    { type: "public" },
  );
  const resolved = events[0];
  if (resolved !== undefined) {
    resolved.causedBy = { type: "decision", decisionId: decision.id };
  }

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    effectQueue: reorderSelectedTriggerGroup(state.effectQueue, orderedIds),
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  const resumed = processEffectRuntimeAfterTriggerOrderChoice(
    nextState,
    orderedIds,
  );
  return {
    ...resumed,
    events: [...events, ...resumed.events],
  };
};
