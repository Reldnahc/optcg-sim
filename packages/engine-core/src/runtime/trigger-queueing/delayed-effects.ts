import type {
  DelayedEffectRecord,
  EffectDefinition,
  EffectQueueEntry,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import {
  appendEffectQueuedEvent,
  toEngineResult,
  toStateSeq,
} from "../../action-results.js";
import { effectQueueEntryPresentationForEffectBlock } from "../effect-presentation.js";

const currentEndPhaseEvents = (state: GameState): readonly EngineEvent[] =>
  state.eventJournal.filter((event) => {
    if (
      event.type !== "phaseStarted" ||
      event.createdAtStateSeq !== state.seq
    ) {
      return false;
    }
    const payload = event.payload as { phase?: unknown; playerId?: unknown };
    return payload.phase === "end" && typeof payload.playerId === "string";
  });

const dueDelayedEffects = (
  delayedEffects: readonly DelayedEffectRecord[],
  playerId: PlayerId,
): readonly DelayedEffectRecord[] =>
  delayedEffects.filter((record) => record.controllerId === playerId);

export const queueDelayedEndOfTurnEffects = (
  state: GameState,
): EngineResult | undefined => {
  const delayedEffects = state.delayedEffects ?? [];
  if (
    delayedEffects.length === 0 ||
    state.effectQueue.length > 0 ||
    state.deferredTriggers.length > 0
  ) {
    return undefined;
  }
  const phaseEvents = currentEndPhaseEvents(state);
  if (phaseEvents.length === 0) {
    return undefined;
  }

  const appended: Array<{
    readonly entry: EffectQueueEntry;
    readonly effectBlock: EffectDefinition["effects"][number];
    readonly resolved: ResolvedCard | undefined;
  }> = [];
  const dueIds = new Set<string>();
  for (const event of phaseEvents) {
    const payload = event.payload as { playerId?: PlayerId };
    if (payload.playerId === undefined) {
      continue;
    }
    const due = dueDelayedEffects(delayedEffects, payload.playerId);
    for (const record of due) {
      dueIds.add(record.id);
      const resolvedCard = state.cardManifest.cards[record.source.cardId];
      appended.push({
        entry: {
          id: `queue-entry:delayed:${String(event.id)}:${record.id}` as EffectQueueEntry["id"],
          state: "pending",
          timingWindowId:
            `timing-window:delayed:${String(event.id)}` as EffectQueueEntry["timingWindowId"],
          generation: 0,
          controllerId: record.controllerId,
          source: record.source,
          sourceSnapshot: record.sourceSnapshot,
          effectBlockId: record.effectBlock.id,
          effectBlockOverride: record.effectBlock,
          orderingGroup: "turnPlayer",
          createdAtEventSeq: event.seq,
          queuedAtStateSeq: toStateSeq(state.seq + 1),
          sourcePresencePolicy: "noSourceRequired",
          causedBy: {
            type: "ruleProcess",
            name: "effectRuntime:delayedEndOfTurn",
          },
          ...(resolvedCard === undefined
            ? {}
            : effectQueueEntryPresentationForEffectBlock({
                effectBlock: record.effectBlock,
                resolvedCard,
                source: record.source,
              })),
        },
        effectBlock: record.effectBlock,
        resolved: resolvedCard,
      });
    }
  }
  if (appended.length === 0) {
    return undefined;
  }

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    delayedEffects: delayedEffects.filter((record) => !dueIds.has(record.id)),
    effectQueue: [...state.effectQueue, ...appended.map(({ entry }) => entry)],
  };
  const events: EngineEvent[] = [];
  for (const { entry, effectBlock, resolved } of appended) {
    appendEffectQueuedEvent(state, events, entry, effectBlock, resolved);
  }
  return toEngineResult(nextState, events);
};
