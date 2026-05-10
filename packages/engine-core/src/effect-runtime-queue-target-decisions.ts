import type {
  CardRef,
  CausalityRef,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  MatchCardManifest,
  ResolvedCard,
  SelectTargetsDecision,
  Target,
  TargetRequest,
} from "@optcg/types";

import {
  appendEvent,
  createEvent,
  toDecisionId,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import { cleanupResolvedLifeTrigger } from "./effect-runtime-life-trigger-cleanup.js";
import {
  executeSelectedTargetEffectPrimitive,
  resolvePlayerId,
} from "./effect-runtime-primitives.js";
import { applyRuleProcessingCheckpoint } from "./rule-processing.js";
import { resolvePublicTargetCandidates } from "./target-selection.js";

export type EffectQueuePendingRuntimeWork = {
  kind: "effectQueue";
  count: number;
};

export type CreateUnsupportedPendingRuntimeWorkError = (
  work: EffectQueuePendingRuntimeWork,
) => EngineError;

export type ResolveImplementedDslEffectDefinition = (
  card: ResolvedCard,
  manifest: MatchCardManifest,
) =>
  | { ok: true; definition: EffectDefinition }
  | { ok: false; error: EngineError };

export interface EffectRuntimeQueueTargetDecisionDependencies {
  resolveImplementedDslEffectDefinition: ResolveImplementedDslEffectDefinition;
  createUnsupportedPendingRuntimeWorkError: CreateUnsupportedPendingRuntimeWorkError;
  queueBattleKOTriggers: (
    state: GameState,
    eventBaseState: GameState,
    events: EngineEvent[],
  ) => { ok: true; state: GameState } | { ok: false; error: EngineError };
  queueEffectResolvedCustomTriggers: (
    state: GameState,
    resolvedEntry: EffectQueueEntry,
    resolutionEvents: readonly EngineEvent[],
  ) => EngineResult | undefined;
}

export interface SelectTargetsDecisionOptions {
  rollbackState: GameState;
  priorEvents: readonly EngineEvent[];
  errorCount: number;
}

export interface EffectRuntimeQueueTargetDecisions {
  failUnsupportedTargetEffectContinuation: (state: GameState) => EngineResult;
  continueSelectedTargetEffect: (
    state: GameState,
    decision: SelectTargetsDecision,
    selectedTargets: readonly CardRef[],
  ) => EngineResult;
  resolveQueuedTargetRequest: (
    state: GameState,
    entry: EffectQueueEntry,
  ) => TargetRequest | undefined;
  createSelectTargetsDecisionForQueuedEffect: (
    state: GameState,
    entry: EffectQueueEntry,
    request: TargetRequest,
    options: SelectTargetsDecisionOptions,
  ) => EngineResult;
}

type SupportedSelectedTargetKoEffect = Extract<Effect, { type: "ko" }> & {
  target: Extract<Target, { type: "choose" }>;
};

const isEffectQueueCausality = (
  causedBy: CausalityRef,
): causedBy is Extract<CausalityRef, { type: "effect" }> =>
  causedBy.type === "effect";

const isSupportedTargetChoiceEffectShape = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: SupportedSelectedTargetKoEffect;
} => {
  if (effect.category !== "auto") {
    return false;
  }
  if (effect.optional || effect.oncePerTurn) {
    return false;
  }
  return (
    effect.sourcePresencePolicy !== undefined &&
    effect.cost === undefined &&
    effect.condition === undefined &&
    effect.conditionTiming === undefined &&
    effect.failurePolicy === undefined &&
    effect.effect.type === "ko" &&
    isChooseTarget(effect.effect.target)
  );
};

type EffectWithTarget = Extract<Effect, { target: unknown }>;

const isChooseTarget = (
  target: EffectWithTarget["target"],
): target is Extract<Target, { type: "choose" }> =>
  typeof target === "object" && "type" in target && target.type === "choose";

const targetRequestForEffect = (effect: Effect): TargetRequest | undefined => {
  if (!("target" in effect)) {
    return undefined;
  }
  return isChooseTarget(effect.target) ? effect.target.request : undefined;
};

const targetRequestsEqual = (
  left: TargetRequest,
  right: TargetRequest,
): boolean => JSON.stringify(left) === JSON.stringify(right);

