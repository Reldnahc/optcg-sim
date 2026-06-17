import type { GameState, LegalAction, PlayerId } from "@optcg/types";

import { isStartOfGameSetupDecision } from "./start-of-game-effects.js";

export const getSetupStartOfGameLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const pending = state.pendingDecision;
  if (
    state.status.type !== "setup" ||
    pending === undefined ||
    !isStartOfGameSetupDecision(pending)
  ) {
    return [];
  }
  const decision = pending;
  if (decision.playerId !== playerId) return [];
  return [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards: [] },
    },
    ...decision.candidates.map((candidate) => ({
      type: "respondToDecision" as const,
      decisionId: decision.id,
      response: { type: "cards" as const, cards: [candidate.card] },
    })),
  ];
};
