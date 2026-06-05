import type {
  Action,
  CardRef,
  Cost,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "../action-results.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import {
  applyReturnDonPayment,
  getReturnDonEligibleInstanceIds,
} from "../runtime/primitives/return-don.js";
import {
  isCausalityRef,
  replacementProcessFromStoredPayload,
} from "./field-removal-targets.js";
import { continueUncoveredFieldRemovalTargets } from "./unreplaced-field-removal.js";
import type {
  EngineInternalReplacementAppliedEventPayload,
  PendingReplacementPayCostInsteadPayload,
} from "./continuation-payloads.js";

type ReplacementDecisionResult = {
  completedPayload: unknown;
  result: EngineResult;
};

type ReturnDonCost = Extract<Cost, { type: "returnDon" }>;

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

const returnDonCostFromPayloadValue = (
  value: unknown,
): ReturnDonCost | undefined => {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return undefined;
  }
  if (value.type !== "returnDon" || !("count" in value)) {
    return undefined;
  }
  const count = value.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count <= 0) {
    return undefined;
  }
  return { type: "returnDon", count };
};

const pendingReplacementPayCostInsteadFromPayload = (
  payload: unknown,
):
  | (PendingReplacementPayCostInsteadPayload & { decisionId: string })
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
  const cost = returnDonCostFromPayloadValue(candidate["cost"]);
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
  };
};

const pendingReplacementPayCostPayload = (
  state: GameState,
  decision: NonNullable<GameState["pendingDecision"]> | undefined,
): {
  processId: string;
  processType: GameState["replacementState"][number]["type"];
  payload: PendingReplacementPayCostInsteadPayload;
} | null => {
  if (decision?.type !== "payCost") {
    return null;
  }
  const processState = state.replacementState.find((candidate) => {
    const payload = candidate.payload;
    return (
      typeof payload === "object" &&
      payload !== null &&
      "pendingReplacementPayCostInstead" in payload &&
      pendingReplacementPayCostInsteadFromPayload(payload)?.decisionId ===
        decision.id
    );
  });
  const payload =
    processState === undefined
      ? undefined
      : pendingReplacementPayCostInsteadFromPayload(processState.payload);
  return processState === undefined || payload === undefined
    ? null
    : {
        processId: processState.processId,
        processType: processState.type,
        payload,
      };
};

const replacementPayloadWithoutPending = (
  state: GameState,
  processId: string,
): unknown => {
  const stored = state.replacementState.find(
    (candidate) => candidate.processId === processId,
  );
  const payload = stored?.payload;
  if (typeof payload !== "object" || payload === null) {
    return payload;
  }
  const rest = { ...(payload as Record<string, unknown>) };
  delete rest["pendingReplacementPayCostInstead"];
  return rest;
};

export const applyReplacementPayCostDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): ReplacementDecisionResult | null => {
  const decision = state.pendingDecision;
  const pending = pendingReplacementPayCostPayload(state, decision);
  if (decision?.type !== "payCost" || pending === null) {
    return null;
  }
  const cost = pending.payload.cost;
  if (cost.type !== "returnDon") {
    return {
      completedPayload: undefined,
      result: toEngineResult(
        state,
        [],
        invalidDecision("Replacement payCost type is unsupported."),
      ),
    };
  }
  if (action.response.type !== "payment") {
    return {
      completedPayload: undefined,
      result: toEngineResult(
        state,
        [],
        invalidDecision("Response type must be payment for payCost."),
      ),
    };
  }
  if (action.response.optionId !== "returnDon") {
    return {
      completedPayload: undefined,
      result: toEngineResult(
        state,
        [],
        invalidDecision("Payment option mismatch."),
      ),
    };
  }
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
      ),
    };
  }

  const events: EngineEvent[] = [];
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
      optionId: "returnDon",
      selectedDonInstanceIds: selected,
    },
    { type: "public" },
  );
  const paid = events[events.length - 1];
  if (paid !== undefined) {
    paid.causedBy = { type: "decision", decisionId: decision.id };
  }
  const transformedPayload = {
    replacementId: pending.payload.replacementId,
    selectedDonInstanceIds: selected,
  };
  appendEvent(
    state,
    events,
    "replacementApplied",
    {
      processId: pending.processId,
      replacementId: pending.payload.replacementId,
      previousPayloadHash: hashCanonicalStateValue(
        replacementPayloadWithoutPending(state, pending.processId),
      ),
      transformedPayloadHash: hashCanonicalStateValue(transformedPayload),
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
      [pending.payload.controllerId]: returned,
    },
  };
  const completedPayload = replacementPayloadWithoutPending(
    state,
    pending.processId,
  );
  const process = replacementProcessFromStoredPayload({
    causedBy: pending.payload.causedBy,
    payload: completedPayload,
    processId: pending.processId,
    type: pending.processType,
    usedReplacementIds: [pending.payload.replacementId],
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
      result: toEngineResult(state, [], [continued.error]),
    };
  }
  const nextState: GameState = {
    ...continued.state,
    seq: toStateSeq(continued.state.seq + 1),
    replacementState: continued.state.replacementState.filter(
      (candidate) => candidate.processId !== pending.processId,
    ),
    eventJournal: [...continued.state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  return {
    completedPayload,
    result: toEngineResult(nextState, events),
  };
};
