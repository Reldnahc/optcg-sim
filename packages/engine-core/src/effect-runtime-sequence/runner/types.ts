import type {
  Effect,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  GameState,
} from "@optcg/types";

export type SequenceEffect = Extract<Effect, { type: "sequence" }>;
export type SequenceSegmentEffect = SequenceEffect["effects"][number]["effect"];
export type DamageEffect = Extract<Effect, { type: "damage" }>;
export type DrawEffect = Extract<Effect, { type: "draw" }>;
export type MoveCardsEffect = Extract<Effect, { type: "moveCards" }>;
export type MoveMatchingLifeCardsEffect = Extract<
  Effect,
  { type: "moveMatchingLifeCards" }
>;
export type ReturnDonEffect = Extract<Effect, { type: "returnDon" }>;
export type TrashFromHandEffect = Extract<Effect, { type: "trashFromHand" }>;
export type TrashFromHandUntilCountEffect = Extract<
  Effect,
  { type: "trashFromHandUntilCount" }
>;
export type PayCostEffect = Extract<SequenceSegmentEffect, { type: "payCost" }>;

export type SegmentLedgers = {
  savedReferences: EffectExecutionFrame["savedReferences"];
  segmentResults: EffectExecutionFrame["segmentResults"];
};

type TrashDecisionResult =
  | { events: EngineEvent[]; ok: true; state: GameState }
  | { error: EngineError; events: EngineEvent[]; ok: false; state: GameState };

export type CreateTrashFromHandSequenceDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: TrashFromHandEffect,
) => TrashDecisionResult;

export type SequenceFrameResumeResult =
  | { events: EngineEvent[]; ok: true; state: GameState }
  | { error: EngineError; ok: false }
  | undefined;

export type SequenceFrameRunResult =
  | {
      events: EngineEvent[];
      kind: "completed";
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | {
      events: EngineEvent[];
      kind: "paused";
      ok: true;
      state: GameState;
    }
  | { ok: false };

export type SequenceRuntimeFailureReason =
  | "missing-frame"
  | "missing-queue-entry"
  | "missing-effect-block"
  | "unsupported-sequence-shape"
  | "segment-execution-failed";
