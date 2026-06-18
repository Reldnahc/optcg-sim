import type {
  Action,
  CardRef,
  Cost,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  OptionalCost,
  PlayerId,
} from "@optcg/types";

import {
  appendEvent,
  type EngineResultOptions,
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import {
  expandMoveCardsCostRoutes,
  selectableMoveCardsCostIds,
} from "../effect-runtime-sequence/move-card-cost-options.js";
import { applyMoveCardsPayment } from "../movement/runtime-move-cards-payment.js";
import {
  applyReturnDonPayment,
  getReturnDonEligibleInstanceIds,
} from "../runtime/primitives/return-don.js";
import { isCausalityRef } from "./field-removal-targets.js";
import {
  findReplacementContinuationPayload,
  replacementPayloadWithoutPendingKey,
  replacementProcessFromContinuation,
} from "./continuation-state.js";
import { activeEffectTextPresentationFromPayloadValue } from "./presentation-payload.js";
import { removeReplacementProcessState } from "./process-gate.js";
import { continueUncoveredFieldRemovalTargets } from "./unreplaced-field-removal.js";
import type {
  EngineInternalReplacementAppliedEventPayload,
  PendingReplacementPayCostInsteadPayload,
} from "./continuation-payloads.js";

type ReplacementDecisionResult = {
  completedPayload: unknown;
  result: EngineResult;
};

type ReplacementPayCost =
  | Extract<Cost, { type: "returnDon" }>
  | Extract<OptionalCost, { type: "moveCards" }>;

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

const isCardRef = (value: unknown): value is CardRef => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const zone = candidate["zone"];
  return (
    typeof candidate["instanceId"] === "string" &&
    typeof candidate["cardId"] === "string" &&
    typeof candidate["playerId"] === "string" &&
    (zone === undefined || (typeof zone === "object" && zone !== null))
  );
};

const cardRefArrayFromPayloadValue = (value: unknown): CardRef[] | undefined =>
  value === undefined
    ? undefined
    : Array.isArray(value) && value.every(isCardRef)
      ? value
      : undefined;

const replacementPayCostFromPayloadValue = (
  value: unknown,
): ReplacementPayCost | undefined => {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const count = candidate["count"];
  if (typeof count !== "number" || !Number.isInteger(count) || count <= 0) {
    return undefined;
  }
  if (candidate["type"] === "returnDon") {
    return { type: "returnDon", count };
  }
  if (candidate["type"] !== "moveCards") {
    return undefined;
  }
  const from = candidate["from"];
  const to = candidate["to"];
  if (
    typeof from !== "object" ||
    from === null ||
    typeof to !== "object" ||
    to === null ||
    candidate["chooser"] !== "self" ||
    candidate["order"] !== "chooserChoice" ||
    candidate["optional"] !== true
  ) {
    return undefined;
  }
  const fromRecord = from as Record<string, unknown>;
  const toRecord = to as Record<string, unknown>;
  if (
    fromRecord["player"] !== "self" ||
    fromRecord["zone"] !== "trash" ||
    fromRecord["position"] !== undefined ||
    toRecord["player"] !== "self" ||
    toRecord["zone"] !== "deck" ||
    toRecord["position"] !== "bottom"
  ) {
    return undefined;
  }
  return {
    type: "moveCards",
    count,
    chooser: "self",
    from: { player: "self", zone: "trash" },
    to: { player: "self", zone: "deck", position: "bottom" },
    order: "chooserChoice",
    optional: true,
  };
};

