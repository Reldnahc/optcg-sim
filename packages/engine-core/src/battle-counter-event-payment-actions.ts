import type {
  CardInstance,
  GameState,
  LegalAction,
  PlayerId,
} from "@optcg/types";

import { chooseDonCombos } from "./play-card/legal-actions.js";
import { parseCounterPayCostDecisionId } from "./battle-counter-event-payment-context.js";
import {
  getSupportedCounterEventPower,
  getSupportedCounterEventPowerTargets,
} from "./battle-counter-event-support.js";

export const getCounterEventPaymentLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const decision = state.pendingDecision;
  const battle = state.battle;
  const player = state.players[playerId];
  if (
    decision === undefined ||
    decision.type !== "payCost" ||
    decision.playerId !== playerId ||
    battle === undefined ||
    player === undefined
  ) {
    return [];
  }
  const context = parseCounterPayCostDecisionId(String(decision.id));
  if (context === null) {
    return [];
  }
  const handCard = player.hand.find(
    (card: CardInstance) =>
      String(card.instanceId) === context.counterEventInstanceId,
  );
  if (handCard === undefined) {
    return [];
  }
  const supportedTargets = getSupportedCounterEventPowerTargets(
    state,
    handCard,
    playerId,
    battle.currentTarget,
  );
  const selectedTarget = supportedTargets.find(
    (supportedTarget) =>
      String(supportedTarget.target.instanceId) === context.targetInstanceId,
  );
  if (selectedTarget === undefined) {
    return [];
  }
  const supported = getSupportedCounterEventPower(
    state,
    handCard,
    selectedTarget.target,
    battle.currentTarget,
  );
  if (supported === null) {
    return [];
  }
  if (context.kind === "effect") {
    const effectCost = supported.effectCost;
    if (effectCost === undefined) {
      return [];
    }
    const eligibleHandIds = player.hand
      .filter((card) => card.instanceId !== handCard.instanceId)
      .map((card) => card.instanceId);
    return chooseDonCombos(eligibleHandIds, effectCost.count).map((combo) => ({
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "payment",
        optionId: "trashFromHand",
        selectedCardInstanceIds: combo,
      },
    }));
  }
  if (supported.printedCost <= 0) {
    return [];
  }
  const activeDonIds = player.costArea
    .filter((card) => card.state === "active")
    .map((card) => card.instanceId);
  return chooseDonCombos(activeDonIds, supported.printedCost).map((combo) => ({
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: decision.paymentOptions[0]?.id ?? "restDon",
      selectedDonInstanceIds: combo,
    },
  }));
};
