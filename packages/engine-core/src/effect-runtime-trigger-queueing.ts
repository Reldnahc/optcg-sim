import type {
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import { createAttackTriggerQueueing } from "./effect-runtime-trigger-queueing-attack.js";
import { createKOTriggerQueueing } from "./effect-runtime-trigger-queueing-ko.js";
import { createMainEventTriggerQueueing } from "./effect-runtime-trigger-queueing-main-event.js";
import { createOnPlayTriggerQueueing } from "./effect-runtime-trigger-queueing-on-play.js";

export type OnPlayTriggerQueueingFailureReason =
  | "invalid-card-played-event"
  | "source-presence-failed"
  | "missing-card-definition"
  | "unsupported-on-play-definition"
  | "multiple-on-play-effects";

export type WhenAttackingTriggerQueueingFailureReason =
  | "invalid-attack-declared-event"
  | "source-presence-failed"
  | "missing-card-definition"
  | "unsupported-when-attacking-definition"
  | "multiple-when-attacking-effects";

export type OnOpponentAttackTriggerQueueingFailureReason =
  | "invalid-attack-declared-event"
  | "source-presence-failed"
  | "missing-card-definition"
  | "unsupported-on-opponent-attack-definition"
  | "multiple-on-opponent-attack-effects";

export type OnKOTriggerCandidateDetectionFailureReason =
  | "invalid-ko-event-batch"
  | "source-presence-failed"
  | "missing-card-definition"
  | "unsupported-on-ko-definition"
  | "multiple-on-ko-effects";

export type MainEventTriggerQueueingFailureReason =
  | "invalid-card-played-event"
  | "source-presence-failed"
  | "missing-card-definition"
  | "unsupported-main-event-definition"
  | "multiple-main-event-effects";

interface OnPlayTriggerQueueingErrorDetails {
  reason: OnPlayTriggerQueueingFailureReason;
}

interface WhenAttackingTriggerQueueingErrorDetails {
  reason: WhenAttackingTriggerQueueingFailureReason;
}

interface OnOpponentAttackTriggerQueueingErrorDetails {
  reason: OnOpponentAttackTriggerQueueingFailureReason;
}

interface OnKOTriggerCandidateDetectionErrorDetails {
  reason: OnKOTriggerCandidateDetectionFailureReason;
}

interface MainEventTriggerQueueingErrorDetails {
  reason: MainEventTriggerQueueingFailureReason;
}

export interface BattleKOTriggerCandidate {
  effectBlockId: EffectDefinition["effects"][number]["id"];
  controllerId: PlayerId;
  source: EffectQueueEntry["source"];
  sourceSnapshot: EffectQueueEntry["sourceSnapshot"];
  triggerEventId: EngineEvent["id"];
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  causedBy: EffectQueueEntry["causedBy"];
}

export type DetectBattleKOTriggerCandidatesResult =
  | { ok: true; candidates: BattleKOTriggerCandidate[] }
  | { ok: false; error: EngineError };

export type QueueBattleKOTriggersResult =
  | { ok: true; state: GameState }
  | { ok: false; error: EngineError };

export type ResolveImplementedDslEffectDefinition = (
  resolved: ResolvedCard,
  manifest: GameState["cardManifest"],
) =>
  | { ok: true; definition: EffectDefinition }
  | { ok: false; error: EngineError };

export interface EffectRuntimeTriggerQueueingDependencies {
  resolveImplementedDslEffectDefinition: ResolveImplementedDslEffectDefinition;
  createUnsupportedPendingRuntimeWorkError: (work: {
    kind: "effectQueue";
    count: number;
  }) => EngineError;
}

export interface EffectRuntimeTriggerQueueingHelpers {
  detectBattleKOTriggerCandidates: (
    state: GameState,
    events: readonly EngineEvent[],
  ) => DetectBattleKOTriggerCandidatesResult;
  queueBattleKOTriggers: (
    state: GameState,
    eventBaseState: GameState,
    events: EngineEvent[],
  ) => QueueBattleKOTriggersResult;
  queueOnPlayTriggers: (state: GameState) => EngineResult | undefined;
  queueMainEventTriggers: (state: GameState) => EngineResult | undefined;
  queueWhenAttackingTriggers: (state: GameState) => EngineResult | undefined;
  queueOnOpponentAttackTriggers: (state: GameState) => EngineResult | undefined;
  queueEffectResolvedCustomTriggers: (
    state: GameState,
    resolvedEntry: EffectQueueEntry,
    resolutionEvents: readonly EngineEvent[],
  ) => EngineResult | undefined;
}

const onPlayTriggerQueueingError = (
  reason: OnPlayTriggerQueueingFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId: "on-play-trigger-queueing",
  details: { reason } satisfies OnPlayTriggerQueueingErrorDetails,
});

const whenAttackingTriggerQueueingError = (
  reason: WhenAttackingTriggerQueueingFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId: "when-attacking-trigger-queueing",
  details: { reason } satisfies WhenAttackingTriggerQueueingErrorDetails,
});

const onOpponentAttackTriggerQueueingError = (
  reason: OnOpponentAttackTriggerQueueingFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId: "on-opponent-attack-trigger-queueing",
  details: { reason } satisfies OnOpponentAttackTriggerQueueingErrorDetails,
});

const onKOTriggerCandidateDetectionError = (
  reason: OnKOTriggerCandidateDetectionFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId: "on-ko-trigger-candidate-detection",
  details: { reason } satisfies OnKOTriggerCandidateDetectionErrorDetails,
});

const mainEventTriggerQueueingError = (
  reason: MainEventTriggerQueueingFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId: "main-event-trigger-queueing",
  details: { reason } satisfies MainEventTriggerQueueingErrorDetails,
});

export const createEffectRuntimeTriggerQueueing = (
  dependencies: EffectRuntimeTriggerQueueingDependencies,
): EffectRuntimeTriggerQueueingHelpers => {
  const { queueOnPlayTriggers } = createOnPlayTriggerQueueing(
    dependencies,
    onPlayTriggerQueueingError,
  );
  const { queueMainEventTriggers } = createMainEventTriggerQueueing(
    dependencies,
    mainEventTriggerQueueingError,
  );
  const { queueWhenAttackingTriggers, queueOnOpponentAttackTriggers } =
    createAttackTriggerQueueing(
      dependencies,
      whenAttackingTriggerQueueingError,
      onOpponentAttackTriggerQueueingError,
    );
  const {
    detectBattleKOTriggerCandidates,
    queueBattleKOTriggers,
    queueEffectResolvedCustomTriggers,
  } = createKOTriggerQueueing(dependencies, onKOTriggerCandidateDetectionError);

  return {
    detectBattleKOTriggerCandidates,
    queueBattleKOTriggers,
    queueOnPlayTriggers,
    queueMainEventTriggers,
    queueWhenAttackingTriggers,
    queueOnOpponentAttackTriggers,
    queueEffectResolvedCustomTriggers,
  };
};
