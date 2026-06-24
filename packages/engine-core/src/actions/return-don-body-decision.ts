import type {
  Action,
  EngineResult,
  GameState,
  PaymentOption,
} from "@optcg/types";

import {
  appendEvent,
  type EngineResultOptions,
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import { resumeSequenceFrameAfterReturnDonBody } from "../effect-runtime-sequence/return-don-body.js";
import { getReturnDonEligibleInstanceIds } from "../runtime/primitives/return-don.js";
import { createSupportedTrashFromHandChoiceDecision } from "../runtime/primitives/trash-from-hand.js";

const returnDonBodyDecisionPrefix = "decision:returnDon:sequence:";

export const applyReturnDonBodyDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  options: EngineResultOptions = {},
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "payCost" ||
    !String(decision.id).startsWith(returnDonBodyDecisionPrefix)
  ) {
    return null;
  }
  if (decision.cost.type !== "returnDon") {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "invalidDecisionResponse",
          reason: "returnDon body decision is stale.",
        },
      ],
    );
  }
  if (action.response.type !== "payment") {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "invalidDecisionResponse",
          reason: "returnDon body decision requires a payment response.",
        },
      ],
    );
  }
  if (action.response.optionId !== "returnDon") {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "invalidDecisionResponse",
          reason: "Payment option mismatch.",
        },
      ],
    );
  }
  if (action.response.selectedCardInstanceIds !== undefined) {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "invalidDecisionResponse",
          reason: "returnDon body decision must not include card selection.",
        },
      ],
    );
  }

  const selectedDonIds = action.response.selectedDonInstanceIds;
  const selectedOption = decision.paymentOptions.find(
    (option): option is Extract<PaymentOption, { type: "returnDon" }> =>
      option.id === "returnDon" && option.type === "returnDon",
  );
  if (
    selectedDonIds === undefined ||
    selectedOption === undefined ||
    selectedDonIds.length !== selectedOption.count
  ) {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "invalidDecisionResponse",
          reason: "returnDon body DON!! selection count mismatch.",
        },
      ],
    );
  }
  if (new Set(selectedDonIds).size !== selectedDonIds.length) {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "invalidDecisionResponse",
          reason: "returnDon body DON!! selection contains duplicates.",
        },
      ],
    );
  }

  const player = state.players[decision.playerId];
  const eligibleIds =
    player === undefined
      ? new Set()
      : new Set(getReturnDonEligibleInstanceIds(player));
  if (
    player === undefined ||
    selectedDonIds.some((donId) => !eligibleIds.has(donId))
  ) {
    return toEngineResult(
      state,
      [],
      [
        {
          type: "invalidDecisionResponse",
          reason: "returnDon body DON!! selection is invalid.",
        },
      ],
    );
  }

  const events: NonNullable<EngineResult["events"]> = [];
  appendEvent(
    state,
    events,
    "decisionResolved",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
      responseType: action.response.type,
    },
    decision.visibility,
  );
  const resolved = events[events.length - 1];
  if (resolved !== undefined) {
    resolved.causedBy = { type: "decision", decisionId: decision.id };
  }

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;

  const resumed = resumeSequenceFrameAfterReturnDonBody(
    nextState,
    decision.id,
    decision.playerId,
    selectedDonIds,
    createSupportedTrashFromHandChoiceDecision,
  );
  if (resumed === undefined) {
    return null;
  }
  if (!resumed.ok) {
    return toEngineResult(state, [], [resumed.error], options);
  }
  return toEngineResult(
    resumed.state,
    [...events, ...resumed.events],
    undefined,
    options,
  );
};
