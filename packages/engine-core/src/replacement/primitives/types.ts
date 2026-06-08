import type {
  CardInstance,
  CardRef,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

export type SelectedTargetKoReplacementDetectionFailureReason =
  | "unsupported-replacement-process"
  | "missing-card"
  | "stale-target"
  | "private-target"
  | "non-character-target"
  | "unsupported-support-status"
  | "implemented-custom-status"
  | "unexpected-vanilla-effect-definition"
  | "missing-effect-definition-id"
  | "missing-effect-definition"
  | "definition-card-id-mismatch"
  | "definition-status-mismatch"
  | "support-card-data-version-mismatch"
  | "rules-version-mismatch"
  | "source-text-hash-mismatch"
  | "definition-version-mismatch"
  | "untested-support-metadata"
  | "untested-definition-metadata"
  | "unreviewed-definition-metadata"
  | "unsupported-ko-replacement-shape"
  | "multiple-applicable-ko-replacements";

export interface SelectedTargetKoReplacementDetectionErrorDetails {
  reason: SelectedTargetKoReplacementDetectionFailureReason;
}

export interface SelectedTargetKoReplacementCandidate {
  id: string;
  effectBlockId: EffectQueueEntry["effectBlockId"];
  controllerId: PlayerId;
  oncePerTurn?: true;
  source: CardRef;
  coveredTargets?: readonly CardRef[];
  replacementEffect: Extract<Effect, { type: "replacement" }>;
}

export type FieldRemovalReplacementCandidate =
  SelectedTargetKoReplacementCandidate;

export type DetectSelectedTargetKoReplacementCandidateResult =
  | {
      ok: true;
      candidate?: SelectedTargetKoReplacementCandidate;
      candidates?: readonly SelectedTargetKoReplacementCandidate[];
    }
  | { ok: false; error: EngineError };

export type DetectFieldRemovalReplacementCandidateResult =
  | {
      ok: true;
      candidate?: FieldRemovalReplacementCandidate;
      candidates?: readonly FieldRemovalReplacementCandidate[];
    }
  | { ok: false; error: EngineError };

export type LocatedCard = {
  playerId: PlayerId;
  zone:
    | "leaderArea"
    | "characterArea"
    | "stageArea"
    | "hand"
    | "deck"
    | "trash"
    | "costArea"
    | "donDeck"
    | "life";
  card: CardInstance;
};

export type LocatedReplacementSource = {
  card: CardInstance;
  playerId: PlayerId;
  ref: CardRef;
  resolved: ResolvedCard;
};

export type SupportedReplacementEffectBlock =
  EffectDefinition["effects"][number] & {
    trigger: Extract<
      EffectDefinition["effects"][number]["trigger"],
      { type: "replacement" }
    >;
    sourcePresencePolicy: "resolveFromLastKnownInformation";
    effect: Extract<Effect, { type: "replacement" }>;
  };

export type ValidatedReplacementTarget = {
  located: LocatedCard;
  ref: CardRef;
  resolved: ResolvedCard;
};
