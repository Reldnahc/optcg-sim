import type {
  DecisionId,
  EffectId,
  EngineEventId,
  PlayerId,
  QueueEntryId,
  StateSeq,
} from "./primitives.js";
import type { CardRef } from "./card-metadata.js";

export type EventVisibility =
  | { type: "public" }
  | { type: "private"; playerId: PlayerId }
  | { type: "hidden" }
  | { type: "replayOnly" }
  | { type: "serverOnly" };

export interface EngineEvent {
  id: EngineEventId;
  seq: number;
  type: EngineEventType;
  actor?: PlayerId;
  source?: CardRef;
  affected?: CardRef[];
  payload: unknown;
  causedBy?: CausalityRef;
  visibility: EventVisibility;
  createdAtStateSeq: StateSeq;
}

export type EngineEventType =
  | "phaseStarted"
  | "phaseEnded"
  | "cardRevealed"
  | "cardMoved"
  | "cardPlayed"
  | "cardRested"
  | "cardDrawn"
  | "cardDiscarded"
  | "cardTrashed"
  | "cardKOd"
  | "cardReturned"
  | "donAttached"
  | "donReturned"
  | "costPaid"
  | "attackDeclared"
  | "blockerActivated"
  | "counterUsed"
  | "damageWouldBeDealt"
  | "damageDealt"
  | "lifeTaken"
  | "triggerActivated"
  | "effectQueued"
  | "effectResolved"
  | "replacementApplied"
  | "decisionCreated"
  | "decisionResolved"
  | "ruleProcessingChecked"
  | "gameEnded";

export type CausalityRef =
  | { type: "playerAction"; actionId: string }
  | { type: "effect"; queueEntryId: QueueEntryId; effectId: EffectId }
  | { type: "ruleProcess"; name: string }
  | { type: "replacement"; replacementId: string }
  | { type: "decision"; decisionId: DecisionId };
