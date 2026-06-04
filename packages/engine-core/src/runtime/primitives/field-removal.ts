import type {
  EngineError,
  EngineEvent,
  GameState,
  ReplacementProcess,
} from "@optcg/types";

import {
  detectSupportedFieldRemovalReplacementCandidate,
  normalizeFieldRemovalProcess,
  pauseFieldRemovalReplacementProcess,
} from "../../replacement/field-removal-process.js";
import {
  type FieldRemovalExecutionFailureReason,
  executeUnreplacedSelectedTargetFieldRemovalProcess,
  executeUnreplacedSelectedTargetKoProcess,
} from "../../replacement/unreplaced-field-removal.js";

export type SelectedTargetFieldRemovalExecutionFailureReason =
  FieldRemovalExecutionFailureReason;

export {
  executeUnreplacedSelectedTargetFieldRemovalProcess,
  executeUnreplacedSelectedTargetKoProcess,
};

export const executeSelectedTargetFieldRemovalReplacementProcess = (
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
  const currentProcess = normalizeFieldRemovalProcess(state, process);
  const detected = detectSupportedFieldRemovalReplacementCandidate(
    state,
    currentProcess,
  );
  if (!detected.ok) {
    return { error: detected.error };
  }
  const candidates =
    detected.candidates ??
    (detected.candidate === undefined ? [] : [detected.candidate]);
  if (candidates.length === 0) {
    return executeUnreplacedSelectedTargetFieldRemovalProcess(
      state,
      events,
      effectId,
      currentProcess,
    );
  }

  const paused = pauseFieldRemovalReplacementProcess(
    state,
    events,
    currentProcess,
    candidates,
  );
  return {
    ...paused,
    coveredTargets: candidates.flatMap(
      (candidate) => candidate.coveredTargets ?? [],
    ),
  };
};