const pendingReplacementPayCostInsteadFromPayload = (
  payload: unknown,
):
  | (PendingReplacementPayCostInsteadPayload & {
      cost: ReplacementPayCost;
      decisionId: string;
    })
  | undefined => {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("pendingReplacementPayCostInstead" in payload)
  ) {
    return undefined;
  }
  const pending = payload.pendingReplacementPayCostInstead;
  if (typeof pending !== "object" || pending === null) {
    return undefined;
  }
  const candidate = pending as Record<string, unknown>;
  const cost = replacementPayCostFromPayloadValue(candidate["cost"]);
  if (
    typeof candidate["decisionId"] !== "string" ||
    typeof candidate["replacementId"] !== "string" ||
    typeof candidate["effectBlockId"] !== "string" ||
    typeof candidate["controllerId"] !== "string" ||
    !isCausalityRef(candidate["causedBy"]) ||
    !isCardRef(candidate["source"]) ||
    cost === undefined
  ) {
    return undefined;
  }
  const target = candidate["target"];
  if (target !== undefined && !isCardRef(target)) {
    return undefined;
  }
  const coveredTargets = cardRefArrayFromPayloadValue(
    candidate["coveredTargets"],
  );
  if (
    candidate["coveredTargets"] !== undefined &&
    coveredTargets === undefined
  ) {
    return undefined;
  }
  const presentation = activeEffectTextPresentationFromPayloadValue(
    candidate["presentation"],
  );
  if (candidate["presentation"] !== undefined && presentation === undefined) {
    return undefined;
  }
  return {
    decisionId: candidate["decisionId"],
    replacementId: candidate["replacementId"],
    effectBlockId: candidate[
      "effectBlockId"
    ] as PendingReplacementPayCostInsteadPayload["effectBlockId"],
    controllerId: candidate["controllerId"] as PlayerId,
    source: candidate["source"],
    causedBy: candidate["causedBy"],
    cost,
    ...(target === undefined ? {} : { target }),
    ...(coveredTargets === undefined ? {} : { coveredTargets }),
    ...(presentation === undefined ? {} : { presentation }),
  };
};

const pendingReplacementPayCostPayload = (
  state: GameState,
  decision: NonNullable<GameState["pendingDecision"]> | undefined,
) =>
  findReplacementContinuationPayload({
    state,
    decision,
    decisionType: "payCost",
    pendingKey: "pendingReplacementPayCostInstead",
    parsePayload: pendingReplacementPayCostInsteadFromPayload,
  });

