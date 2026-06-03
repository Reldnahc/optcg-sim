import type {
  Action,
  CardRef,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
  ReplacementProcess,
  ReplacementProcessState,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "../action-results.js";
import { finalizeBattleAfterReplacementResolution } from "../battle/actions.js";
import {
  executeAcceptedFieldRemovalReplacementProcess,
  finalizeSelectedTargetEffectResolution,
} from "../effect-runtime.js";
import { executeUnreplacedSelectedTargetFieldRemovalProcess } from "../runtime/primitives/execute.js";
import { hasSequenceFrameForDecision } from "../effect-runtime-sequence/frame-decisions.js";
import { isReplacementContinuationDecision } from "./decision-actions.js";
import {
  getRespondingPlayerId,
  hasMalformedRespondToDecisionPlayerId,
} from "../actions/responding-player.js";

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

const isCardRef = (value: unknown): value is CardRef => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const zone = candidate["zone"];
  return (
    typeof candidate["instanceId"] === "string" &&
    typeof candidate["cardId"] === "string" &&
    typeof candidate["playerId"] === "string" &&
    (zone === undefined || (typeof zone === "object" && zone !== null))
  );
};

const effectIdFromStoredReplacementPayload = (
  payload: unknown,
  fallback: string,
): string => {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "effectId" in payload &&
    typeof payload.effectId === "string"
  ) {
    return payload.effectId;
  }
  return fallback;
};

const queueEntryIdFromStoredReplacementPayload = (
  payload: unknown,
): string | undefined => {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "queueEntryId" in payload &&
    typeof payload.queueEntryId === "string"
  ) {
    return payload.queueEntryId;
  }
  return undefined;
};

const hasBattleKoReplacementContinuation = (payload: unknown): boolean => {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("battleContinuation" in payload)
  ) {
    return false;
  }
  const continuation = payload.battleContinuation;
  return (
    typeof continuation === "object" &&
    continuation !== null &&
    "type" in continuation &&
    continuation.type === "endBattleAfterCharacterKoAttempt"
  );
};

const replacementProcessFromState = (
  decision: Extract<
    NonNullable<GameState["pendingDecision"]>,
    { type: "chooseReplacement" }
  >,
  processState: ReplacementProcessState,
): ReplacementProcess | null => {
  const payload = processState.payload;
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const source = "source" in payload ? payload.source : undefined;
  const target = "target" in payload ? payload.target : undefined;
  if (source !== undefined && !isCardRef(source)) {
    return null;
  }
  if (target !== undefined && !isCardRef(target)) {
    return null;
  }
  return {
    id: processState.processId,
    type: processState.type,
    ...(source === undefined ? {} : { source }),
    ...(target === undefined ? {} : { target }),
    payload,
    causedBy: decision.causedBy,
    usedReplacementIds: [...processState.usedReplacementIds],
  };
};

export const getChooseReplacementLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "chooseReplacement" ||
    decision.playerId !== playerId
  ) {
    return [];
  }
  return [
    ...(decision.mandatory
      ? []
      : [
          {
            type: "respondToDecision" as const,
            decisionId: decision.id,
            response: { type: "replacement" as const },
          },
        ]),
    ...decision.replacementIds.map(
      (replacementId): LegalAction => ({
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "replacement", replacementId },
      }),
    ),
  ];
};

export const applyChooseReplacementDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (decision === undefined || decision.type !== "chooseReplacement") {
    return null;
  }
  if (hasMalformedRespondToDecisionPlayerId(action)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Player does not match current pending decision."),
    );
  }
  if (getRespondingPlayerId(action, decision.playerId) !== decision.playerId) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Player does not match current pending decision."),
    );
  }

  const response: unknown = action.response;
  if (typeof response !== "object" || response === null) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Response must be an object for chooseReplacement."),
    );
  }
  const responseType = (response as { type?: unknown }).type;
  if (responseType !== "replacement") {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "Response type must be replacement for chooseReplacement.",
      ),
    );
  }

  const replacementId = (response as { replacementId?: unknown }).replacementId;
  if (replacementId !== undefined && typeof replacementId !== "string") {
    return toEngineResult(
      state,
      [],
      invalidDecision("replacementId must be a string."),
    );
  }
  if (replacementId !== undefined) {
    if (!decision.replacementIds.includes(replacementId)) {
      return toEngineResult(
        state,
        [],
        invalidDecision("replacementId must match an available replacement."),
      );
    }
  }
  if (decision.mandatory && replacementId === undefined) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Mandatory replacement decisions cannot be declined."),
    );
  }

  const storedProcess = state.replacementState.find(
    (processState) => processState.processId === decision.processId,
  );
  if (storedProcess === undefined) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "chooseReplacement decision is stale for current replacement process.",
      ),
    );
  }
  const process = replacementProcessFromState(decision, storedProcess);
  if (process === null) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "chooseReplacement decision is stale for current replacement process.",
      ),
    );
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
    decision.visibility,
  );
  const resolved = events[0];
  if (resolved !== undefined) {
    resolved.causedBy = { type: "decision", decisionId: decision.id };
  }

  const processState: GameState = {
    ...state,
    replacementState: state.replacementState.filter(
      (candidate) => candidate.processId !== decision.processId,
    ),
  };
  delete processState.pendingDecision;
  const queuedEntryId = queueEntryIdFromStoredReplacementPayload(
    storedProcess.payload,
  );
  const queuedEntry =
    queuedEntryId === undefined
      ? undefined
      : state.effectQueue.find((entry) => entry.id === queuedEntryId);
  const shouldResumeSequence = hasSequenceFrameForDecision(state, decision.id);
  const shouldFinalizeBattle =
    queuedEntry === undefined &&
    hasBattleKoReplacementContinuation(storedProcess.payload);

  if (replacementId !== undefined) {
    const applied = executeAcceptedFieldRemovalReplacementProcess(
      processState,
      events,
      effectIdFromStoredReplacementPayload(storedProcess.payload, decision.id),
      process,
      replacementId,
    );
    if ("error" in applied) {
      return toEngineResult(state, [], [applied.error]);
    }
    const nextState = {
      ...applied.state,
      actionSeq: state.actionSeq + 1,
    };
    if (
      nextState.pendingDecision !== undefined &&
      isReplacementContinuationDecision(nextState, nextState.pendingDecision)
    ) {
      return toEngineResult(nextState, events);
    }
    if (shouldFinalizeBattle) {
      return finalizeBattleAfterReplacementResolution(state, nextState, events);
    }
    return queuedEntry === undefined
      ? toEngineResult(nextState, events)
      : shouldResumeSequence
        ? toEngineResult(nextState, events)
        : finalizeSelectedTargetEffectResolution(
            nextState,
            state,
            queuedEntry,
            events,
            events.slice(1),
          );
  }

  const unreplaced = executeUnreplacedSelectedTargetFieldRemovalProcess(
    processState,
    events,
    effectIdFromStoredReplacementPayload(storedProcess.payload, decision.id),
    process,
  );
  if ("error" in unreplaced) {
    return toEngineResult(state, [], [unreplaced.error]);
  }

  const nextState: GameState = {
    ...unreplaced.state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    eventJournal: [...state.eventJournal, ...events],
  };
  if (shouldFinalizeBattle) {
    return finalizeBattleAfterReplacementResolution(state, nextState, events);
  }
  return queuedEntry === undefined
    ? toEngineResult(nextState, events)
    : shouldResumeSequence
      ? toEngineResult(nextState, events)
      : finalizeSelectedTargetEffectResolution(
          nextState,
          state,
          queuedEntry,
          events,
          events.slice(1),
        );
};