export const createEffectRuntimeQueueTargetDecisions = (
  dependencies: EffectRuntimeQueueTargetDecisionDependencies,
): EffectRuntimeQueueTargetDecisions => {
  const failUnsupportedTargetEffectContinuation = (
    state: GameState,
  ): EngineResult =>
    toEngineResult(
      state,
      [],
      [
        dependencies.createUnsupportedPendingRuntimeWorkError({
          kind: "effectQueue",
          count: state.effectQueue.length,
        }),
      ],
    );

  const resolveQueuedTargetRequest = (
    state: GameState,
    entry: EffectQueueEntry,
  ): TargetRequest | undefined => {
    const resolved = state.cardManifest.cards[entry.source.cardId];
    if (resolved === undefined) {
      return undefined;
    }
    const lookup = dependencies.resolveImplementedDslEffectDefinition(
      resolved,
      state.cardManifest,
    );
    if (!lookup.ok) {
      return undefined;
    }
    const match = lookup.definition.effects.find(
      (effect) => effect.id === entry.effectBlockId,
    );
    if (
      match === undefined ||
      match.sourcePresencePolicy !== entry.sourcePresencePolicy ||
      !isSupportedTargetChoiceEffectShape(match)
    ) {
      return undefined;
    }
    return targetRequestForEffect(match.effect);
  };

  const resolveSelectedTargetEffect = (
    state: GameState,
    decision: SelectTargetsDecision,
  ):
    | {
        ok: true;
        entry: EffectQueueEntry;
        effect: SupportedSelectedTargetKoEffect;
      }
    | { ok: false } => {
    if (!isEffectQueueCausality(decision.causedBy)) {
      return { ok: false };
    }
    const causedBy = decision.causedBy;
    const entry = state.effectQueue.find(
      (candidate) => candidate.id === causedBy.queueEntryId,
    );
    if (entry === undefined) {
      return { ok: false };
    }
    const resolved = state.cardManifest.cards[entry.source.cardId];
    if (resolved === undefined) {
      return { ok: false };
    }
    const lookup = dependencies.resolveImplementedDslEffectDefinition(
      resolved,
      state.cardManifest,
    );
    if (!lookup.ok) {
      return { ok: false };
    }
    const match = lookup.definition.effects.find(
      (effect) => effect.id === entry.effectBlockId,
    );
    if (
      match === undefined ||
      match.sourcePresencePolicy !== entry.sourcePresencePolicy ||
      !isSupportedTargetChoiceEffectShape(match) ||
      !targetRequestsEqual(match.effect.target.request, decision.request)
    ) {
      return { ok: false };
    }
    return { ok: true, entry, effect: match.effect };
  };

  const unsupportedContinuationResult = (state: GameState): EngineResult =>
    toEngineResult(
      state,
      [],
      [
        dependencies.createUnsupportedPendingRuntimeWorkError({
          kind: "effectQueue",
          count: state.effectQueue.length,
        }),
      ],
    );

  const continueSelectedTargetEffect: EffectRuntimeQueueTargetDecisions["continueSelectedTargetEffect"] =
    (state, decision, selectedTargets) => {
      const resolved = resolveSelectedTargetEffect(state, decision);
      if (!resolved.ok) {
        return unsupportedContinuationResult(state);
      }

      const resolvingEntry: EffectQueueEntry = {
        ...resolved.entry,
        state: "resolving",
      };
      const queueRemovedState: GameState = {
        ...state,
        effectQueue: state.effectQueue.filter(
          (entry) => entry.id !== resolved.entry.id,
        ),
      };
      const effectForPrimitive: SupportedSelectedTargetKoEffect =
        resolved.effect.target.request.allowFewerIfUnavailable &&
        selectedTargets.length < resolved.effect.target.request.min
          ? {
              ...resolved.effect,
              target: {
                ...resolved.effect.target,
                request: {
                  ...resolved.effect.target.request,
                  min: selectedTargets.length,
                },
              },
            }
          : resolved.effect;
      const primitive = executeSelectedTargetEffectPrimitive(
        queueRemovedState,
        resolvingEntry,
        effectForPrimitive,
        selectedTargets,
      );
      if (primitive.errors !== undefined) {
        return unsupportedContinuationResult(state);
      }

      let nextState = primitive.state;
      const allEvents: EngineEvent[] = [...primitive.events];
      const resolvedEvents: EngineEvent[] = [];
      const resolvedEventBaseState: GameState = {
        ...nextState,
        seq: toStateSeq(nextState.seq - 1),
      };
      appendEvent(
        resolvedEventBaseState,
        resolvedEvents,
        "effectResolved",
        {
          queueEntryId: resolved.entry.id,
          timingWindowId: resolved.entry.timingWindowId,
          generation: resolved.entry.generation,
          effectBlockId: resolved.entry.effectBlockId,
          ...(resolved.entry.triggerEventId !== undefined
            ? { triggerEventId: resolved.entry.triggerEventId }
            : {}),
          sourcePresencePolicy: resolved.entry.sourcePresencePolicy,
          orderingGroup: resolved.entry.orderingGroup,
          status: "resolved" as const,
        },
        { type: "public" },
      );
      const resolvedEvent = resolvedEvents[0];
      if (resolvedEvent !== undefined) {
        resolvedEvent.causedBy = {
          type: "effect",
          queueEntryId: resolved.entry.id,
          effectId: resolved.entry.effectBlockId,
        };
        nextState = {
          ...nextState,
          eventJournal: [...nextState.eventJournal, resolvedEvent],
        };
        allEvents.push(resolvedEvent);
      }

      const checkpointEvents: EngineEvent[] = [];
      const checkpointEventBaseState: GameState = {
        ...nextState,
        seq: toStateSeq(nextState.seq - 1),
      };
      nextState = applyRuleProcessingCheckpoint({
        state: nextState,
        events: checkpointEvents,
        phase: nextState.turn.phase,
        createEvent: (seqOffset, type, payload, visibility) => ({
          ...createEvent(
            checkpointEventBaseState,
            seqOffset,
            type,
            payload,
            visibility,
          ),
          causedBy: {
            type: "effect",
            queueEntryId: resolved.entry.id,
            effectId: resolved.entry.effectBlockId,
          },
        }),
      });
      if (checkpointEvents.length > 0) {
        nextState = {
          ...nextState,
          eventJournal: [...nextState.eventJournal, ...checkpointEvents],
        };
        allEvents.push(...checkpointEvents);
      }

      const cleanup = cleanupResolvedLifeTrigger(nextState, resolved.entry);
      nextState = cleanup.state;
      allEvents.push(...cleanup.events);

      const koQueueEventCount = allEvents.length;
      const koQueued = dependencies.queueBattleKOTriggers(
        nextState,
        state,
        allEvents,
      );
      if (!koQueued.ok) {
        return toEngineResult(state, [], [koQueued.error]);
      }
      const koQueuedEvents = allEvents.slice(koQueueEventCount);
      nextState =
        koQueuedEvents.length > 0
          ? {
              ...koQueued.state,
              eventJournal: [...nextState.eventJournal, ...koQueuedEvents],
            }
          : koQueued.state;

      const triggered = dependencies.queueEffectResolvedCustomTriggers(
        nextState,
        resolved.entry,
        [...primitive.events, ...resolvedEvents, ...cleanup.events],
      );
      if (triggered !== undefined) {
        if (triggered.errors !== undefined) {
          return triggered;
        }
        nextState = triggered.state;
        allEvents.push(...triggered.events);
      }

      return toEngineResult(nextState, allEvents);
    };

  const createSelectTargetsDecisionForQueuedEffect = (
    state: GameState,
    entry: EffectQueueEntry,
    request: TargetRequest,
    options: SelectTargetsDecisionOptions,
  ): EngineResult => {
    const resolved = resolvePublicTargetCandidates(state, request, {
      sourceControllerId: entry.controllerId,
    });
    const chooserId = resolvePlayerId(state, entry, request.chooser);
    if (!resolved.ok || chooserId === undefined) {
      return toEngineResult(
        options.rollbackState,
        [],
        [
          dependencies.createUnsupportedPendingRuntimeWorkError({
            kind: "effectQueue",
            count: options.errorCount,
          }),
        ],
      );
    }

    const causedBy = {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    } as const;
    const pendingDecision: NonNullable<GameState["pendingDecision"]> = {
      id: toDecisionId(`decision:selectTargets:${String(entry.id)}`),
      type: "selectTargets",
      playerId: chooserId,
      prompt: "Select targets.",
      causedBy,
      visibility: { type: "public" },
      request,
      candidates: resolved.candidates,
    };
    const events: EngineEvent[] = [];
    appendEvent(
      state,
      events,
      "decisionCreated",
      {
        decisionId: pendingDecision.id,
        decisionType: pendingDecision.type,
        playerId: pendingDecision.playerId,
      },
      { type: "public" },
    );
    const created = events[0];
    if (created !== undefined) {
      created.causedBy = causedBy;
    }

    const nextState: GameState = {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    };
    return toEngineResult(nextState, [...options.priorEvents, ...events]);
  };

  return {
    continueSelectedTargetEffect,
    failUnsupportedTargetEffectContinuation,
    resolveQueuedTargetRequest,
    createSelectTargetsDecisionForQueuedEffect,
  };
};
