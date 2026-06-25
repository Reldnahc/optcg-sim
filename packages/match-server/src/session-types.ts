import type {
  DecisionId,
  DecisionResponse,
  DeterministicCheckpoint,
  DeterministicMatchEntry,
  GameState,
  InstanceId,
  MatchCardManifest,
  MatchId,
  PlayerId,
  VariantKey,
} from "@optcg/types";

import type { DevMatchSnapshot } from "./dev-snapshot-types.js";
import type { AuthSubject } from "./dev-auth.js";
import type { ReadyDeckSubmission } from "./deck-submission.js";
import type { DevDeckVerificationMode } from "./default-dev-manifest.js";
import type { DevMatchSetup } from "./local-match.js";
import type { LocalRollbackState } from "./local-rollback.js";
import type { ReplayDisplayFrameV1 } from "./replay-display-artifact.js";
import type { VerifiedSimHandoff } from "./sim-handoff.js";

export type GameType = "ranked" | "unranked" | "custom" | "dev";
export type SpectatorPolicyMode = "disabled" | "live-filtered";
export type RollbackPolicyMode =
  | "disabled"
  | "mutual-consent"
  | "host-consent"
  | "admin-only";
export type DisconnectPolicyMode =
  | "dev-none"
  | "casual-timeout"
  | "ranked-forfeit";

export type FirstPlayerChoiceSource =
  | "game-one-random-chooser"
  | "rematch-previous-loser";
export type FirstPlayerChoiceValue = "goFirst" | "goSecond";

export interface FirstPlayerChoiceState {
  readonly source: FirstPlayerChoiceSource;
  readonly chooserPlayerId: PlayerId;
  readonly choice?: FirstPlayerChoiceValue;
  readonly resolvedFirstPlayerId?: PlayerId;
  readonly rematchOfMatchId?: MatchId;
  readonly previousLoserId?: PlayerId;
}

export type MatchCreationSource =
  | { readonly type: "dev" }
  | {
      readonly type: "customLobby";
      readonly lobbyId: string;
      readonly lobbyConfigId: string;
    }
  | {
      readonly type: "queue";
      readonly ticketIds: readonly string[];
      readonly ladderId: string;
      readonly queueSnapshotId: string;
    };

export interface MatchSessionMetadata {
  readonly matchId: MatchId;
  readonly gameType: GameType;
  readonly formatId: string;
  readonly createdAt: string;
  readonly playerIds: readonly PlayerId[];
  readonly creationSource: MatchCreationSource;
  readonly disconnectPolicyMode: DisconnectPolicyMode;
  readonly rollbackPolicyMode: RollbackPolicyMode;
  readonly spectatorPolicyMode: SpectatorPolicyMode;
  readonly firstPlayerChoice: FirstPlayerChoiceState;
  readonly ownerInstanceId?: string;
}

export type SessionActionRequest =
  | {
      readonly type: "submitAction";
      readonly playerId: PlayerId;
      readonly actionIndex: number;
      readonly expectedStateSeq?: number;
      readonly selectedDonInstanceIds?: readonly InstanceId[];
    }
  | {
      readonly type: "respondToDecision";
      readonly playerId: PlayerId;
      readonly decisionId: DecisionId;
      readonly response: DecisionResponse;
    }
  | {
      readonly type: "requestRollback";
      readonly playerId: PlayerId;
      readonly rollbackPointId: string;
      readonly expectedStateSeq?: number;
    }
  | {
      readonly type: "cancelRollback";
      readonly playerId: PlayerId;
      readonly expectedStateSeq?: number;
    };

export interface ClientActionEnvelope {
  readonly protocolVersion: string;
  readonly matchId: MatchId;
  readonly playerId: PlayerId;
  readonly clientActionId: string;
  readonly expectedStateSeq: number;
  readonly expectedDecisionId?: string;
  readonly requestHash: string;
  readonly sentAtClientTime?: string;
  readonly request: SessionActionRequest;
}

export type ActionRejectionReason =
  | "staleState"
  | "futureState"
  | "idempotencyConflict"
  | "notYourTurn"
  | "illegalAction"
  | "pendingDecisionMismatch"
  | "rateLimited"
  | "matchFrozen"
  | "unsupportedCard"
  | "serverError";

