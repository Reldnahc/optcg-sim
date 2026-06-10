import type {
  EffectDefinition,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  Trigger,
} from "@optcg/types";

import {
  appendEffectResolvedEvent,
  appendEvent,
  toStateSeq,
} from "./action-results.js";
import { autoRuntimeEntryAdapterForTriggerType } from "./effect-runtime-block-support.js";
import { evaluateEffectBlockRuntimeSupport } from "./effect-runtime-admission.js";
import type { ResolveImplementedDslEffectDefinition } from "./effect-runtime-queue/target-decisions.js";
import { effectQueueEntryPresentationForEffectBlock } from "./runtime/effect-presentation.js";

type ReferencedActivationEffectBlock = EffectDefinition["effects"][number] & {
  readonly effect: Extract<
    EffectDefinition["effects"][number]["effect"],
    { type: "activateReferencedEffect" }
  >;
};

const isSupportedReferencedTriggerType = (trigger: Trigger): boolean =>
  autoRuntimeEntryAdapterForTriggerType(trigger.type) !== undefined;

const isSupportedActivateReferencedEntryTrigger = (
  effect: EffectDefinition["effects"][number],
  entry: EffectQueueEntry,
): effect is ReferencedActivationEffectBlock =>
  effect.sourcePresencePolicy === entry.sourcePresencePolicy &&
  effect.category === "auto" &&
  effect.trigger.type === "trigger" &&
  effect.optional !== true &&
  effect.oncePerTurn !== true &&
  effect.conditionTiming === undefined &&
  effect.cost === undefined &&
  effect.failurePolicy === undefined &&
  effect.effect.type === "activateReferencedEffect" &&
  effect.effect.source.type === "triggerCard" &&
  isSupportedReferencedTriggerType(effect.effect.trigger);

const resolveReferencedEffects = (
  state: GameState,
  entry: EffectQueueEntry,
  resolveImplementedDslEffectDefinition: ResolveImplementedDslEffectDefinition,
):
  | readonly (EffectDefinition["effects"][number] & {
      readonly sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
    })[]
  | undefined => {
  const resolved = state.cardManifest.cards[entry.source.cardId];
  if (resolved === undefined) {
    return undefined;
  }
  const lookup = resolveImplementedDslEffectDefinition(
    resolved,
    state.cardManifest,
  );
  if (!lookup.ok) {
    return undefined;
  }
  const triggerEffect = lookup.definition.effects.find(
    (effect) => effect.id === entry.effectBlockId,
  );
  if (
    triggerEffect === undefined ||
    !isSupportedActivateReferencedEntryTrigger(triggerEffect, entry)
  ) {
    return undefined;
  }
  const supportedReferencedEffects: (EffectDefinition["effects"][number] & {
    readonly sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  })[] = [];
  for (const effect of lookup.definition.effects) {
    if (
      effect.id !== triggerEffect.id &&
      isSupportedReferencedEffectBlock(effect) &&
      effect.trigger.type === triggerEffect.effect.trigger.type
    ) {
      supportedReferencedEffects.push(effect);
    }
  }
  if (supportedReferencedEffects.length === 0) {
    return undefined;
  }
  return supportedReferencedEffects;
};

const isSupportedReferencedEffectBlock = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  readonly sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
} =>
  effect.sourcePresencePolicy !== undefined &&
  evaluateEffectBlockRuntimeSupport(effect).supported;

const sourceForReferencedEffect = (
  entry: EffectQueueEntry,
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"],
): EffectQueueEntry["source"] => {
  if (sourcePresencePolicy !== "resolveFromDestinationZone") {
    return entry.source;
  }
  return {
    ...entry.source,
    zone: {
      zone: "trash",
      playerId: entry.controllerId,
      slot: "trash",
      index: 0,
    },
  };
};

export const queueReferencedMainEffectFromTrigger = (
  state: GameState,
  entry: EffectQueueEntry,
  resolveImplementedDslEffectDefinition: ResolveImplementedDslEffectDefinition,
): { events: EngineEvent[]; state: GameState } | undefined => {
  const referencedEffects = resolveReferencedEffects(
    state,
    entry,
    resolveImplementedDslEffectDefinition,
  );
  if (referencedEffects === undefined) {
    return undefined;
  }
  const resolved = state.cardManifest.cards[entry.source.cardId];
  if (resolved === undefined) {
    return undefined;
  }
  const events: EngineEvent[] = [];
  const referencedEntries: EffectQueueEntry[] = [];
  for (const referencedEffect of referencedEffects) {
    const referencedSource = sourceForReferencedEffect(
      entry,
      referencedEffect.sourcePresencePolicy,
    );
    const referencedEntry: EffectQueueEntry = {
      id: `${String(entry.id)}:referenced:${String(
        referencedEffect.id,
      )}` as EffectQueueEntry["id"],
      state: "pending",
      timingWindowId: entry.timingWindowId,
      generation: entry.generation + 1,
      controllerId: entry.controllerId,
      source: referencedSource,
      sourceSnapshot: {
        ...entry.sourceSnapshot,
        zone: referencedSource.zone ?? entry.sourceSnapshot.zone,
      },
      ...(entry.triggerEventId === undefined
        ? {}
        : { triggerEventId: entry.triggerEventId }),
      effectBlockId: referencedEffect.id,
      orderingGroup: entry.orderingGroup,
      createdAtEventSeq: state.eventJournal.length + events.length + 1,
      queuedAtStateSeq: toStateSeq(state.seq + 1),
      sourcePresencePolicy: referencedEffect.sourcePresencePolicy,
      causedBy: {
        type: "effect",
        queueEntryId: entry.id,
        effectId: entry.effectBlockId,
      },
      ...effectQueueEntryPresentationForEffectBlock({
        effectBlock: referencedEffect,
        resolvedCard: resolved,
        source: referencedSource,
      }),
    };
    appendEvent(
      state,
      events,
      "effectQueued",
      {
        queueEntryId: referencedEntry.id,
        timingWindowId: referencedEntry.timingWindowId,
        generation: referencedEntry.generation,
        effectBlockId: referencedEntry.effectBlockId,
        triggerEventId: referencedEntry.triggerEventId,
        sourcePresencePolicy: referencedEntry.sourcePresencePolicy,
        orderingGroup: referencedEntry.orderingGroup,
      },
      { type: "public" },
    );
    const queuedEvent = events[events.length - 1];
    if (queuedEvent !== undefined) {
      queuedEvent.causedBy = referencedEntry.causedBy;
    }
    referencedEntries.push(referencedEntry);
  }
  appendEffectResolvedEvent(state, events, entry);
  return {
    events,
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      effectQueue: [
        ...state.effectQueue.filter((candidate) => candidate.id !== entry.id),
        ...referencedEntries,
      ],
      eventJournal: [...state.eventJournal, ...events],
    },
  };
};
