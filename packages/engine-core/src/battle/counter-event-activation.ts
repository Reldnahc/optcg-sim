import type {
  CardInstance,
  EngineEvent,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EffectId,
  GameState,
  PlayerId,
} from "@optcg/types";

import { appendEffectQueuedEvent, toStateSeq } from "../action-results.js";
import { evaluateQueuedEffectCondition } from "../effect-runtime-conditions.js";
import { isEffectBlockInvalidated } from "../effect-invalidation.js";
import { isSupportedSequenceBlock } from "../effect-runtime-sequence/support.js";
import { toSingleEffectSequence } from "../effect-runtime-sequence/support-normalization.js";
import { toCounterEventRuntimeQueueEntry } from "./counter-event-runtime-queue-entry.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type CounterSequenceBlock = EffectDefinition["effects"][number] & {
  readonly effect: SequenceEffect;
};

export interface SupportedCounterEventActivation {
  readonly effectId: EffectId;
  readonly effect: CounterSequenceBlock;
  readonly printedCost: number;
}

export const getSupportedCounterEventActivation = (
  state: GameState,
  card: CardInstance,
  controllerId: PlayerId,
  effectId: EffectId,
): SupportedCounterEventActivation | null => {
  const metadata = state.cardManifest.cards[card.cardId];
  if (
    metadata?.category !== "event" ||
    metadata.support.status !== "implemented-dsl" ||
    metadata.support.effectDefinitionId === undefined ||
    (metadata.support.customHandlerIds?.length ?? 0) > 0
  ) {
    return null;
  }

  const definition =
    state.cardManifest.effectDefinitions?.[metadata.support.effectDefinitionId];
  if (definition?.implementationStatus !== "implemented-dsl") {
    return null;
  }

  const printedCost = metadata.cost ?? 0;
  if (!Number.isInteger(printedCost) || printedCost < 0) {
    return null;
  }

  const effect = definition.effects.find(
    (candidate) => candidate.id === effectId,
  );
  if (effect === undefined || effect.trigger.type !== "counter") {
    return null;
  }
  const supportedEffect = toSupportedCounterSequence(
    state,
    card,
    controllerId,
    effect,
  );
  if (supportedEffect === null) {
    return null;
  }

  return {
    effect: supportedEffect,
    effectId: supportedEffect.id,
    printedCost,
  };
};

export const queueCounterEventEffects = (params: {
  readonly state: GameState;
  readonly controllerId: PlayerId;
  readonly source: CardInstance;
  readonly activation: SupportedCounterEventActivation;
}): { readonly state: GameState; readonly events: readonly EngineEvent[] } => {
  const events: EngineEvent[] = [];
  const entry = {
    ...toCounterEventRuntimeQueueEntry(
      params.state,
      params.controllerId,
      params.source,
      params.activation.effect,
    ),
    state: "pending" as const,
  };

  const resolved = params.state.cardManifest.cards[params.source.cardId];
  appendEffectQueuedEvent(
    params.state,
    events,
    entry,
    params.activation.effect,
    resolved,
  );

  return {
    events,
    state: {
      ...params.state,
      seq: toStateSeq(params.state.seq + 1),
      effectQueue: [...params.state.effectQueue, entry],
      eventJournal: [...params.state.eventJournal, ...events],
    },
  };
};

export const getSupportedCounterEventActivations = (
  state: GameState,
  controllerId: PlayerId,
): readonly {
  readonly card: CardInstance;
  readonly activation: SupportedCounterEventActivation;
}[] => {
  const player = state.players[controllerId];
  if (player === undefined) {
    return [];
  }

  return player.hand.flatMap((card) =>
    getSupportedCounterEventIds(state, card).flatMap((effectId) => {
      const activation = getSupportedCounterEventActivation(
        state,
        card,
        controllerId,
        effectId,
      );
      return activation === null ? [] : [{ card, activation }];
    }),
  );
};

export const getSupportedCounterEventIds = (
  state: GameState,
  card: CardInstance,
): readonly EffectId[] => {
  const metadata = state.cardManifest.cards[card.cardId];
  if (
    metadata?.category !== "event" ||
    metadata.support.status !== "implemented-dsl" ||
    metadata.support.effectDefinitionId === undefined ||
    (metadata.support.customHandlerIds?.length ?? 0) > 0
  ) {
    return [];
  }
  const definition =
    state.cardManifest.effectDefinitions?.[metadata.support.effectDefinitionId];
  if (definition?.implementationStatus !== "implemented-dsl") {
    return [];
  }
  return definition.effects
    .filter((effect) => effect.trigger.type === "counter")
    .map((effect) => effect.id);
};

const toSupportedCounterSequence = (
  state: GameState,
  card: CardInstance,
  controllerId: PlayerId,
  effect: EffectDefinition["effects"][number],
): CounterSequenceBlock | null => {
  if (
    effect.category !== "auto" ||
    effect.trigger.type !== "counter" ||
    effect.optional === true ||
    effect.oncePerTurn === true ||
    effect.conditionTiming !== undefined ||
    effect.cost !== undefined ||
    effect.failurePolicy !== undefined ||
    effect.sourcePresencePolicy !== "resolveFromDestinationZone" ||
    isEffectBlockInvalidated(state, card, effect)
  ) {
    return null;
  }

  const sequenceBlock: CounterSequenceBlock = {
    ...effect,
    effect:
      effect.effect.type === "sequence"
        ? effect.effect
        : toSingleEffectSequence(effect.effect),
  };
  const entry = toCounterEventRuntimeQueueEntry(
    state,
    controllerId,
    card,
    sequenceBlock,
  );

  if (!counterEventConditionPasses(state, entry, sequenceBlock)) {
    return null;
  }
  if (!isSupportedSequenceBlock(entry, sequenceBlock)) {
    return null;
  }

  return sequenceBlock;
};

const counterEventConditionPasses = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: EffectDefinition["effects"][number],
): boolean => {
  if (effect.condition === undefined) {
    return true;
  }
  const evaluated = evaluateQueuedEffectCondition(
    state,
    entry,
    effect.condition,
  );
  return evaluated.supported && evaluated.passed;
};
