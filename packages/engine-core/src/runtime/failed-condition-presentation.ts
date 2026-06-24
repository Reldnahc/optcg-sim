import type {
  EffectDefinition,
  EffectQueueEntry,
  EngineEvent,
  GameState,
} from "@optcg/types";

import { appendEffectResolvedEvent } from "../action-results.js";
import { entryWithFailedConditionPresentation } from "./effect-presentation.js";

export const appendFailedConditionSpotlightEvent = ({
  effectBlock,
  effectPath,
  entry,
  events,
  sequenceIndex,
  state,
}: {
  readonly effectBlock: EffectDefinition["effects"][number] | undefined;
  readonly effectPath?: readonly string[] | undefined;
  readonly entry: EffectQueueEntry;
  readonly events: EngineEvent[];
  readonly sequenceIndex?: number | undefined;
  readonly state: GameState;
}): GameState => {
  if (effectBlock === undefined) {
    return state;
  }
  const resolvedSourceCard = state.cardManifest.cards[entry.source.cardId];
  if (resolvedSourceCard === undefined) {
    return state;
  }
  const failedConditionEvents: EngineEvent[] = [];
  appendEffectResolvedEvent(
    state,
    failedConditionEvents,
    entryWithFailedConditionPresentation({
      effectBlock,
      effectPath,
      entry,
      resolvedCard: resolvedSourceCard,
      sequenceIndex,
    }),
    effectBlock,
    resolvedSourceCard,
    { status: "conditionFailed" },
  );
  events.push(...failedConditionEvents);
  return {
    ...state,
    eventJournal: [...state.eventJournal, ...failedConditionEvents],
  };
};
