import type {
  EffectDefinition,
  EffectQueueEntry,
  EngineEvent,
  GameState,
} from "@optcg/types";

import { appendEvent, toStateSeq } from "./action-results.js";
import { evaluateEffectBlockRuntimeSupport } from "./effect-runtime-admission.js";
import type { ResolveImplementedDslEffectDefinition } from "./effect-runtime-queue/target-decisions.js";

const isSupportedActivateReferencedMainTrigger = (
  effect: EffectDefinition["effects"][number],
  entry: EffectQueueEntry,
): boolean =>
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
  effect.effect.trigger.type === "main";

const resolveReferencedMainEffect = (
  state: GameState,
  entry: EffectQueueEntry,
  resolveImplementedDslEffectDefinition: ResolveImplementedDslEffectDefinition,
):
  | (EffectDefinition["effects"][number] & {
      sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
    })
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
    !isSupportedActivateReferencedMainTrigger(triggerEffect, entry)
  ) {
    return undefined;
  }
  const mainEffects = lookup.definition.effects.filter(
    (effect) => effect.trigger.type === "main",
  );
  const referencedEffect = mainEffects[0];
  if (
    mainEffects.length !== 1 ||
    referencedEffect === undefined ||
    referencedEffect.sourcePresencePolicy === undefined ||
    !evaluateEffectBlockRuntimeSupport(referencedEffect).supported
  ) {
    return undefined;
  }
  return {
    ...referencedEffect,
    sourcePresencePolicy: referencedEffect.sourcePresencePolicy,
  };
};

const sourceForReferencedMainEffect = (
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
  const referencedEffect = resolveReferencedMainEffect(
    state,
    entry,
    resolveImplementedDslEffectDefinition,
  );
  if (referencedEffect === undefined) {
    return undefined;
  }
  const referencedSource = sourceForReferencedMainEffect(
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
    createdAtEventSeq: state.eventJournal.length + 1,
    queuedAtStateSeq: toStateSeq(state.seq + 1),
    sourcePresencePolicy: referencedEffect.sourcePresencePolicy,
    causedBy: {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    },
  };
  const events: EngineEvent[] = [];
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
  const queuedEvent = events[0];
  if (queuedEvent !== undefined) {
    queuedEvent.causedBy = referencedEntry.causedBy;
  }
  appendEvent(
    state,
    events,
    "effectResolved",
    {
      queueEntryId: entry.id,
      timingWindowId: entry.timingWindowId,
      generation: entry.generation,
      effectBlockId: entry.effectBlockId,
      ...(entry.triggerEventId !== undefined
        ? { triggerEventId: entry.triggerEventId }
        : {}),
      sourcePresencePolicy: entry.sourcePresencePolicy,
      orderingGroup: entry.orderingGroup,
      status: "resolved" as const,
    },
    { type: "public" },
  );
  const resolvedEvent = events[1];
  if (resolvedEvent !== undefined) {
    resolvedEvent.causedBy = {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    };
  }
  return {
    events,
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      effectQueue: [
        ...state.effectQueue.filter((candidate) => candidate.id !== entry.id),
        referencedEntry,
      ],
      eventJournal: [...state.eventJournal, ...events],
    },
  };
};