export interface SessionActionResult {
  readonly type: "actionResult";
  readonly matchId: MatchId;
  readonly clientActionId: string;
  readonly accepted: boolean;
  readonly stateSeq: number;
  readonly actionSeq?: number;
  readonly reason?: ActionRejectionReason;
  readonly snapshot?: DevMatchSnapshot;
  readonly errors: readonly string[];
}

export interface StoredSessionRecord {
  readonly envelope: ClientActionEnvelope;
  readonly result: SessionActionResult;
  readonly recordedAt: string;
}

export interface StoredSessionAuditRecord {
  readonly type: "clientEnvelope";
  readonly envelope: ClientActionEnvelope;
  readonly result: SessionActionResult;
  readonly recordedAt: string;
}

export interface StoredDeterministicSessionRecord {
  readonly deterministicEntry: DeterministicMatchEntry;
  readonly audit: StoredSessionAuditRecord;
  readonly replayDisplayFrame?: ReplayDisplayFrameV1;
}

export interface StoredDeterministicCheckpointRecord {
  readonly checkpoint: DeterministicCheckpoint;
  readonly recordedAt: string;
}

export interface SessionObservation {
  readonly matchId: MatchId;
  readonly clientActionId: string;
  readonly requestType: SessionActionRequest["type"];
  readonly accepted: boolean;
  readonly reason?: ActionRejectionReason;
  readonly stateSeq: number;
  readonly actionSeq?: number;
  readonly durationMs: number;
}

export interface MatchRecoverySeatContext {
  readonly matchId: MatchId;
  readonly playerId: PlayerId;
  readonly subject?: AuthSubject;
  readonly deckSubmission?: ReadyDeckSubmission;
  readonly deckSubmissionVerificationMode?: DevDeckVerificationMode;
  readonly verifiedHandoff?: VerifiedSimHandoff;
}

export interface MatchRecoveryContext {
  readonly setup: DevMatchSetup;
  readonly seats: Readonly<Record<string, MatchRecoverySeatContext>>;
  readonly firstPlayerChoice: FirstPlayerChoiceState;
  readonly timersEnabled: boolean;
  readonly botPlayerIds: readonly PlayerId[];
  readonly rollback: LocalRollbackState;
  readonly cardVariantOverrides: Readonly<Record<InstanceId, VariantKey>>;
}

export interface MatchPersistenceSnapshot {
  readonly metadata: MatchSessionMetadata;
  readonly state: GameState;
  readonly manifest: MatchCardManifest;
  readonly recoveryContext?: MatchRecoveryContext;
  readonly actions: readonly StoredSessionRecord[];
  readonly decisions: readonly StoredSessionRecord[];
  readonly deterministicLogVersion?: "deterministic-entry-v1";
  readonly deterministicEntriesSinceSnapshot?: readonly StoredDeterministicSessionRecord[];
  readonly deterministicCheckpoints?: readonly StoredDeterministicCheckpointRecord[];
}

export interface RecoveryLock {
  readonly matchId: MatchId;
  readonly ownerInstanceId: string;
  readonly acquiredAt: string;
  readonly expiresAt: string;
}

export interface MatchPersistence {
  saveSnapshot(input: MatchPersistenceSnapshot): Promise<void>;
  appendDeterministicEntry(input: {
    readonly matchId: MatchId;
    readonly record: StoredDeterministicSessionRecord;
  }): Promise<void>;
  appendDeterministicCheckpoint(input: {
    readonly matchId: MatchId;
    readonly record: StoredDeterministicCheckpointRecord;
  }): Promise<void>;
  appendAction(input: {
    readonly matchId: MatchId;
    readonly record: StoredSessionRecord;
  }): Promise<void>;
  appendDecision(input: {
    readonly matchId: MatchId;
    readonly record: StoredSessionRecord;
  }): Promise<void>;
  loadSnapshot(matchId: MatchId): Promise<MatchPersistenceSnapshot | undefined>;
  listActiveMatchIds(): Promise<MatchId[]>;
  tryAcquireRecoveryLock(input: {
    readonly matchId: MatchId;
    readonly ownerInstanceId: string;
    readonly now: string;
    readonly ttlMs: number;
  }): Promise<RecoveryLock | undefined>;
  releaseRecoveryLock(input: { readonly lock: RecoveryLock }): Promise<void>;
  freezeMatch(input: {
    readonly matchId: MatchId;
    readonly reason: string;
    readonly frozenAt: string;
  }): Promise<void>;
}
