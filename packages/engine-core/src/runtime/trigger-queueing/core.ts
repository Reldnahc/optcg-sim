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

import type { EngineResultOptions } from "../../action-results.js";
import { createAttackTriggerQueueing } from "./attack.js";
import { createKOTriggerQueueing } from "./ko.js";
import { createMainEventTriggerQueueing } from "./main-event.js";
import { createOnPlayTriggerQueueing } from "./on-play.js";
import { createOpponentActivationTriggerQueueing } from "./opponent-activation.js";
import { createEndOfTurnTriggerQueueing } from "./end-turn.js";
import { createHandTrashedByEffectTriggerQueueing } from "./hand-trash.js";
import { createEventReactionTriggerQueueing } from "./event-reaction.js";

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

export type HandTrashedByEffectTriggerQueueingFailureReason =
  | "invalid-hand-trashed-by-effect-event"
  | "unsupported-hand-trashed-by-effect-definition";

export type OpponentActivationTriggerQueueingFailureReason =
  | "invalid-opponent-activation-event"
  | "unsupported-opponent-activation-definition";

export type EventReactionTriggerQueueingFailureReason =
  | "invalid-event-reaction"
  | "unsupported-event-reaction-definition";

export type EndOfYourTurnTriggerQueueingFailureReason =
  | "invalid-end-phase-event"
  | "missing-card-definition"
  | "unsupported-end-of-your-turn-definition";

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

interface HandTrashedByEffectTriggerQueueingErrorDetails {
  reason: HandTrashedByEffectTriggerQueueingFailureReason;
}

interface OpponentActivationTriggerQueueingErrorDetails {
  reason: OpponentActivationTriggerQueueingFailureReason;
}

interface EventReactionTriggerQueueingErrorDetails {
  reason: EventReactionTriggerQueueingFailureReason;
}

interface EndOfYourTurnTriggerQueueingErrorDetails {
  reason: EndOfYourTurnTriggerQueueingFailureReason;
}

export interface BattleKOTriggerCandidate {
  effectBlockId: EffectDefinition["effects"][number]["id"];
  effectBlock: EffectDefinition["effects"][number];
  resolvedCard: ResolvedCard;
  controllerId: PlayerId;
  source: EffectQueueEntry["source"];
  sourceSnapshot: EffectQueueEntry["sourceSnapshot"];
  triggerEventId: EngineEvent["id"];
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  causedBy: EffectQueueEntry["causedBy"];
  presentation?: EffectQueueEntry["presentation"];
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
  queueOnPlayTriggers: (
    state: GameState,
    options?: EngineResultOptions,
  ) => EngineResult | undefined;
  queueMainEventTriggers: (
    state: GameState,
    options?: EngineResultOptions,
  ) => EngineResult | undefined;
  queueWhenAttackingTriggers: (
    state: GameState,
    options?: EngineResultOptions,
  ) => EngineResult | undefined;
  queueOnOpponentAttackTriggers: (
    state: GameState,
    options?: EngineResultOptions,
  ) => EngineResult | undefined;
  queueHandTrashedByEffectTriggers: (
    state: GameState,
    options?: EngineResultOptions,
  ) => EngineResult | undefined;
  queueOpponentActivationTriggers: (
    state: GameState,
  ) => EngineResult | undefined;
  queueEventReactionTriggers: (
    state: GameState,
    options?: EngineResultOptions,
  ) => EngineResult | undefined;
  queueEndOfYourTurnTriggers: (state: GameState) => EngineResult | undefined;
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

const handTrashedByEffectTriggerQueueingError = (
  reason: HandTrashedByEffectTriggerQueueingFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId: "hand-trashed-by-effect-trigger-queueing",
  details: {
    reason,
  } satisfies HandTrashedByEffectTriggerQueueingErrorDetails,
});

const opponentActivationTriggerQueueingError = (
  reason: OpponentActivationTriggerQueueingFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId: "opponent-activation-trigger-queueing",
  details: {
    reason,
  } satisfies OpponentActivationTriggerQueueingErrorDetails,
});

const eventReactionTriggerQueueingError = (
  reason: EventReactionTriggerQueueingFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId: "event-reaction-trigger-queueing",
  details: {
    reason,
  } satisfies EventReactionTriggerQueueingErrorDetails,
});

const endOfYourTurnTriggerQueueingError = (
  reason: EndOfYourTurnTriggerQueueingFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId: "end-of-your-turn-trigger-queueing",
  details: { reason } satisfies EndOfYourTurnTriggerQueueingErrorDetails,
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
  const { queueEndOfYourTurnTriggers } = createEndOfTurnTriggerQueueing(
    dependencies,
    endOfYourTurnTriggerQueueingError,
  );
  const { queueHandTrashedByEffectTriggers } =
    createHandTrashedByEffectTriggerQueueing(
      dependencies,
      handTrashedByEffectTriggerQueueingError,
    );
  const { queueOpponentActivationTriggers } =
    createOpponentActivationTriggerQueueing(
      dependencies,
      opponentActivationTriggerQueueingError,
    );
  const { queueEventReactionTriggers } = createEventReactionTriggerQueueing(
    dependencies,
    eventReactionTriggerQueueingError,
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
    queueEndOfYourTurnTriggers,
    queueHandTrashedByEffectTriggers,
    queueOpponentActivationTriggers,
    queueEventReactionTriggers,
    queueWhenAttackingTriggers,
    queueOnOpponentAttackTriggers,
    queueEffectResolvedCustomTriggers,
  };
};
