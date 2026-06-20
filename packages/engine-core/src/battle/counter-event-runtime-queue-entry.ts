import type {
  CardInstance,
  EffectDefinition,
  EffectQueueEntry,
  GameState,
  PlayerId,
} from "@optcg/types";

import { effectQueueEntryPresentationForEffectBlock } from "../runtime/effect-presentation.js";

export const toCounterEventRuntimeQueueEntry = (
  state: GameState,
  controllerId: PlayerId,
  source: CardInstance,
  effectBlock: EffectDefinition["effects"][number],
): EffectQueueEntry => {
  const metadata = state.cardManifest.cards[source.cardId];
  const entrySource = {
    instanceId: source.instanceId,
    cardId: source.cardId,
    playerId: controllerId,
    zone: source.zone,
  };
  return {
    id: `queue-entry:counter-event-runtime:${String(source.instanceId)}:${String(effectBlock.id)}` as EffectQueueEntry["id"],
    state: "resolving",
    timingWindowId:
      `timing-window:counter-event-runtime:${String(source.instanceId)}` as EffectQueueEntry["timingWindowId"],
    generation: 0,
    controllerId,
    source: entrySource,
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: source.owner,
      controllerId,
      zone: source.zone,
      category: metadata?.category ?? "event",
      colors: metadata?.colors ?? [],
      ...(metadata?.cost === undefined ? {} : { cost: metadata.cost }),
      keywords: metadata?.printedKeywords ?? [],
    },
    effectBlockId: effectBlock.id,
    orderingGroup: "nonTurnPlayer",
    createdAtEventSeq: state.eventJournal.length,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: "resolveFromDestinationZone",
    causedBy: { type: "ruleProcess", name: "counterStep" },
    ...(metadata === undefined
      ? {}
      : effectQueueEntryPresentationForEffectBlock({
          effectBlock,
          resolvedCard: metadata,
          source: entrySource,
        })),
  };
};
