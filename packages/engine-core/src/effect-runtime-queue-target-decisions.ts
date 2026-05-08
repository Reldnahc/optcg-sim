import type {
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  MatchCardManifest,
  ResolvedCard,
  Target,
  TargetRequest,
} from "@optcg/types";

import {
  appendEvent,
  toDecisionId,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import { resolvePlayerId } from "./effect-runtime-primitives.js";
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
}

export interface SelectTargetsDecisionOptions {
  rollbackState: GameState;
  priorEvents: readonly EngineEvent[];
  errorCount: number;
}

export interface EffectRuntimeQueueTargetDecisions {
  failUnsupportedTargetEffectContinuation: (state: GameState) => EngineResult;
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

const isSupportedTargetChoiceEffectShape = (
  effect: EffectDefinition["effects"][number],
): boolean => {
  if (effect.category !== "auto") {
    return false;
  }
  if (effect.optional || effect.oncePerTurn) {
    return false;
  }
  return (
    effect.cost === undefined &&
    effect.condition === undefined &&
    effect.conditionTiming === undefined &&
    effect.failurePolicy === undefined &&
    targetRequestForEffect(effect.effect) !== undefined
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
    failUnsupportedTargetEffectContinuation,
    resolveQueuedTargetRequest,
    createSelectTargetsDecisionForQueuedEffect,
  };
};
