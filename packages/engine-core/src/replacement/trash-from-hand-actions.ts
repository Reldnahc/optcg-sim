import type {
  Action,
  CardInstance,
  CardRef,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "../action-results.js";
import { toCardRef, zonesEqual } from "../action-state.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import { moveConcreteCardsToTrash } from "../concrete-card-movement.js";
import { consumeOncePerTurn, toOncePerTurnKey } from "../once-per-turn.js";

interface PendingReplacementTrashFromHandInsteadPayload {
  decisionId: string;
  effectBlockId: EffectQueueEntry["effectBlockId"];
  replacementId: string;
  source: CardRef;
  target?: CardRef;
  controllerId: PlayerId;
  count: number;
  oncePerTurn?: {
    cardInstanceId: CardInstance["instanceId"];
    effectId: EffectQueueEntry["effectBlockId"];
    turnNumber: GameState["turn"]["globalTurn"];
  };
}

interface EngineInternalReplacementAppliedEventPayload {
  processId: string;
  replacementId: string;
  previousPayloadHash: string;
  transformedPayloadHash: string;
}

type ReplacementDecisionResult = {
  completedPayload: unknown;
  result: EngineResult;
};

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

const cardRefsEqual = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId &&
  ((left.zone === undefined && right.zone === undefined) ||
    (left.zone !== undefined &&
      right.zone !== undefined &&
      zonesEqual(left.zone, right.zone)));

const hasDuplicateTargets = (targets: readonly CardRef[]): boolean =>
  targets.some((target, index) =>
    targets
      .slice(index + 1)
      .some((candidate) => cardRefsEqual(target, candidate)),
  );

const pendingReplacementOncePerTurnFromPayload = (
  value: unknown,
): PendingReplacementTrashFromHandInsteadPayload["oncePerTurn"] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate["cardInstanceId"] !== "string" ||
    typeof candidate["effectId"] !== "string" ||
    typeof candidate["turnNumber"] !== "number"
  ) {
    return undefined;
  }
  return {
    cardInstanceId: candidate["cardInstanceId"] as CardInstance["instanceId"],
    effectId: candidate["effectId"] as EffectQueueEntry["effectBlockId"],
    turnNumber: candidate["turnNumber"],
  };
};

const pendingReplacementTrashFromHandInsteadFromPayload = (
  payload: unknown,
):
  | (PendingReplacementTrashFromHandInsteadPayload & { decisionId: string })
  | undefined => {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("pendingReplacementTrashFromHandInstead" in payload)
  ) {
    return undefined;
  }
  const pending = payload.pendingReplacementTrashFromHandInstead;
  if (typeof pending !== "object" || pending === null) {
    return undefined;
  }
  const candidate = pending as Record<string, unknown>;
  const count = candidate["count"];
  if (
    typeof candidate["decisionId"] !== "string" ||
    typeof candidate["replacementId"] !== "string" ||
    typeof candidate["effectBlockId"] !== "string" ||
    typeof candidate["controllerId"] !== "string" ||
    !isCardRef(candidate["source"]) ||
    !Number.isInteger(count) ||
    typeof count !== "number" ||
    count <= 0
  ) {
    return undefined;
  }
  const target = candidate["target"];
  if (target !== undefined && !isCardRef(target)) {
    return undefined;
  }
  const oncePerTurn = pendingReplacementOncePerTurnFromPayload(
    candidate["oncePerTurn"],
  );
  if (candidate["oncePerTurn"] !== undefined && oncePerTurn === undefined) {
    return undefined;
  }
  return {
    decisionId: candidate["decisionId"],
    replacementId: candidate["replacementId"],
    effectBlockId: candidate[
      "effectBlockId"
    ] as EffectQueueEntry["effectBlockId"],
    controllerId: candidate["controllerId"] as PlayerId,
    source: candidate["source"],
    count,
    ...(target === undefined ? {} : { target }),
    ...(oncePerTurn === undefined ? {} : { oncePerTurn }),
  };
};

