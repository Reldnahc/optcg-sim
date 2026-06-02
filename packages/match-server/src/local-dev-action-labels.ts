import type {
  CardId,
  CardInstance,
  GameState,
  LegalAction,
  PaymentOption,
} from "@optcg/types";

import { allPlayerCards, cardName } from "./dev-card-utils.js";

const instanceName = (
  state: GameState,
  instanceId: CardInstance["instanceId"],
): string => {
  for (const player of Object.values(state.players)) {
    const card = allPlayerCards(player).find(
      (candidate) => candidate.instanceId === instanceId,
    );
    if (card !== undefined) {
      return cardName(state, card.cardId);
    }
  }
  return String(instanceId);
};

const instanceNameWithCardId = (
  state: GameState,
  ref: { instanceId: CardInstance["instanceId"]; cardId: CardId },
): string => `${instanceName(state, ref.instanceId)} (${String(ref.cardId)})`;

const paymentOptionForAction = (
  state: GameState,
  action: Extract<LegalAction, { type: "respondToDecision" }>,
): PaymentOption | undefined => {
  if (action.response.type !== "payment") {
    return undefined;
  }
  const response = action.response;
  const pending = state.pendingDecision;
  if (
    pending === undefined ||
    pending.type !== "payCost" ||
    pending.id !== action.decisionId
  ) {
    return undefined;
  }
  return pending.paymentOptions.find(
    (option) => option.id === response.optionId,
  );
};

const isDeterministicLifeToHandMoveCost = (option: PaymentOption): boolean =>
  option.type === "moveCards" &&
  option.from.zone === "life" &&
  option.from.player === "self" &&
  option.from.position !== undefined &&
  option.to.zone === "hand" &&
  option.to.player === "self" &&
  option.to.position === undefined;

const responseLabel = (
  state: GameState,
  action: Extract<LegalAction, { type: "respondToDecision" }>,
): string => {
  if (String(action.decisionId).startsWith("decision:counterStep:pass:")) {
    return "End step";
  }
  switch (action.response.type) {
    case "payment": {
      const option = paymentOptionForAction(state, action);
      if (option !== undefined && isDeterministicLifeToHandMoveCost(option)) {
        return "Pay cost";
      }
      const selectedDonCount =
        action.response.selectedDonInstanceIds?.length ?? 0;
      const selectedCardsCount =
        action.response.selectedCardInstanceIds?.length ?? 0;
      if (selectedDonCount > 0) {
        return `Pay cost with ${String(selectedDonCount)} DON!!`;
      }
      if (selectedCardsCount > 0) {
        return `Pay cost with ${String(selectedCardsCount)} card`;
      }
      return "Pay cost";
    }
    case "paymentDeclined":
      return "Decline cost";
    case "cards":
      return `Choose ${String(action.response.cards.length)} card`;
    case "targets":
      return `Choose ${String(action.response.targets.length)} target`;
    case "orderedIds":
      return "Confirm order";
    case "topBottomPlacement":
      return "Confirm top/bottom placement";
    case "optionalActivation":
      return action.response.choice === "activate"
        ? "Activate effect"
        : "Decline effect";
    case "effectOption":
      return `Choose option ${action.response.optionId}`;
    case "lifeTrigger":
      return action.response.choice === "activateTrigger"
        ? "Activate trigger"
        : "Add to hand";
    case "replacement": {
      const response = action.response;
      if (response.replacementId === undefined) {
        return "Do not replace";
      }
      const pending = state.pendingDecision;
      if (
        pending?.type === "chooseReplacement" &&
        pending.id === action.decisionId
      ) {
        const option = pending.replacementOptions?.find(
          (candidate) => candidate.replacementId === response.replacementId,
        );
        if (option !== undefined) {
          return option.label;
        }
      }
      return "Use replacement effect";
    }
    case "mulligan":
      return action.response.keep ? "Keep hand" : "Mulligan hand";
    case "loopCount":
      return `Choose loop count ${String(action.response.count)}`;
    case "rollbackConsent":
      return action.response.allow ? "Allow rollback" : "Deny rollback";
    case "chooseQuantity":
      return `Choose ${String(action.response.quantity)}`;
  }
};

export const actionLabel = (state: GameState, action: LegalAction): string => {
  switch (action.type) {
    case "playCard":
      return `Play ${instanceName(state, action.cardInstanceId)}`;
    case "activateEffect":
      return "Activate effect";
    case "attachDon":
      return `Attach DON!! to ${cardName(state, action.target.cardId)}`;
    case "declareAttack":
      return `Attack with ${instanceNameWithCardId(
        state,
        action.attacker,
      )} into ${instanceNameWithCardId(state, action.target)}`;
    case "activateBlocker":
      return `Block with ${cardName(state, action.blocker.cardId)}`;
    case "useCounter":
      return `Counter with ${instanceName(state, action.cardInstanceId)}`;
    case "endMainPhase":
      return "End turn";
    case "concede":
      return "Concede";
    case "respondToDecision":
      return responseLabel(state, action);
  }
};
