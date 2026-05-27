import type {
  CardInstance,
  GameState,
  LegalAction,
  PlayerId,
  Zone,
} from "@optcg/types";

import { cardByInstanceId } from "./dev-card-utils.js";
import type { DevVisibleAction } from "./dev-snapshot-types.js";

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
  if (
    option?.type !== "trashFromHand" &&
    option?.type !== "trashFromField" &&
    option?.type !== "moveCards"
  ) {
    return undefined;
  }
  const selectedCardInstanceIds = response.selectedCardInstanceIds;
  if (
    selectedCardInstanceIds === undefined ||
    selectedCardInstanceIds.length === 0
  ) {
    return undefined;
  }
  return {
    kind: "cardCost",
    operation: option.type === "moveCards" ? "moveCards" : "trash",
    chooseLabel: chooseCardCostLabel(option.type),
    selectedCardInstanceIds: [...selectedCardInstanceIds],
    ...cardCostSource(state, selectedCardInstanceIds),
  };
};

const chooseCardCostLabel = (
  optionType: "trashFromHand" | "trashFromField" | "moveCards",
): string => {
  switch (optionType) {
    case "trashFromField":
      return "Choose Character to trash";
    case "moveCards":
      return "Choose cards from trash";
    case "trashFromHand":
      return "Choose card to trash";
  }
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
