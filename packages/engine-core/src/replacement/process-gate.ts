import type { GameState, ReplacementProcess } from "@optcg/types";

export const replacementAlreadyUsed = (
  process: ReplacementProcess,
  replacementId: string,
): boolean => process.usedReplacementIds.includes(replacementId);

export const markReplacementUsed = (
  process: ReplacementProcess,
  replacementId: string,
): ReplacementProcess =>
  replacementAlreadyUsed(process, replacementId)
    ? process
    : {
        ...process,
        usedReplacementIds: [...process.usedReplacementIds, replacementId],
      };

export const removeReplacementProcessState = (
  state: GameState,
  processId: ReplacementProcess["id"],
): GameState => ({
  ...state,
  replacementState: state.replacementState.filter(
    (candidate) => candidate.processId !== processId,
  ),
});

export const replacementStateWithProcess = (
  state: GameState,
  process: ReplacementProcess,
  payload: unknown,
): GameState["replacementState"] => [
  ...removeReplacementProcessState(state, process.id).replacementState,
  {
    processId: process.id,
    type: process.type,
    usedReplacementIds: [...process.usedReplacementIds],
    payload,
  },
];
