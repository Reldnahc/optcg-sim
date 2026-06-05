import type {
  CardRef,
  Cost,
  EffectQueueEntry,
  PlayerId,
  ReplacementProcess,
} from "@optcg/types";

export interface PendingReplacementPayCostInsteadPayload {
  decisionId: string;
  effectBlockId: EffectQueueEntry["effectBlockId"];
  replacementId: string;
  source: CardRef;
  target?: CardRef;
  coveredTargets?: CardRef[];
  causedBy: ReplacementProcess["causedBy"];
  controllerId: PlayerId;
  cost: Cost;
}

export interface EngineInternalReplacementAppliedEventPayload {
  processId: ReplacementProcess["id"];
  replacementId: string;
  previousPayloadHash: string;
  transformedPayloadHash: string;
}
