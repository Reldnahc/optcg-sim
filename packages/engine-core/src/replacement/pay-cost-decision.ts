import type {
  Cost,
  GameState,
  PayCostDecision,
  PaymentOption,
  ReplacementProcess,
} from "@optcg/types";

import { toDecisionId } from "../action-results.js";
import { getReturnDonEligibleCount } from "../runtime/primitives/return-don.js";
import {
  isSupportedReturnDonInsteadEffect,
  plural,
} from "./instead-effects.js";
import type { SelectedTargetKoReplacementCandidate } from "./primitives.js";

export const createReplacementPayCostDecision = (
  state: GameState,
  process: ReplacementProcess,
  candidate: SelectedTargetKoReplacementCandidate,
): PayCostDecision | undefined => {
  const instead = candidate.replacementEffect.instead;
  if (!isSupportedReturnDonInsteadEffect(instead)) {
    return undefined;
  }
  const player = state.players[candidate.controllerId];
  if (
    player === undefined ||
    getReturnDonEligibleCount(player) < instead.count
  ) {
    return undefined;
  }
  const cost: Cost = {
    type: "returnDon",
    count: instead.count,
  };
  const paymentOption: PaymentOption = {
    id: "returnDon",
    type: "returnDon",
    count: instead.count,
  };
  return {
    id: toDecisionId(
      `decision:replacementPayCost:${process.id}:${candidate.id}`,
    ),
    type: "payCost",
    playerId: candidate.controllerId,
    prompt: `Return ${String(instead.count)} DON!! ${plural(
      instead.count,
      "card",
      "cards",
    )} instead.`,
    causedBy: { type: "replacement", replacementId: candidate.id },
    visibility: { type: "public" },
    cost,
    paymentOptions: [paymentOption],
  };
};
