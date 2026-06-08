import type { EngineEvent, GameState, ReplacementProcess } from "@optcg/types";

import { appendEvent, toDecisionId, toStateSeq } from "../../action-results.js";
import { replacementOptionLabel } from "../instead-effects.js";
import type { SelectedTargetKoReplacementCandidate } from "../primitives.js";

export const replacementCandidatesFromDetection = (detected: {
  candidate?: SelectedTargetKoReplacementCandidate;
  candidates?: readonly SelectedTargetKoReplacementCandidate[];
}): readonly SelectedTargetKoReplacementCandidate[] =>
  detected.candidates ??
  (detected.candidate === undefined ? [] : [detected.candidate]);

const isReplacementCandidateArray = (
  value:
    | SelectedTargetKoReplacementCandidate
    | readonly SelectedTargetKoReplacementCandidate[],
): value is readonly SelectedTargetKoReplacementCandidate[] =>
  Array.isArray(value);

export const pauseSelectedTargetKoReplacementProcess = (
  state: GameState,
  events: EngineEvent[],
  process: ReplacementProcess,
  candidatesInput:
    | SelectedTargetKoReplacementCandidate
    | readonly SelectedTargetKoReplacementCandidate[],
): { state: GameState; paused: true } => {
  const candidates = isReplacementCandidateArray(candidatesInput)
    ? candidatesInput
    : [candidatesInput];
  const firstCandidate = candidates[0];
  if (firstCandidate === undefined) {
    throw new Error("Replacement process pause requires a candidate.");
  }
  const pendingDecision: NonNullable<GameState["pendingDecision"]> = {
    id: toDecisionId(`decision:chooseReplacement:${process.id}`),
    type: "chooseReplacement",
    playerId: firstCandidate.controllerId,
    prompt: "Choose replacement effect.",
    causedBy: process.causedBy,
    visibility: { type: "private", playerId: firstCandidate.controllerId },
    processId: process.id,
    replacementIds: candidates.map((candidate) => candidate.id),
    replacementOptions: candidates.map((candidate) => ({
      replacementId: candidate.id,
      label: replacementOptionLabel(candidate),
      source: candidate.source,
    })),
    mandatory: false,
  };
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: pendingDecision.id,
      decisionType: pendingDecision.type,
      playerId: pendingDecision.playerId,
    },
    pendingDecision.visibility,
  );
  const created = events[events.length - 1];
  if (created !== undefined) {
    created.causedBy = process.causedBy;
  }

  return {
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision,
      replacementState: [
        ...state.replacementState.filter(
          (candidateState) => candidateState.processId !== process.id,
        ),
        {
          processId: process.id,
          type: process.type,
          usedReplacementIds: [...process.usedReplacementIds],
          payload: process.payload,
        },
      ],
      eventJournal: [...state.eventJournal, ...events],
    },
    paused: true,
  };
};

export const pauseFieldRemovalReplacementProcess =
  pauseSelectedTargetKoReplacementProcess;
