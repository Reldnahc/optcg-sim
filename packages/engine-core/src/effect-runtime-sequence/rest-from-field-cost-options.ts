import type {
  EffectQueueEntry,
  GameState,
  LegalAction,
  OptionalCost,
  OptionalPayCostDecision,
  PlayerId,
  PlayerState,
} from "@optcg/types";

import { isSupportedHandSelectionCardFilter } from "../actions/state.js";
import { restFromFieldSelectableIds } from "../runtime/costs/rest-from-field.js";
import { chooseCombos } from "./payment-combos.js";

type RestFromFieldPaymentOption = Extract<
  OptionalPayCostDecision["paymentOptions"][number],
  { type: "restFromField" }
>;

export const restFromFieldPaymentOption = (
  state: GameState,
  entry: EffectQueueEntry,
  cost: Extract<OptionalCost, { type: "restFromField" }>,
  player: PlayerState | undefined,
): RestFromFieldPaymentOption | undefined => {
  if (
    cost.chooser !== "self" ||
    !isSupportedHandSelectionCardFilter(cost.filter)
  ) {
    return undefined;
  }
  const selectableCount =
    player === undefined
      ? 0
      : restFromFieldSelectableIds(
          state,
          entry.controllerId,
          player,
          cost.filter,
        ).length;
  if (selectableCount < cost.count) {
    return undefined;
  }
  return {
    id: "restFromField",
    type: "restFromField",
    count: cost.count,
    ...(cost.filter === undefined ? {} : { filter: cost.filter }),
  };
};

export const restFromFieldPaymentLegalActions = (
  state: GameState,
  playerId: PlayerId,
  player: PlayerState,
  decisionId: OptionalPayCostDecision["id"],
  option: RestFromFieldPaymentOption,
): LegalAction[] => {
  if (!isSupportedHandSelectionCardFilter(option.filter)) {
    return [];
  }
  const selectableCardIds = restFromFieldSelectableIds(
    state,
    playerId,
    player,
    option.filter,
  );
  return chooseCombos(selectableCardIds, option.count).map((combo) => ({
    type: "respondToDecision" as const,
    decisionId,
    response: {
      type: "payment" as const,
      optionId: option.id,
      selectedCardInstanceIds: combo,
    },
  }));
};
