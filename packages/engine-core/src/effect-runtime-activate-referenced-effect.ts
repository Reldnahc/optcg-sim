import type {
  EffectDefinition,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  Trigger,
} from "@optcg/types";

import {
  appendEffectQueuedEvent,
  appendEffectResolvedEvent,
  toStateSeq,
} from "./action-results.js";
import {
  autoRuntimeEntryAdapterForTriggerType,
  triggerContainsType,
} from "./effect-runtime-block-support.js";
import { evaluateEffectBlockRuntimeSupport } from "./effect-runtime-admission.js";
import type { ResolveImplementedDslEffectDefinition } from "./effect-runtime-queue/target-decisions.js";
import { effectQueueEntryPresentationForEffectBlock } from "./runtime/effect-presentation.js";

type ReferencedActivationEffectBlock = EffectDefinition["effects"][number] & {
  readonly effect: Extract<
    EffectDefinition["effects"][number]["effect"],
    { type: "activateReferencedEffect" }
  > & { readonly trigger: SupportedReferencedTrigger };
};

type SupportedReferencedTrigger = Exclude<Trigger, { type: "anyOf" }>;

const isSupportedReferencedTriggerType = (
  trigger: Trigger,
): trigger is SupportedReferencedTrigger =>
  trigger.type !== "anyOf" &&
  autoRuntimeEntryAdapterForTriggerType(trigger.type) !== undefined;

const isSupportedReferencedActivationEntryTrigger = (
  trigger: Trigger,
): trigger is SupportedReferencedTrigger =>
  trigger.type !== "anyOf" &&
  autoRuntimeEntryAdapterForTriggerType(trigger.type) !== undefined;

const isSupportedActivateReferencedEntryTrigger = (
  effect: EffectDefinition["effects"][number],
  entry: EffectQueueEntry,
): effect is ReferencedActivationEffectBlock =>
  effect.sourcePresencePolicy === entry.sourcePresencePolicy &&
  effect.category === "auto" &&
  isSupportedReferencedActivationEntryTrigger(effect.trigger) &&
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
      isSupportedReferencedEffectBlock(effect, lookup.definition.effects) &&
      triggerContainsType(effect.trigger, triggerEffect.effect.trigger.type)
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
  siblingBlocks: readonly EffectDefinition["effects"][number][],
): effect is EffectDefinition["effects"][number] & {
  readonly sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
} =>
  effect.sourcePresencePolicy !== undefined &&
  effect.effect.type !== "activateReferencedEffect" &&
  evaluateEffectBlockRuntimeSupport(effect, { siblingBlocks }).supported;

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
    appendEffectQueuedEvent(
      state,
      events,
      referencedEntry,
      referencedEffect,
      resolved,
    );
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
