import type {
  CardInstance,
  GameState,
  LegalAction,
  PlayerId,
  Zone,
} from "@optcg/types";

import { cardByInstanceId } from "./dev-card-utils.js";
import type { DevVisibleAction } from "./dev-snapshot-types.js";

type PayCostDecision = Extract<
  NonNullable<GameState["pendingDecision"]>,
  { type: "payCost" }
>;

type CardCostPaymentOption = Extract<
  PayCostDecision["paymentOptions"][number],
  {
    type:
      | "trashFromHand"
      | "trashFromField"
      | "moveCards"
      | "returnDon"
      | "revealFromHand";
  }
>;

export const actionDecisionPayment = (
  state: GameState,
  action: LegalAction,
): DevVisibleAction["decisionPayment"] | undefined => {
  if (action.type !== "respondToDecision") {
    return undefined;
  }
  const response = action.response;
  if (response.type === "paymentDeclined") {
    return { kind: "paymentDeclined" };
  }
  if (response.type !== "payment") {
    return undefined;
  }
  const pending = state.pendingDecision;
  if (
    pending === undefined ||
    pending.type !== "payCost" ||
    pending.id !== action.decisionId
  ) {
    return undefined;
  }
  const option = pending.paymentOptions.find(
    (candidate) => candidate.id === response.optionId,
  );
  if (!isCardCostPaymentOption(option)) {
    return undefined;
  }
  if (
    isDeterministicLifeToHandMoveCost(option, pending.paymentOptions.length)
  ) {
    return undefined;
  }
  if (isDeterministicDeckTopMoveCost(option)) {
    return undefined;
  }
  const selectedCardInstanceIds =
    option.type === "returnDon"
      ? response.selectedDonInstanceIds
      : response.selectedCardInstanceIds;
  if (
    selectedCardInstanceIds === undefined ||
    selectedCardInstanceIds.length === 0
  ) {
    return undefined;
  }
  return {
    kind: "cardCost",
    operation: cardCostOperation(option.type),
    chooseLabel: chooseCardCostLabel(option),
    selectedCardInstanceIds: [...selectedCardInstanceIds],
    ...selectedCardDetails(state, selectedCardInstanceIds),
    ...cardCostSource(state, selectedCardInstanceIds),
  };
};

const isDeterministicLifeToHandMoveCost = (
  option: CardCostPaymentOption,
  paymentOptionCount: number,
): boolean =>
  paymentOptionCount === 1 &&
  option.type === "moveCards" &&
  option.from.zone === "life" &&
  option.from.player === "self" &&
  option.from.position !== undefined &&
  option.to.zone === "hand" &&
  option.to.player === "self" &&
  option.to.position === undefined;

const isDeterministicDeckTopMoveCost = (
  option: CardCostPaymentOption,
): boolean =>
  option.type === "moveCards" &&
  option.from.zone === "deck" &&
  option.from.player === "self" &&
  option.from.position === "top";

const cardCostOperation = (
  optionType:
    | "trashFromHand"
    | "trashFromField"
    | "moveCards"
    | "returnDon"
    | "revealFromHand",
): "trash" | "moveCards" | "returnDon" | "reveal" => {
  switch (optionType) {
    case "moveCards":
      return "moveCards";
    case "returnDon":
      return "returnDon";
    case "revealFromHand":
      return "reveal";
    case "trashFromField":
    case "trashFromHand":
      return "trash";
  }
};

const chooseCardCostLabel = (option: CardCostPaymentOption): string => {
  switch (option.type) {
    case "trashFromField":
      return "Choose Character to trash";
    case "moveCards":
      if (option.from.zone === "life") {
        return "Choose Life card";
      }
      if (option.from.zone === "hand" && option.to.zone === "deck") {
        return "Choose card to place on top of deck";
      }
      return "Choose cards from trash";
    case "returnDon":
      return "Choose DON!! to return";
    case "revealFromHand":
      return "Choose card to reveal";
    case "trashFromHand":
      return "Choose card to trash";
  }
};

const isCardCostPaymentOption = (
  option: PayCostDecision["paymentOptions"][number] | undefined,
): option is CardCostPaymentOption =>
  option?.type === "trashFromHand" ||
  option?.type === "trashFromField" ||
  option?.type === "moveCards" ||
  option?.type === "returnDon" ||
  option?.type === "revealFromHand";

const selectedCardDetails = (
  state: GameState,
  instanceIds: readonly CardInstance["instanceId"][],
):
  | {
      selectedCards: Array<{
        instanceId: CardInstance["instanceId"];
        zone: Zone;
        playerId?: PlayerId | undefined;
        index?: number | undefined;
      }>;
    }
  | Record<string, never> => {
  const selectedCards = instanceIds.flatMap((instanceId) => {
    const card = cardByInstanceId(state, instanceId);
    if (card === undefined) {
      return [];
    }
    return [
      {
        instanceId,
        zone: card.zone.zone,
        ...(card.zone.playerId === undefined
          ? {}
          : { playerId: card.zone.playerId }),
        ...(typeof card.zone.index === "number"
          ? { index: card.zone.index }
          : {}),
      },
    ];
  });
  return selectedCards.length === instanceIds.length ? { selectedCards } : {};
};

const cardCostSource = (
  state: GameState,
  instanceIds: readonly CardInstance["instanceId"][],
): { source: { zone: Zone; playerId?: PlayerId } } | Record<string, never> => {
  const cards = instanceIds
    .map((instanceId) => cardByInstanceId(state, instanceId))
    .filter((card): card is CardInstance => card !== undefined);
  const first = cards[0];
  if (first === undefined || cards.length !== instanceIds.length) {
    return {};
  }
  const zone = first.zone.zone;
  const playerId = first.zone.playerId;
  if (
    cards.some(
      (card) =>
        card.zone.zone !== zone || card.zone.playerId !== first.zone.playerId,
    )
  ) {
    return {};
  }
  return {
    source:
      playerId === undefined
        ? { zone }
        : {
            zone,
            playerId,
          },
  };
};
