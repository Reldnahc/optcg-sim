import type {
  CardRef,
  EffectDefinition,
  EffectQueueEntry,
  EngineEvent,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

type EffectBlock = EffectDefinition["effects"][number];

export const expectedEffectQueuedPayload = (options: {
  readonly queueEntryId: string;
  readonly timingWindowId: string;
  readonly effectBlockId: EffectBlock["id"];
  readonly triggerEventId: EngineEvent["id"];
  readonly sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  readonly orderingGroup: EffectQueueEntry["orderingGroup"];
  readonly controllerId: PlayerId;
  readonly source: CardRef;
  readonly effectCategory: EffectBlock["category"];
  readonly entryPoint: EffectBlock["trigger"];
  readonly sourceTypes?: readonly string[];
  readonly sourceCategory: ResolvedCard["category"];
}): unknown => ({
  queueEntryId: options.queueEntryId,
  timingWindowId: options.timingWindowId,
  generation: 0,
  effectBlockId: options.effectBlockId,
  triggerEventId: options.triggerEventId,
  sourcePresencePolicy: options.sourcePresencePolicy,
  orderingGroup: options.orderingGroup,
  controllerId: options.controllerId,
  source: options.source,
  sourceCardId: options.source.cardId,
  effectCategory: options.effectCategory,
  entryPoint: options.entryPoint,
  sourceTypes: options.sourceTypes ?? [],
  sourceCategory: options.sourceCategory,
  presentation: {
    source: options.source,
    textKind: "effect",
    activeSpanIds: [],
  },
});
