import type {
  CardInstance,
  CardRef,
  Effect,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  GameState,
} from "@optcg/types";

export type SearchEffect = Extract<Effect, { type: "search" }>;

export type EngineInternalTransientCardSet = {
  id: string;
  cards: CardRef[];
  origin: string;
  ownerId?: CardInstance["owner"];
  controllerId?: CardInstance["controller"];
  visibility: { type: string; playerId: EffectQueueEntry["controllerId"] };
  cleanupPolicy: "returnToOrigin";
};

export type SearchRevealTransientSetResult =
  | {
      events: EngineEvent[];
      kind: "created";
      ok: true;
      state: GameState;
      transientSet: EngineInternalTransientCardSet;
      transientSetHash: string;
    }
  | {
      events: EngineEvent[];
      kind: "noEligibleCandidate";
      ok: true;
      state: GameState;
    }
  | {
      error: EngineError;
      events: EngineEvent[];
      ok: false;
      state: GameState;
    };

export type SearchRevealChoiceDecisionResult =
  | {
      events: EngineEvent[];
      kind: "decisionCreated";
      ok: true;
      state: GameState;
      transientSet: EngineInternalTransientCardSet;
      transientSetHash: string;
    }
  | {
      events: EngineEvent[];
      kind: "noEligibleCandidate";
      ok: true;
      state: GameState;
    }
  | {
      error: EngineError;
      events: EngineEvent[];
      ok: false;
      state: GameState;
    };

export type SearchRevealSupportGateFailureReason =
  | "unsupported-effect-shape"
  | "unsupported-zone"
  | "unsupported-player-ref"
  | "unsupported-look-count"
  | "unsupported-filter"
  | "unsupported-selection-cardinality"
  | "unsupported-destination"
  | "unsupported-visibility"
  | "unsupported-shuffle"
  | "unsupported-remaining-cards-policy"
  | "unsupported-transient-set-state";

export interface SearchRevealSupportGateErrorDetails {
  reason: SearchRevealSupportGateFailureReason;
}
