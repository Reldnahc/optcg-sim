import type {
  Cost,
  GameState,
  OptionalCost,
  PayCostDecision,
  PaymentOption,
  ReplacementProcess,
} from "@optcg/types";

import { toDecisionId } from "../action-results.js";
import {
  expandMoveCardsCostRoutes,
  selectableMoveCardsCostIds,
} from "../effect-runtime-sequence/move-card-cost-options.js";
import { getReturnDonEligibleCount } from "../runtime/primitives/return-don.js";
import {
  isSupportedReturnDonInsteadEffect,
  plural,
  supportedReplacementPayCostInstead,
} from "./instead-effects.js";
import type { SelectedTargetKoReplacementCandidate } from "./primitives.js";

const createReturnDonReplacementPayCost = (
  state: GameState,
  process: ReplacementProcess,
  candidate: SelectedTargetKoReplacementCandidate,
  cost: Extract<Cost, { type: "returnDon" }>,
): PayCostDecision | undefined => {
  const player = state.players[candidate.controllerId];
  if (player === undefined || getReturnDonEligibleCount(player) < cost.count) {
    return undefined;
  }
  const paymentOption: PaymentOption = {
    id: "returnDon",
    type: "returnDon",
    count: cost.count,
  };
  return {
    id: toDecisionId(
      `decision:replacementPayCost:${process.id}:${candidate.id}`,
    ),
    type: "payCost",
    playerId: candidate.controllerId,
    prompt: `Return ${String(cost.count)} DON!! ${plural(
      cost.count,
      "card",
      "cards",
    )} instead.`,
    causedBy: { type: "replacement", replacementId: candidate.id },
    visibility: { type: "public" },
    cost,
    paymentOptions: [paymentOption],
  };
};

const createMoveCardsReplacementPayCost = (
  state: GameState,
  process: ReplacementProcess,
  candidate: SelectedTargetKoReplacementCandidate,
  cost: Extract<OptionalCost, { type: "moveCards" }>,
): PayCostDecision | undefined => {
  const player = state.players[candidate.controllerId];
  if (player === undefined) {
    return undefined;
  }
  const [paymentOption] = expandMoveCardsCostRoutes(cost);
  if (paymentOption === undefined) {
    return undefined;
  }
  const selectable = selectableMoveCardsCostIds(
    state,
    candidate.controllerId,
    player,
    paymentOption,
  );
  if (selectable === undefined || selectable.length < paymentOption.count) {
    return undefined;
  }
  return {
    id: toDecisionId(
      `decision:replacementPayCost:${process.id}:${candidate.id}`,
    ),
    type: "payCost",
    playerId: candidate.controllerId,
    prompt: `Place ${String(cost.count)} ${plural(
      cost.count,
      "card",
      "cards",
    )} from trash at the bottom of your deck instead.`,
    causedBy: { type: "replacement", replacementId: candidate.id },
    visibility: { type: "public" },
    cost,
    paymentOptions: [paymentOption],
  };
};

export const createReplacementPayCostDecision = (
  state: GameState,
  process: ReplacementProcess,
  candidate: SelectedTargetKoReplacementCandidate,
): PayCostDecision | undefined => {
  const instead = candidate.replacementEffect.instead;
  if (isSupportedReturnDonInsteadEffect(instead)) {
    return createReturnDonReplacementPayCost(state, process, candidate, {
      type: "returnDon",
      count: instead.count,
    });
  }
  const payCost = supportedReplacementPayCostInstead(instead);
  if (payCost?.cost.type === "moveCards") {
    return createMoveCardsReplacementPayCost(
      state,
      process,
      candidate,
      payCost.cost,
    );
  }
  return undefined;
};
