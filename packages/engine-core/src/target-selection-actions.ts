import type {
  Action,
  CardRef,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  SelectTargetsDecision,
  TargetCandidate,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "./action-results.js";
import { zonesEqual } from "./action-state.js";
import {
  continueSelectedTargetEffect,
  resolveImplementedDslEffectDefinition,
} from "./effect-runtime.js";
import { isUnsupportedSelectTargetsDecision } from "./effect-runtime-queue-target-decisions.js";
import { resumeSequenceFrameAfterSelectTargets } from "./effect-runtime-sequence-frames.js";
import { isSequenceFrameSelectTargetsDecision } from "./effect-runtime-sequence-select-targets.js";
import { assertGameStateInvariants } from "./invariants.js";
import { resolvePublicTargetCandidates } from "./target-selection.js";

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

const toErrorTuple = (
  errors: readonly EngineError[],
): readonly [EngineError, ...EngineError[]] => {
  const first = errors[0];
  if (first === undefined) {
    return [
      {
        type: "effectRuntimeError",
        effectId: "select-targets-continuation",
        details: { reason: "empty-runtime-error-list" },
      },
    ];
  }
  return [first, ...errors.slice(1)];
};

const cardRefMatches = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId &&
  ((left.zone === undefined && right.zone === undefined) ||
    (left.zone !== undefined && zonesEqual(left.zone, right.zone)));

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

const hasDuplicateTargets = (targets: readonly CardRef[]): boolean =>
  targets.some((target, index) =>
    targets
      .slice(index + 1)
      .some((candidate) => cardRefMatches(target, candidate)),
  );

const allTargetsInCandidates = (
  targets: readonly CardRef[],
  candidates: readonly TargetCandidate[],
): boolean =>
  targets.every((target) =>
    candidates.some((candidate) => cardRefMatches(target, candidate.card)),
  );

const currentCandidatesForDecision = (
  state: GameState,
  decision: SelectTargetsDecision,
): TargetCandidate[] | null => {
  const causedBy = decision.causedBy;
  if (causedBy.type !== "effect") {
    return null;
  }
  const entry = state.effectQueue.find(
    (candidate) => candidate.id === causedBy.queueEntryId,
  );
  if (entry === undefined) {
    return null;
  }
  const resolved = resolvePublicTargetCandidates(state, decision.request, {
    sourceControllerId: entry.controllerId,
  });
  return resolved.ok ? resolved.candidates : null;
};

const minimumRequiredTargetCount = (
  decision: SelectTargetsDecision,
  currentCandidateCount: number,
): number =>
  decision.request.allowFewerIfUnavailable &&
  currentCandidateCount < decision.request.min
    ? currentCandidateCount
    : decision.request.min;

const validateTargetsResponse = (
  state: GameState,
  decision: SelectTargetsDecision,
  targets: readonly CardRef[],
): EngineResult | undefined => {
  const currentCandidates = currentCandidatesForDecision(state, decision);
  if (currentCandidates === null) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Selected targets must be current legal targets."),
    );
  }
  const minimum = minimumRequiredTargetCount(
    decision,
    currentCandidates.length,
  );

  if (hasDuplicateTargets(targets)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Selected targets must not contain duplicates."),
    );
  }
  if (targets.length < minimum) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Selected target count is below the required minimum."),
    );
  }
  if (targets.length > decision.request.max) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Selected target count exceeds the allowed maximum."),
    );
  }
  if (!allTargetsInCandidates(targets, decision.candidates)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Selected targets must be active target candidates."),
    );
  }
  if (!allTargetsInCandidates(targets, currentCandidates)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Selected targets must be current legal targets."),
    );
  }
  return undefined;
};

export const getSelectTargetsLegalActions = (
  state: GameState,
  playerId: SelectTargetsDecision["playerId"],
): LegalAction[] => {
  const decision = state.pendingDecision;
  const isSequenceDecision =
    decision !== undefined &&
    decision.type === "selectTargets" &&
    isSequenceFrameSelectTargetsDecision(state, decision.id);
  if (
    decision === undefined ||
    decision.type !== "selectTargets" ||
    decision.playerId !== playerId ||
    (!isSequenceDecision &&
      isUnsupportedSelectTargetsDecision(
        state,
        decision,
        resolveImplementedDslEffectDefinition,
      ))
  ) {
    return [];
  }

  const currentCandidates = currentCandidatesForDecision(state, decision);
  if (currentCandidates === null) {
    return [];
  }
  const count = minimumRequiredTargetCount(decision, currentCandidates.length);
  if (count > decision.request.max || count > currentCandidates.length) {
    return [];
  }

  return [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "targets",
        targets: currentCandidates
          .slice(0, count)
          .map((candidate) => candidate.card),
      },
    },
  ];
};

export const applySelectTargetsDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (decision === undefined || decision.type !== "selectTargets") {
    return null;
  }
  if (action.response.type !== "targets") {
    return toEngineResult(
      state,
      [],
      invalidDecision("Response type must be targets for selectTargets."),
    );
  }

  const targets = (action.response as { targets?: unknown }).targets;
  if (!Array.isArray(targets)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Response targets must be an array."),
    );
  }
  if (!targets.every(isCardRef)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Response targets must be CardRef values."),
    );
  }
  const validation = validateTargetsResponse(state, decision, targets);
  if (validation !== undefined) {
    return validation;
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
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  if (isSequenceFrameSelectTargetsDecision(state, decision.id)) {
    const resumed = resumeSequenceFrameAfterSelectTargets(
      nextState,
      decision,
      targets,
    );
    if (resumed === undefined) {
      return null;
    }
    if (!resumed.ok) {
      return toEngineResult(state, [], [resumed.error]);
    }
    return toEngineResult(resumed.state, [...events, ...resumed.events]);
  }
  assertGameStateInvariants(nextState);
  const continuation = continueSelectedTargetEffect(
    nextState,
    decision,
    targets,
  );
  if (continuation.errors !== undefined) {
    return toEngineResult(state, [], toErrorTuple(continuation.errors));
  }
  return {
    ...continuation,
    events: [...events, ...continuation.events],
  };
};
