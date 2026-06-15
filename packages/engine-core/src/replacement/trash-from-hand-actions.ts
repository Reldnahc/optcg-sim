import type {
  Action,
  ActiveEffectTextPresentation,
  CardInstance,
  CardRef,
  CausalityRef,
  CardFilter,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "../action-results.js";
import { toCardRef, zonesEqual } from "../actions/state.js";
import { cardMatchesHandSelectionFilter } from "../actions/state.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import { moveConcreteCardsToTrash } from "../concrete-card-movement.js";
import { consumeOncePerTurnForKey } from "../rules/once-per-turn.js";
import { isCausalityRef } from "./field-removal-targets.js";
import {
  findReplacementContinuationPayload,
  replacementPayloadWithoutPendingKey,
  replacementProcessFromContinuation,
} from "./continuation-state.js";
import { activeEffectTextPresentationFromPayloadValue } from "./presentation-payload.js";
import { removeReplacementProcessState } from "./process-gate.js";
import { continueUncoveredFieldRemovalTargets } from "./unreplaced-field-removal.js";

interface PendingReplacementTrashFromHandInsteadPayload {
  decisionId: string;
  effectBlockId: EffectQueueEntry["effectBlockId"];
  replacementId: string;
  source: CardRef;
  target?: CardRef;
  coveredTargets?: CardRef[];
  causedBy: CausalityRef;
  controllerId: PlayerId;
  count: number;
  presentation?: ActiveEffectTextPresentation;
  filter?: CardFilter;
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
  presentation?: ActiveEffectTextPresentation;
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

const cardRefArrayFromPayloadValue = (value: unknown): CardRef[] | undefined =>
  value === undefined
    ? undefined
    : Array.isArray(value) && value.every(isCardRef)
      ? value
      : undefined;

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
    !isCausalityRef(candidate["causedBy"]) ||
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
    causedBy: candidate["causedBy"],
    count,
    ...(candidate["filter"] === undefined
      ? {}
      : { filter: candidate["filter"] as CardFilter }),
    ...(target === undefined ? {} : { target }),
    ...(coveredTargets === undefined ? {} : { coveredTargets }),
    ...(presentation === undefined ? {} : { presentation }),
    ...(oncePerTurn === undefined ? {} : { oncePerTurn }),
  };
};

const pendingReplacementTrashFromHandPayload = (
  state: GameState,
  decision: NonNullable<GameState["pendingDecision"]> | undefined,
) =>
  findReplacementContinuationPayload({
    state,
    decision,
    decisionType: "selectCards",
    pendingKey: "pendingReplacementTrashFromHandInstead",
    parsePayload: pendingReplacementTrashFromHandInsteadFromPayload,
  });

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
    if (
      card === undefined ||
      !cardMatchesHandSelectionFilter(
        state,
        pending.payload.controllerId,
        card,
        pending.payload.filter,
      )
    ) {
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
        replacementPayloadWithoutPendingKey({
          state,
          processId: pending.processId,
          pendingKey: "pendingReplacementTrashFromHandInstead",
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
  const completedPayload = replacementPayloadWithoutPendingKey({
    state,
    processId: pending.processId,
    pendingKey: "pendingReplacementTrashFromHandInstead",
  });
  const afterOncePerTurn =
    pending.payload.oncePerTurn === undefined
      ? moved.state
      : consumeOncePerTurnForKey(moved.state, pending.payload.oncePerTurn);
  const process = replacementProcessFromContinuation({
    causedBy: pending.payload.causedBy,
    payload: completedPayload,
    processId: pending.processId,
    type: pending.processType,
    usedReplacementId: pending.payload.replacementId,
  });
  const continued =
    process === null
      ? { state: afterOncePerTurn }
      : continueUncoveredFieldRemovalTargets(
          afterOncePerTurn,
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
    replacementState: removeReplacementProcessState(
      continued.state,
      pending.processId,
    ).replacementState,
    eventJournal: [...continued.state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  return {
    completedPayload,
    result: toEngineResult(nextState, events),
  };
};
