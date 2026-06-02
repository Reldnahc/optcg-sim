import type { GameState, LegalAction, PlayerId } from "@optcg/types";

import {
  getReplacementRestTargetLegalActions,
  isReplacementRestTargetsDecision,
} from "./rest-target-decision.js";
import {
  getReplacementTrashFromHandLegalActions,
  isReplacementTrashFromHandDecision,
} from "./trash-from-hand-actions.js";

export const isReplacementContinuationDecision = (
  state: GameState,
  decision: NonNullable<GameState["pendingDecision"]> | undefined,
): boolean =>
  isReplacementRestTargetsDecision(state, decision) ||
  isReplacementTrashFromHandDecision(state, decision);

export const getReplacementDecisionLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => [
  ...getReplacementRestTargetLegalActions(state, playerId),
  ...getReplacementTrashFromHandLegalActions(state, playerId),
];
