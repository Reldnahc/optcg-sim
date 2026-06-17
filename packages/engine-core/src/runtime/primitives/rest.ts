import type {
  CardId,
  CardRef,
  EngineError,
  EngineEvent,
  GameState,
  ReplacementProcess,
} from "@optcg/types";

import { restFieldObjects } from "../../effect-runtime-sequence/saved-field-object.js";
import {
  detectSupportedFieldRemovalReplacementCandidate,
  pauseFieldRemovalReplacementProcess,
} from "../../replacement/field-removal-process.js";
import {
  applyRestProtection,
  type FieldRemovalProtectionFailureReason,
  type RestProtectionAttempt,
} from "../../replacement/field-removal-protection.js";
import {
  fieldRemovalProcessTargets,
  withFieldRemovalProcessTargets,
} from "../../replacement/field-removal-targets.js";
import { findCardByInstanceId } from "../../replacement/primitives/source-lookup.js";

export type SelectedTargetRestExecutionFailureReason =
  | "unsupported-effect-shape"
  | FieldRemovalProtectionFailureReason;

interface SelectedTargetRestExecutionErrorDetails {
  reason: SelectedTargetRestExecutionFailureReason;
}

const selectedTargetRestExecutionError = (
  effectId: string,
  reason: SelectedTargetRestExecutionFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies SelectedTargetRestExecutionErrorDetails,
});

const restAttemptFromProcess = (
  process: ReplacementProcess,
): RestProtectionAttempt | null => {
  const payload = process.payload;
  if (
    process.type !== "rest" ||
    typeof payload !== "object" ||
    payload === null ||
    !("restAttempt" in payload)
  ) {
    return null;
  }
  const attempt = payload.restAttempt;
  if (
    typeof attempt !== "object" ||
    attempt === null ||
    !("sourceKind" in attempt) ||
    attempt.sourceKind !== "cardEffect" ||
    !("sourceControllerId" in attempt) ||
    typeof attempt.sourceControllerId !== "string"
  ) {
    return null;
  }
  const sourceCardId =
    "sourceCardId" in attempt && typeof attempt.sourceCardId === "string"
      ? (attempt.sourceCardId as CardId)
      : undefined;
  const sourceCardCategory =
    "sourceCardCategory" in attempt &&
    (attempt.sourceCardCategory === "leader" ||
      attempt.sourceCardCategory === "character" ||
      attempt.sourceCardCategory === "stage" ||
      attempt.sourceCardCategory === "event" ||
      attempt.sourceCardCategory === "don")
      ? attempt.sourceCardCategory
      : undefined;
  return {
    sourceKind: attempt.sourceKind,
    sourceControllerId:
      attempt.sourceControllerId as RestProtectionAttempt["sourceControllerId"],
    ...(sourceCardId === undefined ? {} : { sourceCardId }),
    ...(sourceCardCategory === undefined ? {} : { sourceCardCategory }),
  };
};

const applyRestProtectionToProcess = (
  state: GameState,
  effectId: string,
  process: ReplacementProcess,
):
  | { process: ReplacementProcess; targets: readonly CardRef[] }
  | { error: EngineError } => {
  const attempt = restAttemptFromProcess(process);
  if (attempt === null) {
    return {
      error: selectedTargetRestExecutionError(
        effectId,
        "unsupported-effect-shape",
      ),
    };
  }
  const restableTargets: CardRef[] = [];
  for (const target of fieldRemovalProcessTargets(process)) {
    const located = findCardByInstanceId(state, target.instanceId);
    if (located === null) {
      restableTargets.push(target);
      continue;
    }
    const protection = applyRestProtection(state, located.card, attempt);
    if (!protection.ok) {
      return {
        error: selectedTargetRestExecutionError(effectId, protection.reason),
      };
    }
    if (!protection.prevented) {
      restableTargets.push(target);
    }
  }
  return {
    process: withFieldRemovalProcessTargets(process, restableTargets),
    targets: restableTargets,
  };
};

export const executeUnreplacedSelectedTargetRestProcess = (
  state: GameState,
  events: EngineEvent[],
  effectId: string,
  process: ReplacementProcess,
): { state: GameState } | { error: EngineError } => {
  const attempt = restAttemptFromProcess(process);
  if (attempt === null) {
    return {
      error: selectedTargetRestExecutionError(
        effectId,
        "unsupported-effect-shape",
      ),
    };
  }
  const targets = fieldRemovalProcessTargets(process);
  if (targets.length === 0) {
    return { state };
  }
  const rested = restFieldObjects(state, targets, attempt, {
    events,
    sourceKind: "effect",
    sourceControllerId: attempt.sourceControllerId,
    ...(attempt.sourceCardId === undefined
      ? {}
      : { sourceCardId: attempt.sourceCardId }),
  });
  return { state: rested.state };
};

export const executeSelectedTargetRestReplacementProcess = (
  state: GameState,
  events: EngineEvent[],
  effectId: string,
  process: ReplacementProcess,
):
  | {
      state: GameState;
      paused?: true;
      coveredTargets?: readonly NonNullable<ReplacementProcess["target"]>[];
    }
  | { error: EngineError } => {
  const unprotected = applyRestProtectionToProcess(state, effectId, process);
  if ("error" in unprotected) {
    return { error: unprotected.error };
  }
  if (unprotected.targets.length === 0) {
    return { state };
  }
  const detected = detectSupportedFieldRemovalReplacementCandidate(
    state,
    unprotected.process,
  );
  if (!detected.ok) {
    return { error: detected.error };
  }
  const candidates =
    detected.candidates ??
    (detected.candidate === undefined ? [] : [detected.candidate]);
  if (candidates.length === 0) {
    return executeUnreplacedSelectedTargetRestProcess(
      state,
      events,
      effectId,
      unprotected.process,
    );
  }

  const paused = pauseFieldRemovalReplacementProcess(
    state,
    events,
    unprotected.process,
    candidates,
  );
  return {
    ...paused,
    coveredTargets: candidates.flatMap(
      (candidate) => candidate.coveredTargets ?? [],
    ),
  };
};
