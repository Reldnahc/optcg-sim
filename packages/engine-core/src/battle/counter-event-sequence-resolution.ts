import type {
  CardInstance,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
} from "@optcg/types";

import {
  assertGameStateInvariantsIfEnabled,
  type EngineResultOptions,
  illegalAction,
  toEngineResult,
} from "../action-results.js";
import { createSupportedSequenceFrameDecision } from "../effect-runtime-sequence/frames.js";
import { createSupportedTrashFromHandChoiceDecision } from "../runtime/primitives/trash-from-hand.js";
import { toCounterEventRuntimeQueueEntry } from "./counter-event-runtime-queue-entry.js";
import type { SupportedCounterEventSequence } from "./counter-event-support.js";

export const resolveCounterEventSequences = (params: {
  decisionPlayerId: PlayerId;
  events: readonly EngineEvent[];
  options?: EngineResultOptions;
  originalState: GameState;
  priorEvents: readonly EngineEvent[];
  sequenceEffects: SupportedCounterEventSequence["effects"];
  state: GameState;
  trashedCard: CardInstance;
}): EngineResult => {
  const {
    decisionPlayerId,
    events,
    options,
    originalState,
    priorEvents,
    sequenceEffects,
    state,
    trashedCard,
  } = params;
  let sequenceState = state;
  const sequenceEvents: EngineEvent[] = [];
  for (const [index, sequenceEffect] of sequenceEffects.entries()) {
    const entry = toCounterEventRuntimeQueueEntry(
      sequenceState,
      decisionPlayerId,
      trashedCard,
      sequenceEffect,
    );
    const queuedState: GameState = {
      ...sequenceState,
      effectQueue: [...sequenceState.effectQueue, entry],
    };
    const sequence = createSupportedSequenceFrameDecision(
      queuedState,
      entry,
      sequenceEffect,
      createSupportedTrashFromHandChoiceDecision,
    );
    if (sequence === undefined || !sequence.ok) {
      return illegalAction(
        originalState,
        "Unsupported Counter Event sequence effect.",
      );
    }
    sequenceEvents.push(...sequence.events);
    sequenceState = sequence.state;
    if (
      sequenceState.pendingDecision !== undefined &&
      index < sequenceEffects.length - 1
    ) {
      return illegalAction(
        originalState,
        "Unsupported paused Counter Event sequence composition.",
      );
    }
  }
  assertGameStateInvariantsIfEnabled(sequenceState, options);
  return toEngineResult(
    sequenceState,
    [...priorEvents, ...events, ...sequenceEvents],
    undefined,
    options,
  );
};
