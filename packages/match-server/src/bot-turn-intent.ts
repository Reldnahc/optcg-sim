import type { BotFeatures } from "./bot-features.js";

export type BotTurnIntent =
  | { readonly type: "answerDecision" }
  | { readonly type: "surviveLethal" }
  | { readonly type: "findLethal" }
  | { readonly type: "removeThreat" }
  | { readonly type: "developBoard" }
  | { readonly type: "useProfitableEffect" }
  | { readonly type: "allocateDon" }
  | { readonly type: "attack" }
  | { readonly type: "endTurn" };

export const chooseBotTurnIntent = (features: BotFeatures): BotTurnIntent => {
  if (
    features.snapshot.players[features.botPlayerId]?.view.pendingDecision
      ?.playerId === features.botPlayerId
  ) {
    return { type: "answerDecision" };
  }
  if (features.combat.incomingBattleIsLethal) {
    return { type: "surviveLethal" };
  }
  if (features.combat.hasAvailableLethalLine) {
    return { type: "findLethal" };
  }
  if (features.combat.hasHighValueThreatAttack) {
    return { type: "removeThreat" };
  }
  if (features.actions.hasProfitableEffect) {
    return { type: "useProfitableEffect" };
  }
  if (features.actions.hasPlayableDevelopmentCard) {
    return { type: "developBoard" };
  }
  if (features.actions.hasUsefulDonAttachment) {
    return { type: "allocateDon" };
  }
  if (features.actions.hasAttack) {
    return { type: "attack" };
  }
  return { type: "endTurn" };
};
