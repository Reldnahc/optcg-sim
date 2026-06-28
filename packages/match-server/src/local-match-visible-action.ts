import type {
  CardInstance,
  DecisionResponse,
  GameState,
  LegalAction,
} from "@optcg/types";

import { actionDecisionPayment } from "./dev-action-payment.js";
import type { DevVisibleAction } from "./dev-snapshot-types.js";
import { actionLabel } from "./local-dev-action-labels.js";

const responseKeyForDecisionResponse = (
  response: DecisionResponse | undefined,
): string | undefined => {
  if (response === undefined) {
    return undefined;
  }
  switch (response.type) {
    case "payment":
      return response.optionId;
    case "paymentDeclined":
      return "decline";
    case "optionalActivation":
      return response.choice;
    case "lifeTrigger":
      return response.choice;
    case "replacement":
      return response.replacementId ?? "decline";
    case "chooseQuantity":
      return String(response.quantity);
    case "effectOption":
      return response.optionId;
    case "effectOptionDeclined":
      return "decline";
    case "mulligan":
      return response.keep ? "keep" : "mulligan";
    case "loopCount":
      return String(response.count);
    case "rollbackConsent":
      return response.allow ? "allow" : "deny";
    case "cards":
    case "targets":
    case "orderedIds":
    case "topBottomPlacement":
      return undefined;
  }
};

const actionPlacement = (
  state: GameState,
  action: LegalAction,
): CardInstance["instanceId"] | undefined => {
  switch (action.type) {
    case "playCard":
    case "useCounter":
      return action.cardInstanceId;
    case "activateEffect":
      return action.source.instanceId;
    case "attachDon":
      return action.target.instanceId;
    case "declareAttack":
      return action.attacker.instanceId;
    case "activateBlocker":
      return action.blocker.instanceId;
    case "concede":
    case "endMainPhase":
      return undefined;
    case "respondToDecision":
      return action.response.type === "optionalActivation" &&
        state.pendingDecision?.type === "chooseOptionalActivation" &&
        state.pendingDecision.id === action.decisionId
        ? state.pendingDecision.source.instanceId
        : undefined;
  }
};

const actionAttachment = (
  action: LegalAction,
): DevVisibleAction["attachment"] | undefined => {
  if (action.type === "attachDon") {
    if (action.donInstanceId === undefined) {
      return undefined;
    }
    return {
      donInstanceId: action.donInstanceId,
      targetInstanceId: action.target.instanceId,
    };
  }
  if (
    action.type === "respondToDecision" &&
    action.response.type === "payment" &&
    action.response.selectedDonInstanceIds?.length === 1 &&
    action.response.selectedCardInstanceIds?.length === 1
  ) {
    const donInstanceId = action.response.selectedDonInstanceIds[0];
    const targetInstanceId = action.response.selectedCardInstanceIds[0];
    if (donInstanceId === undefined || targetInstanceId === undefined) {
      return undefined;
    }
    return {
      donInstanceId,
      targetInstanceId,
    };
  }
  return undefined;
};

const actionAttack = (
  action: LegalAction,
): DevVisibleAction["attack"] | undefined => {
  if (action.type !== "declareAttack") {
    return undefined;
  }
  return {
    attackerInstanceId: action.attacker.instanceId,
    targetInstanceId: action.target.instanceId,
  };
};

const actionCounter = (
  state: GameState,
  action: LegalAction,
): DevVisibleAction["counter"] | undefined => {
  if (action.type !== "useCounter") {
    return undefined;
  }
  const counterCard = Object.values(state.players)
    .flatMap((player) => player.hand)
    .find((card) => card.instanceId === action.cardInstanceId);
  const amount =
    counterCard === undefined
      ? undefined
      : state.cardManifest.cards[counterCard.cardId]?.counter;
  return {
    cardInstanceId: action.cardInstanceId,
    targetInstanceId: action.target.instanceId,
    ...(action.effectId === undefined
      ? {}
      : { effectId: String(action.effectId) }),
    ...(amount === undefined ? {} : { amount }),
  };
};

export const visibleAction = (
  state: GameState,
  action: LegalAction,
): Omit<DevVisibleAction, "index"> => {
  const placement = actionPlacement(state, action);
  const attachment = actionAttachment(action);
  const attack = actionAttack(action);
  const counter = actionCounter(state, action);
  const decisionPayment = actionDecisionPayment(state, action);
  return {
    type: action.type,
    label: actionLabel(state, action),
    ...(() => {
      const responseKey =
        action.type === "respondToDecision"
          ? responseKeyForDecisionResponse(action.response)
          : undefined;
      return responseKey === undefined ? {} : { responseKey };
    })(),
    ...(decisionPayment === undefined ? {} : { decisionPayment }),
    ...(placement === undefined
      ? {}
      : { placement: { instanceId: placement } }),
    ...(attachment === undefined ? {} : { attachment }),
    ...(attack === undefined ? {} : { attack }),
    ...(counter === undefined ? {} : { counter }),
  };
};
