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
  MultiZoneTargetRequest,
  TargetRequest,
} from "@optcg/types";

import {
  appendEvent,
  createEvent,
  toDecisionId,
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import { cleanupResolvedLifeTrigger } from "../effect-runtime-life-trigger-cleanup.js";
import {
  createContinuousRecordsForResolvedEffect,
  isSupportedContinuousQueueEffect,
} from "../runtime/continuous/continuous.js";
import { isSupportedQueuedEffectConditionShape } from "../effect-runtime-conditions.js";
import {
  executeSelectedTargetEffectPrimitive,
  isSupportedMainEventTargetKoEffect,
  resolvePlayerId,
} from "../runtime/primitives/execute.js";
import { restFieldObjects } from "../effect-runtime-sequence/saved-field-object.js";
import {
  consumeOncePerTurn,
  isOncePerTurnUsed,
  toOncePerTurnKey,
} from "../rules/once-per-turn.js";
import { applyRuleProcessingCheckpoint } from "../rules/rule-processing.js";
import { resolvePublicTargetCandidatesForRequest } from "../selection/candidates.js";

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
  finalizeSelectedTargetEffectResolution: (
    state: GameState,
    eventBaseState: GameState,
    resolvedEntry: EffectQueueEntry,
    allEvents: EngineEvent[],
    resolutionEvents: readonly EngineEvent[],
  ) => EngineResult;
  continueSelectedTargetEffect: (
    state: GameState,
    decision: SelectTargetsDecision,
    selectedTargets: readonly CardRef[],
  ) => EngineResult;
  resolveQueuedTargetRequest: (
    state: GameState,
    entry: EffectQueueEntry,
  ) => TargetRequest | MultiZoneTargetRequest | undefined;
  createSelectTargetsDecisionForQueuedEffect: (
    state: GameState,
    entry: EffectQueueEntry,
    request: TargetRequest | MultiZoneTargetRequest,
    options: SelectTargetsDecisionOptions,
  ) => EngineResult;
}

type SupportedSelectedTargetKoEffect = Extract<Effect, { type: "ko" }> & {
  target: Extract<Target, { type: "choose" }>;
};
type SupportedSelectedTargetRestEffect = Extract<Effect, { type: "rest" }> & {
  target: Extract<Target, { type: "choose" | "chooseFromZones" }>;
};
type SupportedSelectedTargetContinuousEffect =
  | (Extract<Effect, { type: "modifyPower" }> & {
      target: Extract<Target, { type: "choose" }>;
    })
  | (Extract<Effect, { type: "cannotAttack" }> & {
      target: Extract<Target, { type: "choose" }>;
    })
  | (Extract<Effect, { type: "cannotBlock" }> & {
      target: Extract<Target, { type: "choose" }>;
    });

const isEffectQueueCausality = (
  causedBy: CausalityRef,
): causedBy is Extract<CausalityRef, { type: "effect" }> =>
  causedBy.type === "effect";

const isFieldZoneForActivateMain = (
  zone: CardRef["zone"],
): zone is NonNullable<CardRef["zone"]> =>
  zone?.zone === "leaderArea" ||
  zone?.zone === "characterArea" ||
  zone?.zone === "stageArea";

const isScopedActivateMainTargetQueueEntry = (
  entry: EffectQueueEntry,
): boolean =>
  entry.causedBy.type === "ruleProcess" &&
  entry.causedBy.name === "effectRuntime:activateMain" &&
  String(entry.id).startsWith("queue-entry:activate-main:") &&
  String(entry.timingWindowId).startsWith("timing-window:activate-main:") &&
  entry.generation === 0 &&
  entry.triggerEventId === undefined &&
  entry.sourcePresencePolicy === "mustRemainInSameZone" &&
  isFieldZoneForActivateMain(entry.source.zone) &&
  isFieldZoneForActivateMain(entry.sourceSnapshot.zone);

