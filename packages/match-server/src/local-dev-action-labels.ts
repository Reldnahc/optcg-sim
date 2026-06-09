import type {
  CardId,
  CardInstance,
  GameState,
  LegalAction,
  PaymentOption,
  PaymentResponse,
  Zone,
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

const countLabel = (count: number, singular: string, plural: string): string =>
  `${String(count)} ${count === 1 ? singular : plural}`;

const lifePositionLabel = (position: "top" | "bottom" | undefined): string => {
  switch (position) {
    case "top":
      return "top Life";
    case "bottom":
      return "bottom Life";
    case undefined:
      return "Life";
  }
};

const zoneLabel = (zone: Zone): string => {
  switch (zone) {
    case "deck":
      return "deck";
    case "life":
      return "Life";
    case "hand":
      return "hand";
    case "trash":
      return "trash";
    case "costArea":
      return "cost area";
    case "characterArea":
      return "Character area";
    case "stageArea":
      return "Stage area";
    case "leaderArea":
      return "Leader area";
    case "donDeck":
      return "DON!! deck";
    case "noZone":
      return "revealed cards";
  }
};

const paymentOptionLabel = (
  option: PaymentOption,
  response: PaymentResponse,
): string => {
  const selectedDonCount = response.selectedDonInstanceIds?.length ?? 0;
  const selectedCardsCount = response.selectedCardInstanceIds?.length ?? 0;
  switch (option.type) {
    case "restSelf":
      return "Rest this card";
    case "trashSelf":
      return "Trash this card";
    case "turnLifeFaceUp":
      return `Turn ${lifePositionLabel(option.position)} face-up`;
    case "restDon":
      return `Rest ${countLabel(selectedDonCount || option.count, "DON!!", "DON!!")}`;
    case "attachDon":
      return `Give ${countLabel(selectedDonCount || option.count, "DON!!", "DON!!")}`;
    case "returnDon":
      return `Return ${countLabel(selectedDonCount || option.count, "DON!!", "DON!!")}`;
    case "trashFromHand":
      return `Trash ${countLabel(selectedCardsCount || option.count, "card", "cards")} from hand`;
    case "revealFromHand":
      return `Reveal ${countLabel(selectedCardsCount || option.count, "card", "cards")} from hand`;
    case "trashFromField":
      return `Trash ${countLabel(selectedCardsCount || option.count, "card", "cards")} from field`;
    case "modifyPower":
      return `Give Leader ${String(option.value)} power`;
    case "moveCards":
      if (isDeterministicLifeToHandMoveCost(option)) {
        return `Add ${lifePositionLabel(option.from.position)} to hand`;
      }
      if (
        option.from.zone === "trash" &&
        option.to.zone === "deck" &&
        option.to.position === "bottom"
      ) {
        return `Place ${countLabel(selectedCardsCount || option.count, "card", "cards")} from trash at bottom`;
      }
      if (
        option.from.zone === "deck" &&
        option.from.position === "top" &&
        option.to.zone === "trash"
      ) {
        return `Trash ${countLabel(selectedCardsCount || option.count, "card", "cards")} from top of deck`;
      }
      return `Move ${countLabel(selectedCardsCount || option.count, "card", "cards")} from ${zoneLabel(
        option.from.zone,
      )} to ${zoneLabel(option.to.zone)}`;
    case "discard":
      return `Discard ${countLabel(option.count, "card", "cards")}`;
    case "custom":
      return option.action;
  }
};

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
      if (option !== undefined) {
        return paymentOptionLabel(option, action.response);
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
      return "Pay unrecognized cost";
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
