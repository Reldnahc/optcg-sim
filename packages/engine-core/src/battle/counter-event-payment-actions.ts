import type { CardInstance, GameState, LegalAction, PlayerId } from "@optcg/types";

import { chooseDonCombos } from "../play-card/legal-actions.js";
import { parseCounterPayCostDecisionId } from "./counter-event-payment-context.js";
import { getSupportedCounterEventActivation } from "./counter-event-activation.js";

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
  const activation = getSupportedCounterEventActivation(
    state,
    handCard,
    playerId,
  );
  if (
    activation === null ||
    context.kind !== "printed" ||
    String(battle.currentTarget.instanceId) !== context.targetInstanceId ||
    activation.printedCost <= 0
  ) {
    return [];
  }
  const activeDonIds = player.costArea
    .filter((card) => card.state === "active")
    .map((card) => card.instanceId);
  return chooseDonCombos(activeDonIds, activation.printedCost).map((combo) => ({
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: decision.paymentOptions[0]?.id ?? "restDon",
      selectedDonInstanceIds: combo,
    },
  }));
};