export const isSupportedTargetChoiceEffectShape = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: SupportedSelectedTargetKoEffect;
} => {
  if (effect.trigger.type === "main") {
    if (isSupportedMainEventTargetKoEffect(effect)) {
      return true;
    }
    if (effect.oncePerTurn !== true) {
      return false;
    }
    const effectWithoutOncePerTurn: EffectDefinition["effects"][number] = {
      ...effect,
    };
    delete effectWithoutOncePerTurn.oncePerTurn;
    return isSupportedMainEventTargetKoEffect(effectWithoutOncePerTurn);
  }
  if (effect.category !== "auto") {
    return false;
  }
  if (effect.optional || effect.oncePerTurn) {
    return false;
  }
  return (
    effect.sourcePresencePolicy !== undefined &&
    effect.cost === undefined &&
    effect.conditionTiming === undefined &&
    effect.failurePolicy === undefined &&
    ((effect.effect.type === "ko" && isChooseTarget(effect.effect.target)) ||
      (effect.effect.type === "rest" &&
        isSelectableTarget(effect.effect.target)))
  );
};
const isSupportedTargetChoiceContinuousShape = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: SupportedSelectedTargetContinuousEffect;
} => {
  if (effect.trigger.type === "main") {
    if (!isSupportedContinuousQueueEffect(effect.effect)) return false;
    if (!("target" in effect.effect) || !isChooseTarget(effect.effect.target)) {
      return false;
    }
    return (
      effect.category === "auto" &&
      effect.cost === undefined &&
      effect.conditionTiming === undefined &&
      effect.failurePolicy === undefined
    );
  }
  if (effect.trigger.type === "activateMain") {
    if (!isSupportedContinuousQueueEffect(effect.effect)) return false;
    if (!("target" in effect.effect) || !isChooseTarget(effect.effect.target)) {
      return false;
    }
    return (
      effect.category === "activate" &&
      effect.sourcePresencePolicy === "mustRemainInSameZone" &&
      effect.optional !== true &&
      effect.cost === undefined &&
      effect.conditionTiming === undefined &&
      effect.failurePolicy === undefined &&
      isSupportedQueuedEffectConditionShape(effect.condition)
    );
  }
  if (effect.category !== "auto") return false;
  if (effect.optional || effect.oncePerTurn) return false;
  if (
    effect.cost !== undefined ||
    effect.conditionTiming !== undefined ||
    effect.failurePolicy !== undefined
  ) {
    return false;
  }
  if (!isSupportedContinuousQueueEffect(effect.effect)) return false;
  if (!("target" in effect.effect)) return false;
  return effect.effect.target.type === "choose";
};

type EffectWithTarget = Extract<Effect, { target: unknown }>;

const isChooseTarget = (
  target: EffectWithTarget["target"],
): target is Extract<Target, { type: "choose" }> =>
  typeof target === "object" && "type" in target && target.type === "choose";

const isSelectableTarget = (
  target: EffectWithTarget["target"],
): target is Extract<Target, { type: "choose" | "chooseFromZones" }> =>
  typeof target === "object" &&
  "type" in target &&
  (target.type === "choose" || target.type === "chooseFromZones");

const targetRequestForEffect = (
  effect: Effect,
): TargetRequest | MultiZoneTargetRequest | undefined => {
  if (!("target" in effect)) {
    return undefined;
  }
  return isSelectableTarget(effect.target) ? effect.target.request : undefined;
};

const targetRequestsEqual = (
  left: TargetRequest | MultiZoneTargetRequest,
  right: TargetRequest | MultiZoneTargetRequest,
): boolean => JSON.stringify(left) === JSON.stringify(right);

