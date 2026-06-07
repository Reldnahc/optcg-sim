import type {
  CardInstance,
  EffectDefinition,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  PlayerId,
} from "@optcg/types";

import { continueSupportedSequenceFrameFromSegment } from "../effect-runtime-sequence/frames.js";
import type { getSupportedCounterEventPower } from "./counter-event-support.js";
import { effectQueueEntryPresentationForEffectBlock } from "../runtime/effect-presentation.js";

export type CounterEventTrailingSequence = NonNullable<
  NonNullable<
    ReturnType<typeof getSupportedCounterEventPower>
  >["trailingSequence"]
>;

const toCounterEventSequenceQueueEntry = (
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
    id: `queue-entry:counter-event-trailing:${String(source.instanceId)}` as EffectQueueEntry["id"],
    state: "pending",
    timingWindowId:
      `timing-window:counter-event-trailing:${String(source.instanceId)}` as EffectQueueEntry["timingWindowId"],
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

const findCounterEventEffectBlock = (
  state: GameState,
  source: CardInstance,
  effectBlockId: EffectDefinition["effects"][number]["id"],
): EffectDefinition["effects"][number] | undefined => {
  const definitionId =
    state.cardManifest.cards[source.cardId]?.support.effectDefinitionId;
  if (definitionId === undefined) {
    return undefined;
  }
  return state.cardManifest.effectDefinitions?.[definitionId]?.effects.find(
    (effect) => effect.id === effectBlockId,
  );
};

export const continueCounterEventTrailingSequence = (
  state: GameState,
  controllerId: PlayerId,
  source: CardInstance,
  trailingSequence: CounterEventTrailingSequence,
  resumePendingDecision?: NonNullable<GameState["pendingDecision"]>,
): { events: EngineEvent[]; state: GameState } | null => {
  const effectBlock = findCounterEventEffectBlock(
    state,
    source,
    trailingSequence.effectBlockId,
  );
  if (effectBlock === undefined) {
    return null;
  }
  const firstSegment =
    effectBlock.effect.type === "sequence"
      ? effectBlock.effect.effects[0]
      : undefined;
  if (
    firstSegment === undefined ||
    firstSegment.effect.type !== "modifyPower"
  ) {
    return null;
  }
  const entry = toCounterEventSequenceQueueEntry(
    state,
    controllerId,
    source,
    effectBlock,
  );
  const continued = continueSupportedSequenceFrameFromSegment({
    completedSegmentResults: {
      "0": {
        attempted: true,
        succeeded: true,
        changedState: true,
        selectedCards: [],
        selectedTargets: [],
        paidCost: false,
        playerDeclined: false,
      },
    },
    effectBlock,
    entry,
    ...(resumePendingDecision === undefined ? {} : { resumePendingDecision }),
    startIndex: trailingSequence.startIndex,
    state,
  });
  if (continued === undefined || !continued.ok) {
    return null;
  }
  return { events: continued.events, state: continued.state };
};