export const applyReplacementPayCostDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  options: EngineResultOptions = {},
): ReplacementDecisionResult | null => {
  const decision = state.pendingDecision;
  const pending = pendingReplacementPayCostPayload(state, decision);
  if (decision?.type !== "payCost" || pending === null) {
    return null;
  }
  const cost = pending.payload.cost;
  if (action.response.type !== "payment") {
    return {
      completedPayload: undefined,
      result: toEngineResult(
        state,
        [],
        invalidDecision("Response type must be payment for payCost."),
        options,
      ),
    };
  }
  const paymentOptionId = action.response.optionId;
  const selectedMoveCardsOption =
    cost.type === "moveCards"
      ? expandMoveCardsCostRoutes(cost).find(
          (option) => option.id === paymentOptionId,
        )
      : undefined;
  if (
    (cost.type === "returnDon" && paymentOptionId !== cost.type) ||
    (cost.type === "moveCards" && selectedMoveCardsOption === undefined)
  ) {
    return {
      completedPayload: undefined,
      result: toEngineResult(
        state,
        [],
        invalidDecision("Payment option mismatch."),
        options,
      ),
    };
  }
  const player = state.players[pending.payload.controllerId];
  if (player === undefined) {
    return {
      completedPayload: undefined,
      result: toEngineResult(
        state,
        [],
        invalidDecision("Replacement controller is missing."),
        options,
      ),
    };
  }
  const events: EngineEvent[] = [];
  const paymentEvents: EngineEvent[] = [];
  let nextPlayer;
  let transformedPayload: Record<string, unknown>;
  if (cost.type === "returnDon") {
    const selected = action.response.selectedDonInstanceIds;
    if (
      selected === undefined ||
      selected.length !== cost.count ||
      new Set(selected).size !== selected.length ||
      action.response.selectedCardInstanceIds !== undefined
    ) {
      return {
        completedPayload: undefined,
        result: toEngineResult(
          state,
          [],
          invalidDecision("Payment DON!! selection is invalid."),
          options,
        ),
      };
    }
    const eligibleIds = new Set(getReturnDonEligibleInstanceIds(player));
    if (!selected.every((donId) => eligibleIds.has(donId))) {
      return {
        completedPayload: undefined,
        result: toEngineResult(
          state,
          [],
          invalidDecision("Payment DON!! selection is invalid."),
          options,
        ),
      };
    }
    const returned = applyReturnDonPayment({
      player,
      playerId: pending.payload.controllerId,
      selectedDonIds: selected,
    });
    if (returned === null) {
      return {
        completedPayload: undefined,
        result: toEngineResult(
          state,
          [],
          invalidDecision("Payment DON!! selection is invalid."),
          options,
        ),
      };
    }
    nextPlayer = returned;
    transformedPayload = {
      replacementId: pending.payload.replacementId,
      selectedDonInstanceIds: selected,
    };
  } else {
    const selectedOption = selectedMoveCardsOption;
    const selected = action.response.selectedCardInstanceIds;
    if (
      selectedOption === undefined ||
      selected === undefined ||
      selected.length !== selectedOption.count ||
      new Set(selected).size !== selected.length ||
      action.response.selectedDonInstanceIds !== undefined
    ) {
      return {
        completedPayload: undefined,
        result: toEngineResult(
          state,
          [],
          invalidDecision("Payment card selection is invalid."),
          options,
        ),
      };
    }
    const selectable = selectableMoveCardsCostIds(
      state,
      pending.payload.controllerId,
      player,
      selectedOption,
    );
    if (
      selectable === undefined ||
      !selected.every((cardId) => selectable.includes(cardId))
    ) {
      return {
        completedPayload: undefined,
        result: toEngineResult(
          state,
          [],
          invalidDecision("Payment card selection is invalid."),
          options,
        ),
      };
    }
    const moved = applyMoveCardsPayment({
      decisionId: decision.id,
      events: paymentEvents,
      player,
      playerId: pending.payload.controllerId,
      selected,
      selectedOption,
      state,
    });
    if (moved === null) {
      return {
        completedPayload: undefined,
        result: toEngineResult(
          state,
          [],
          invalidDecision("Payment card selection is invalid."),
          options,
        ),
      };
    }
    nextPlayer = moved;
    transformedPayload = {
      replacementId: pending.payload.replacementId,
      selectedCardInstanceIds: selected,
    };
  }
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
  const resolved = events[0];
  if (resolved !== undefined) {
    resolved.causedBy = { type: "decision", decisionId: decision.id };
  }
  appendEvent(
    state,
    events,
    "costPaid",
    {
      playerId: pending.payload.controllerId,
      optionId: action.response.optionId,
      ...(cost.type === "returnDon"
        ? { selectedDonInstanceIds: action.response.selectedDonInstanceIds }
        : { selectedCardInstanceIds: action.response.selectedCardInstanceIds }),
    },
    { type: "public" },
  );
  const paid = events[events.length - 1];
  if (paid !== undefined) {
    paid.causedBy = { type: "decision", decisionId: decision.id };
  }
  events.push(...paymentEvents);
  appendEvent(
    state,
    events,
    "replacementApplied",
    {
      processId: pending.processId,
      replacementId: pending.payload.replacementId,
      previousPayloadHash: hashCanonicalStateValue(
        replacementPayloadWithoutPendingKey({
          state,
          processId: pending.processId,
          pendingKey: "pendingReplacementPayCostInstead",
        }),
      ),
      transformedPayloadHash: hashCanonicalStateValue(transformedPayload),
      ...(pending.payload.presentation === undefined
        ? {}
        : { presentation: pending.payload.presentation }),
    } satisfies EngineInternalReplacementAppliedEventPayload,
    { type: "public" },
  );
  const applied = events[events.length - 1];
  if (applied !== undefined) {
    applied.causedBy = {
      type: "replacement",
      replacementId: pending.payload.replacementId,
    };
  }
  const nextStateWithPayment: GameState = {
    ...state,
    players: {
      ...state.players,
      [pending.payload.controllerId]: nextPlayer,
    },
  };
  const completedPayload = replacementPayloadWithoutPendingKey({
    state,
    processId: pending.processId,
    pendingKey: "pendingReplacementPayCostInstead",
  });
  const process = replacementProcessFromContinuation({
    causedBy: pending.payload.causedBy,
    payload: completedPayload,
    processId: pending.processId,
    type: pending.processType,
    usedReplacementId: pending.payload.replacementId,
  });
  const continued =
    process === null
      ? { state: nextStateWithPayment }
      : continueUncoveredFieldRemovalTargets(
          nextStateWithPayment,
          events,
          pending.payload.effectBlockId,
          process,
          pending.payload.coveredTargets ?? [],
        );
  if ("error" in continued) {
    return {
      completedPayload: undefined,
      result: toEngineResult(state, [], [continued.error], options),
    };
  }
  const nextState: GameState = {
    ...continued.state,
    seq: toStateSeq(continued.state.seq + 1),
    replacementState: removeReplacementProcessState(
      continued.state,
      pending.processId,
    ).replacementState,
    eventJournal: [...continued.state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  return {
    completedPayload,
    result: toEngineResult(nextState, events, undefined, options),
  };
};