export const isUnsupportedSelectTargetsDecision = (
  state: GameState,
  decision: SelectTargetsDecision,
  resolveImplementedDslEffectDefinition: ResolveImplementedDslEffectDefinition,
): boolean => {
  const causedBy = decision.causedBy;
  if (!isEffectQueueCausality(causedBy)) {
    return false;
  }
  const entry = state.effectQueue.find(
    (candidate) => candidate.id === causedBy.queueEntryId,
  );
  if (entry === undefined) {
    return false;
  }
  const resolved = state.cardManifest.cards[entry.source.cardId];
  if (resolved === undefined) {
    return false;
  }
  const lookup = resolveImplementedDslEffectDefinition(
    resolved,
    state.cardManifest,
  );
  if (!lookup.ok) {
    return resolved.support.status === "unsupported";
  }
  const match = lookup.definition.effects.find(
    (effect) => effect.id === entry.effectBlockId,
  );
  return (
    match !== undefined &&
    (match.sourcePresencePolicy !== entry.sourcePresencePolicy ||
      (match.trigger.type === "activateMain" &&
        !isScopedActivateMainTargetQueueEntry(entry)) ||
      (!isSupportedTargetChoiceEffectShape(match) &&
        !isSupportedTargetChoiceContinuousShape(match)) ||
      !targetRequestsEqual(match.effect.target.request, decision.request))
  );
};

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
  ): TargetRequest | MultiZoneTargetRequest | undefined => {
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
      (match.trigger.type === "activateMain" &&
        !isScopedActivateMainTargetQueueEntry(entry)) ||
      (!isSupportedTargetChoiceEffectShape(match) &&
        !isSupportedTargetChoiceContinuousShape(match))
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
        effect:
          | SupportedSelectedTargetKoEffect
          | SupportedSelectedTargetRestEffect
          | SupportedSelectedTargetContinuousEffect;
        oncePerTurn: boolean;
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
      (match.trigger.type === "activateMain" &&
        !isScopedActivateMainTargetQueueEntry(entry)) ||
      (!isSupportedTargetChoiceEffectShape(match) &&
        !isSupportedTargetChoiceContinuousShape(match)) ||
      !targetRequestsEqual(match.effect.target.request, decision.request)
    ) {
      return { ok: false };
    }
    return {
      ok: true,
      entry,
      effect: match.effect,
      oncePerTurn: match.oncePerTurn === true,
    };
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

  const finalizeSelectedTargetEffectResolution: EffectRuntimeQueueTargetDecisions["finalizeSelectedTargetEffectResolution"] =
    (state, eventBaseState, resolvedEntry, allEvents, resolutionEvents) => {
      let nextState: GameState = {
        ...state,
        effectQueue: state.effectQueue.filter(
          (entry) => entry.id !== resolvedEntry.id,
        ),
      };
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
          queueEntryId: resolvedEntry.id,
          timingWindowId: resolvedEntry.timingWindowId,
          generation: resolvedEntry.generation,
          effectBlockId: resolvedEntry.effectBlockId,
          ...(resolvedEntry.triggerEventId !== undefined
            ? { triggerEventId: resolvedEntry.triggerEventId }
            : {}),
          sourcePresencePolicy: resolvedEntry.sourcePresencePolicy,
          orderingGroup: resolvedEntry.orderingGroup,
          status: "resolved" as const,
        },
        { type: "public" },
      );
      const resolvedEvent = resolvedEvents[0];
      if (resolvedEvent !== undefined) {
        resolvedEvent.causedBy = {
          type: "effect",
          queueEntryId: resolvedEntry.id,
          effectId: resolvedEntry.effectBlockId,
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
            queueEntryId: resolvedEntry.id,
            effectId: resolvedEntry.effectBlockId,
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

      const cleanup = cleanupResolvedLifeTrigger(nextState, resolvedEntry);
      nextState = cleanup.state;
      allEvents.push(...cleanup.events);

      const koQueueEventCount = allEvents.length;
      const koQueued = dependencies.queueBattleKOTriggers(
        nextState,
        eventBaseState,
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
        resolvedEntry,
        [...resolutionEvents, ...resolvedEvents, ...cleanup.events],
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

  const continueSelectedTargetEffect: EffectRuntimeQueueTargetDecisions["continueSelectedTargetEffect"] =
    (state, decision, selectedTargets) => {
      const resolved = resolveSelectedTargetEffect(state, decision);
      if (!resolved.ok) {
        return unsupportedContinuationResult(state);
      }
      let nextState = state;
      if (resolved.oncePerTurn) {
        const oncePerTurnKey = toOncePerTurnKey({
          cardInstanceId: resolved.entry.source.instanceId,
          effectId: resolved.entry.effectBlockId,
          turnNumber: state.turn.globalTurn,
        });
        if (isOncePerTurnUsed(nextState, oncePerTurnKey)) {
          return unsupportedContinuationResult(state);
        }
        nextState = consumeOncePerTurn(nextState, oncePerTurnKey);
      }

      const resolvingEntry: EffectQueueEntry = {
        ...resolved.entry,
        state: "resolving",
      };
      const queueRemovedState: GameState = {
        ...nextState,
        effectQueue: nextState.effectQueue.filter(
          (entry) => entry.id !== resolved.entry.id,
        ),
      };
      if (resolved.effect.type === "rest") {
        const rested = restFieldObjects(queueRemovedState, selectedTargets, {
          sourceKind: "cardEffect",
          sourceControllerId: resolved.entry.controllerId,
          sourceCardCategory: resolved.entry.sourceSnapshot.category,
        });
        nextState = rested.changed
          ? { ...rested.state, seq: toStateSeq(rested.state.seq + 1) }
          : rested.state;
        const allEvents: EngineEvent[] = [];
        return finalizeSelectedTargetEffectResolution(
          nextState,
          state,
          resolved.entry,
          allEvents,
          [],
        );
      }

      if (resolved.effect.type !== "ko") {
        const records = createContinuousRecordsForResolvedEffect(
          queueRemovedState,
          resolvingEntry,
          resolved.effect,
          selectedTargets,
        );
        if (records === null) {
          return unsupportedContinuationResult(state);
        }
        nextState = {
          ...queueRemovedState,
          continuousEffects: [
            ...queueRemovedState.continuousEffects,
            ...records,
          ],
        };
        const allEvents: EngineEvent[] = [];
        return finalizeSelectedTargetEffectResolution(
          nextState,
          state,
          resolved.entry,
          allEvents,
          [],
        );
      }
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
      if (primitive.state.pendingDecision?.type === "chooseReplacement") {
        return toEngineResult(
          {
            ...primitive.state,
            effectQueue: nextState.effectQueue.map((entry) =>
              entry.id === resolved.entry.id ? resolvingEntry : entry,
            ),
          },
          primitive.events,
        );
      }

      nextState = primitive.state;
      const allEvents: EngineEvent[] = [...primitive.events];
      return finalizeSelectedTargetEffectResolution(
        nextState,
        state,
        resolved.entry,
        allEvents,
        primitive.events,
      );
    };

  const createSelectTargetsDecisionForQueuedEffect = (
    state: GameState,
    entry: EffectQueueEntry,
    request: TargetRequest | MultiZoneTargetRequest,
    options: SelectTargetsDecisionOptions,
  ): EngineResult => {
    const resolved = resolvePublicTargetCandidatesForRequest(state, request, {
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
    finalizeSelectedTargetEffectResolution,
    failUnsupportedTargetEffectContinuation,
    resolveQueuedTargetRequest,
    createSelectTargetsDecisionForQueuedEffect,
  };
};
