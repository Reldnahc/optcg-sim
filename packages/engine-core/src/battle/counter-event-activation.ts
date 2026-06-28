import type {
  CardInstance,
  EngineEvent,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
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
  readonly printedCost: number;
  readonly effects: readonly CounterSequenceBlock[];
}

export const getSupportedCounterEventActivation = (
  state: GameState,
  card: CardInstance,
  controllerId: PlayerId,
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

  const effects = definition.effects
    .filter((effect) => effect.trigger.type === "counter")
    .map((effect) =>
      toSupportedCounterSequence(state, card, controllerId, effect),
    );
  if (effects.length === 0 || effects.some((effect) => effect === null)) {
    return null;
  }

  return {
    printedCost,
    effects: effects.filter(
      (effect): effect is CounterSequenceBlock => effect !== null,
    ),
  };
};

export const queueCounterEventEffects = (params: {
  readonly state: GameState;
  readonly controllerId: PlayerId;
  readonly source: CardInstance;
  readonly activation: SupportedCounterEventActivation;
}): { readonly state: GameState; readonly events: readonly EngineEvent[] } => {
  const events: EngineEvent[] = [];
  const effectBlocks = counterEventQueueBlocks(params.activation.effects);
  const queueState =
    params.activation.effects.length > 1
      ? withCounterEventQueueBlocks(
          params.state,
          params.source.cardId,
          effectBlocks,
        )
      : params.state;
  const entries = effectBlocks.map((effectBlock) =>
    ({
      ...toCounterEventRuntimeQueueEntry(
        queueState,
        params.controllerId,
        params.source,
        effectBlock,
      ),
      state: "pending" as const,
    }),
  );
  if (entries.length === 0) {
    return { events, state: queueState };
  }

  const resolved = queueState.cardManifest.cards[params.source.cardId];
  for (const [index, entry] of entries.entries()) {
    const effectBlock = effectBlocks[index];
    if (effectBlock !== undefined) {
      appendEffectQueuedEvent(queueState, events, entry, effectBlock, resolved);
    }
  }

  return {
    events,
    state: {
      ...queueState,
      seq: toStateSeq(queueState.seq + 1),
      effectQueue: [...queueState.effectQueue, ...entries],
      eventJournal: [...queueState.eventJournal, ...events],
    },
  };
};

const counterEventQueueBlocks = (
  effects: readonly CounterSequenceBlock[],
): readonly CounterSequenceBlock[] => {
  const first = effects[0];
  if (first === undefined || effects.length <= 1) {
    return effects;
  }
  return [
    {
      ...first,
      id: `${String(first.id)}:counter-batch` as CounterSequenceBlock["id"],
      effect: {
        type: "sequence",
        effects: effects.flatMap((effect) => effect.effect.effects),
      },
    },
  ];
};

const withCounterEventQueueBlocks = (
  state: GameState,
  cardId: CardInstance["cardId"],
  effectBlocks: readonly CounterSequenceBlock[],
): GameState => {
  const metadata = state.cardManifest.cards[cardId];
  const definitionId = metadata?.support.effectDefinitionId;
  if (definitionId === undefined) {
    return state;
  }
  const definition = state.cardManifest.effectDefinitions?.[definitionId];
  if (definition === undefined) {
    return state;
  }
  const existingIds = new Set(definition.effects.map((effect) => effect.id));
  const additions = effectBlocks.filter(
    (effectBlock) => !existingIds.has(effectBlock.id),
  );
  if (additions.length === 0) {
    return state;
  }
  return {
    ...state,
    cardManifest: {
      ...state.cardManifest,
      effectDefinitions: {
        ...state.cardManifest.effectDefinitions,
        [definitionId]: {
          ...definition,
          effects: [...definition.effects, ...additions],
        },
      },
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

  return player.hand.flatMap((card) => {
    const activation = getSupportedCounterEventActivation(
      state,
      card,
      controllerId,
    );
    return activation === null ? [] : [{ card, activation }];
  });
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
  const evaluated = evaluateQueuedEffectCondition(state, entry, effect.condition);
  return evaluated.supported && evaluated.passed;
};
