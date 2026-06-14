import type {
  EffectDefinition,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  ResolvedCard,
} from "@optcg/types";

import { appendEffectQueuedEvent, toStateSeq } from "../../action-results.js";
import { canAdmitOncePerTurnEffect } from "../../rules/once-per-turn.js";

export type TriggerQueueCandidate = {
  readonly entry: EffectQueueEntry;
  readonly effectBlock: EffectDefinition["effects"][number];
  readonly resolved: ResolvedCard;
};

export type TriggerQueueAdmissionResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "pending-runtime-work" | "once-per-turn-used";
    };

export const hasPendingTriggerRuntimeWork = (state: GameState): boolean =>
  state.effectQueue.length > 0 || state.deferredTriggers.length > 0;

export const canAdmitTriggerQueueEntry = (
  state: GameState,
  entry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number],
  options: { readonly allowPendingRuntimeWork?: boolean } = {},
): TriggerQueueAdmissionResult => {
  if (
    options.allowPendingRuntimeWork !== true &&
    hasPendingTriggerRuntimeWork(state)
  ) {
    return { ok: false, reason: "pending-runtime-work" };
  }
  if (!canAdmitOncePerTurnEffect(state, entry, effectBlock)) {
    return { ok: false, reason: "once-per-turn-used" };
  }
  return { ok: true };
};

const oncePerTurnBatchKey = (
  state: GameState,
  entry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number],
): string | undefined =>
  effectBlock.oncePerTurn === true
    ? [
        String(entry.source.instanceId),
        String(entry.effectBlockId),
        String(state.turn.globalTurn),
      ].join("\u0000")
    : undefined;

const filterSameBatchOncePerTurnCandidates = (
  state: GameState,
  candidates: readonly TriggerQueueCandidate[],
): TriggerQueueCandidate[] => {
  const admittedKeys = new Set<string>();
  const admitted: TriggerQueueCandidate[] = [];
  for (const candidate of candidates) {
    if (
      !canAdmitOncePerTurnEffect(state, candidate.entry, candidate.effectBlock)
    ) {
      continue;
    }
    const key = oncePerTurnBatchKey(
      state,
      candidate.entry,
      candidate.effectBlock,
    );
    if (key !== undefined) {
      if (admittedKeys.has(key)) {
        continue;
      }
      admittedKeys.add(key);
    }
    admitted.push(candidate);
  }
  return admitted;
};

export const appendAdmittedTriggerEntries = (
  state: GameState,
  candidates: readonly TriggerQueueCandidate[],
): { readonly state: GameState; readonly events: EngineEvent[] } => {
  const admitted = filterSameBatchOncePerTurnCandidates(state, candidates);
  if (admitted.length === 0) {
    return { events: [], state };
  }
  const events: EngineEvent[] = [];
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    effectQueue: [...state.effectQueue, ...admitted.map(({ entry }) => entry)],
  };
  for (const { entry, effectBlock, resolved } of admitted) {
    appendEffectQueuedEvent(state, events, entry, effectBlock, resolved);
  }
  return {
    events,
    state: {
      ...nextState,
      eventJournal: [...state.eventJournal, ...events],
    },
  };
};
