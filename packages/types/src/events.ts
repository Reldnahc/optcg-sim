import type {
  DecisionId,
  EffectId,
  EngineEventId,
  PlayerId,
  QueueEntryId,
  StateSeq,
} from "./primitives.js";
import type { CardRef } from "./card-metadata.js";
import type { SpotlightEntryCreatedPayload } from "./effect-presentation.js";

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
  | "deckShuffled"
  | "donAttached"
  | "donReturned"
  | "costPaid"
  | "attackDeclared"
  | "blockerActivated"
  | "counterUsed"
  | "damageWouldBeDealt"
  | "damageDealt"
  | "battleEnded"
  | "lifeTaken"
  | "triggerActivated"
  | "effectQueued"
  | "effectResolved"
  | "replacementApplied"
  | "spotlightEntryCreated"
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

export type SpotlightEntryCreatedEngineEvent = EngineEvent & {
  readonly type: "spotlightEntryCreated";
  readonly payload: SpotlightEntryCreatedPayload;
};
