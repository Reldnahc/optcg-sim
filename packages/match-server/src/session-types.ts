import type {
  DecisionId,
  DecisionResponse,
  GameState,
  MatchCardManifest,
  MatchId,
  PlayerId,
} from "@optcg/types";

import type { DevMatchSnapshot } from "./dev-snapshot-types.js";

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

export interface MatchPersistenceSnapshot {
  readonly metadata: MatchSessionMetadata;
  readonly state: GameState;
  readonly manifest: MatchCardManifest;
  readonly actions: readonly StoredSessionRecord[];
  readonly decisions: readonly StoredSessionRecord[];
}

export interface RecoveryLock {
  readonly matchId: MatchId;
  readonly ownerInstanceId: string;
  readonly acquiredAt: string;
  readonly expiresAt: string;
}

export interface MatchPersistence {
  saveSnapshot(input: MatchPersistenceSnapshot): Promise<void>;
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
  releaseRecoveryLock(input: {
    readonly matchId: MatchId;
    readonly ownerInstanceId: string;
  }): Promise<void>;
  freezeMatch(input: {
    readonly matchId: MatchId;
    readonly reason: string;
    readonly frozenAt: string;
  }): Promise<void>;
}
