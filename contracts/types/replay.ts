import type { Action, DecisionResponse } from "./decisions.js";
import type { GameState } from "./game-state.js";
import type {
  DecisionId,
  EngineEventId,
  MatchId,
  PlayerId,
  StateSeq,
} from "./primitives.js";

export type ReplayHashScope = "gameplay-v1" | "operational-v1";

export interface DeterministicEntryVerification {
  readonly stateSeqBefore: StateSeq;
  readonly actionSeqBefore: number;
  readonly stateHashBefore: string;
  readonly stateSeqAfter: StateSeq;
  readonly actionSeqAfter: number;
  readonly stateHashAfter: string;
  readonly hashScope: ReplayHashScope;
}

export type DeterministicSystemOperation =
  | {
      readonly type: "requestRollbackConsent";
      readonly playerId: PlayerId;
      readonly rollbackPointId: string;
      readonly approvingPlayerId: PlayerId;
      readonly decisionId: DecisionId;
      readonly prompt: string;
    }
  | {
      readonly type: "cancelRollbackConsent";
      readonly playerId: PlayerId;
      readonly rollbackPointId: string;
      readonly decisionId?: DecisionId;
    }
  | {
      readonly type: "restoreRollbackPoint";
      readonly rollbackPointId: string;
      readonly requestedBy: PlayerId;
      readonly approvedBy: PlayerId;
      readonly restoredStateHash: string;
      readonly restoredStateSeq: StateSeq;
      readonly restoredActionSeq: number;
    };

export type DeterministicMatchEntry =
  | {
      readonly formatVersion: "deterministic-entry-v1";
      readonly matchId: MatchId;
      readonly entrySeq: number;
      readonly kind: "action";
      readonly playerId: PlayerId;
      readonly action: Action;
      readonly verification: DeterministicEntryVerification;
    }
  | {
      readonly formatVersion: "deterministic-entry-v1";
      readonly matchId: MatchId;
      readonly entrySeq: number;
      readonly kind: "decision";
      readonly playerId: PlayerId;
      readonly decisionId: DecisionId;
      readonly response: DecisionResponse;
      readonly verification: DeterministicEntryVerification;
    }
  | {
      readonly formatVersion: "deterministic-entry-v1";
      readonly matchId: MatchId;
      readonly entrySeq: number;
      readonly kind: "system";
      readonly operation: DeterministicSystemOperation;
      readonly verification: DeterministicEntryVerification;
    };

export interface DeterministicCheckpoint {
  readonly checkpointVersion: "deterministic-checkpoint-v1";
  readonly matchId: MatchId;
  readonly checkpointId: string;
  readonly reason:
    | "initial"
    | "turnStart"
    | "rollbackPoint"
    | "rollbackRestore"
    | "recoverySnapshot"
    | "matchEnd";
  readonly stateSeq: StateSeq;
  readonly actionSeq: number;
  readonly stateHash: string;
  readonly hashScope: ReplayHashScope;
  readonly eventId?: EngineEventId;
  readonly snapshot?: GameState;
  readonly snapshotRef?: string;
}
