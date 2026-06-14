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

export const appendAdmittedTriggerEntries = (
  state: GameState,
  candidates: readonly TriggerQueueCandidate[],
): { readonly state: GameState; readonly events: EngineEvent[] } => {
  const events: EngineEvent[] = [];
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    effectQueue: [
      ...state.effectQueue,
      ...candidates.map(({ entry }) => entry),
    ],
  };
  for (const { entry, effectBlock, resolved } of candidates) {
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