const pendingReplacementTrashFromHandPayload = (
  state: GameState,
  decision: NonNullable<GameState["pendingDecision"]> | undefined,
): {
  processId: string;
  payload: PendingReplacementTrashFromHandInsteadPayload;
} | null => {
  if (decision?.type !== "selectCards") {
    return null;
  }
  const processState = state.replacementState.find((candidate) => {
    const payload = candidate.payload;
    return (
      typeof payload === "object" &&
      payload !== null &&
      "pendingReplacementTrashFromHandInstead" in payload &&
      pendingReplacementTrashFromHandInsteadFromPayload(payload)?.decisionId ===
        decision.id
    );
  });
  const payload =
    processState === undefined
      ? undefined
      : pendingReplacementTrashFromHandInsteadFromPayload(processState.payload);
  return processState === undefined || payload === undefined
    ? null
    : { processId: processState.processId, payload };
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
  delete rest["pendingReplacementTrashFromHandInstead"];
  return rest;
};

export const isReplacementTrashFromHandDecision = (
  state: GameState,
  decision: NonNullable<GameState["pendingDecision"]> | undefined,
): boolean => pendingReplacementTrashFromHandPayload(state, decision) !== null;

export const getReplacementTrashFromHandLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const decision = state.pendingDecision;
  const pending = pendingReplacementTrashFromHandPayload(state, decision);
  if (
    decision?.type !== "selectCards" ||
    pending === null ||
    decision.playerId !== playerId
  ) {
    return [];
  }
  const player = state.players[playerId];
  if (player === undefined || player.hand.length < pending.payload.count) {
    return [];
  }
  return [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "cards",
        cards: player.hand
          .slice(0, pending.payload.count)
          .map((card) => toCardRef(card, playerId)),
      },
    },
  ];
};

export const applyReplacementTrashFromHandDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
): ReplacementDecisionResult | null => {
  const decision = state.pendingDecision;
  const pending = pendingReplacementTrashFromHandPayload(state, decision);
  if (decision?.type !== "selectCards" || pending === null) {
    return null;
  }
  if (action.response.type !== "cards") {
    return {
      completedPayload: undefined,
      result: toEngineResult(
        state,
        [],
        invalidDecision("Response type must be cards for selectCards."),
      ),
    };
  }
  const cards = (action.response as { cards?: unknown }).cards;
  if (!Array.isArray(cards) || !cards.every(isCardRef)) {
    return {
      completedPayload: undefined,
      result: toEngineResult(
        state,
        [],
        invalidDecision("Response cards must be CardRef values."),
      ),
    };
  }
  if (cards.length !== pending.payload.count || hasDuplicateTargets(cards)) {
    return {
      completedPayload: undefined,
      result: toEngineResult(
        state,
        [],
        invalidDecision(
          "Selected cards must match the replacement trash-from-hand count.",
        ),
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
  const selectedCards: CardInstance[] = [];
  for (const ref of cards) {
    const card = player.hand.find((candidate) =>
      cardRefsEqual(toCardRef(candidate, pending.payload.controllerId), ref),
    );
    if (card === undefined) {
      return {
        completedPayload: undefined,
        result: toEngineResult(
          state,
          [],
          invalidDecision(
            "Selected cards must be current cards in the replacement controller's hand.",
          ),
        ),
      };
    }
    selectedCards.push(card);
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
      selectedCount: cards.length,
    },
    decision.visibility,
  );
  const resolved = events[0];
  if (resolved !== undefined) {
    resolved.causedBy = { type: "decision", decisionId: decision.id };
  }
  const moved = moveConcreteCardsToTrash(state, events, selectedCards, {
    cardMovedPayloadShape: "publicZoneNames",
    cardMovedVisibility: { type: "public" },
    cardTrashedVisibility: { type: "public" },
    causedBy: { type: "decision", decisionId: decision.id },
    clearAttachedDon: true,
    emitCardTrashed: true,
    playerId: pending.payload.controllerId,
    reason: "trashFromHand",
    sourceZone: "hand",
  });
  const transformedPayload = {
    replacementId: pending.payload.replacementId,
    trashedCards: cards,
  };
  appendEvent(
    moved.state,
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
  const completedPayload = replacementPayloadWithoutPending(
    state,
    pending.processId,
  );
  const afterOncePerTurn =
    pending.payload.oncePerTurn === undefined
      ? moved.state
      : consumeOncePerTurn(
          moved.state,
          toOncePerTurnKey(pending.payload.oncePerTurn),
        );
  const nextState: GameState = {
    ...afterOncePerTurn,
    seq: toStateSeq(afterOncePerTurn.seq + 1),
    replacementState: afterOncePerTurn.replacementState.filter(
      (candidate) => candidate.processId !== pending.processId,
    ),
    eventJournal: [...afterOncePerTurn.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  return {
    completedPayload,
    result: toEngineResult(nextState, events),
  };
};
