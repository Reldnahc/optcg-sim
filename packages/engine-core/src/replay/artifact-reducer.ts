import type {
  Action,
  DecisionId,
  DecisionResponse,
  DeterministicCheckpoint,
  DeterministicMatchEntry,
  EngineEventId,
  GameState,
  MatchId,
  PlayerId,
  StateSeq,
} from "@optcg/types";

import {
  applyDeterministicEntry,
  checkpointResolverFromList,
  hashReplayStateForScope,
} from "./deterministic-entry.js";

export interface ReplayArtifactStateFrame {
  readonly index: number;
  readonly entryIndex: number | null;
  readonly label: string;
  readonly state: GameState;
  readonly stateHash: string;
}

export type ReplayArtifactReconstructionResult =
  | {
      readonly status: "ready";
      readonly frames: readonly ReplayArtifactStateFrame[];
    }
  | {
      readonly status: "failed";
      readonly reason: string;
      readonly entryIndex?: number | undefined;
    };

type DecodeResult<T> =
  | { readonly status: "ready"; readonly value: T }
  | { readonly status: "failed"; readonly reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringField = (
  record: Record<string, unknown>,
  key: string,
): string | undefined =>
  typeof record[key] === "string" ? record[key] : undefined;

const numberField = (
  record: Record<string, unknown>,
  key: string,
): number | undefined =>
  typeof record[key] === "number" && Number.isFinite(record[key])
    ? record[key]
    : undefined;

const decodeVerification = (
  value: unknown,
): DecodeResult<DeterministicMatchEntry["verification"]> => {
  if (!isRecord(value)) {
    return {
      status: "failed",
      reason: "Deterministic entry verification is missing.",
    };
  }
  const stateSeqBefore = numberField(value, "stateSeqBefore");
  const actionSeqBefore = numberField(value, "actionSeqBefore");
  const stateHashBefore = stringField(value, "stateHashBefore");
  const stateSeqAfter = numberField(value, "stateSeqAfter");
  const actionSeqAfter = numberField(value, "actionSeqAfter");
  const stateHashAfter = stringField(value, "stateHashAfter");
  const hashScope = value["hashScope"];
  if (
    stateSeqBefore === undefined ||
    actionSeqBefore === undefined ||
    stateHashBefore === undefined ||
    stateSeqAfter === undefined ||
    actionSeqAfter === undefined ||
    stateHashAfter === undefined ||
    (hashScope !== "gameplay-v1" && hashScope !== "operational-v1")
  ) {
    return {
      status: "failed",
      reason: "Deterministic entry verification is incomplete.",
    };
  }
  return {
    status: "ready",
    value: {
      stateSeqBefore: stateSeqBefore as StateSeq,
      actionSeqBefore,
      stateHashBefore,
      stateSeqAfter: stateSeqAfter as StateSeq,
      actionSeqAfter,
      stateHashAfter,
      hashScope,
    },
  };
};

const decodeSystemOperation = (
  value: unknown,
): DecodeResult<Extract<DeterministicMatchEntry, { kind: "system" }>["operation"]> => {
  if (!isRecord(value)) {
    return {
      status: "failed",
      reason: "Deterministic system operation is missing.",
    };
  }
  const type = value["type"];
  if (type === "requestRollbackConsent") {
    const playerId = stringField(value, "playerId");
    const rollbackPointId = stringField(value, "rollbackPointId");
    const approvingPlayerId = stringField(value, "approvingPlayerId");
    const decisionId = stringField(value, "decisionId");
    const prompt = stringField(value, "prompt");
    if (
      playerId === undefined ||
      rollbackPointId === undefined ||
      approvingPlayerId === undefined ||
      decisionId === undefined ||
      prompt === undefined
    ) {
      return {
        status: "failed",
        reason: "Rollback request operation is incomplete.",
      };
    }
    return {
      status: "ready",
      value: {
        type,
        playerId: playerId as PlayerId,
        rollbackPointId,
        approvingPlayerId: approvingPlayerId as PlayerId,
        decisionId: decisionId as DecisionId,
        prompt,
      },
    };
  }
  if (type === "cancelRollbackConsent") {
    const playerId = stringField(value, "playerId");
    const rollbackPointId = stringField(value, "rollbackPointId");
    const decisionId = stringField(value, "decisionId");
    if (playerId === undefined || rollbackPointId === undefined) {
      return {
        status: "failed",
        reason: "Rollback cancel operation is incomplete.",
      };
    }
    return {
      status: "ready",
      value: {
        type,
        playerId: playerId as PlayerId,
        rollbackPointId,
        ...(decisionId === undefined
          ? {}
          : { decisionId: decisionId as DecisionId }),
      },
    };
  }
  if (type === "restoreRollbackPoint") {
    const rollbackPointId = stringField(value, "rollbackPointId");
    const requestedBy = stringField(value, "requestedBy");
    const approvedBy = stringField(value, "approvedBy");
    const restoredStateHash = stringField(value, "restoredStateHash");
    const restoredStateSeq = numberField(value, "restoredStateSeq");
    const restoredActionSeq = numberField(value, "restoredActionSeq");
    if (
      rollbackPointId === undefined ||
      requestedBy === undefined ||
      approvedBy === undefined ||
      restoredStateHash === undefined ||
      restoredStateSeq === undefined ||
      restoredActionSeq === undefined
    ) {
      return {
        status: "failed",
        reason: "Rollback restore operation is incomplete.",
      };
    }
    return {
      status: "ready",
      value: {
        type,
        rollbackPointId,
        requestedBy: requestedBy as PlayerId,
        approvedBy: approvedBy as PlayerId,
        restoredStateHash,
        restoredStateSeq: restoredStateSeq as StateSeq,
        restoredActionSeq,
      },
    };
  }
  return {
    status: "failed",
    reason: "Unsupported deterministic system operation.",
  };
};

const decodeDeterministicEntry = (
  value: unknown,
): DecodeResult<DeterministicMatchEntry> => {
  if (!isRecord(value)) {
    return { status: "failed", reason: "Replay entry is not an object." };
  }
  if (value["formatVersion"] !== "deterministic-entry-v1") {
    return {
      status: "failed",
      reason: "Replay entry has unsupported deterministic format.",
    };
  }
  const matchId = stringField(value, "matchId");
  const entrySeq = numberField(value, "entrySeq");
  const verification = decodeVerification(value["verification"]);
  if (matchId === undefined || entrySeq === undefined) {
    return {
      status: "failed",
      reason: "Deterministic entry identity is incomplete.",
    };
  }
  if (verification.status === "failed") {
    return verification;
  }
  if (value["kind"] === "action") {
    if (!isRecord(value["action"]) || typeof value["action"]["type"] !== "string") {
      return {
        status: "failed",
        reason: "Deterministic action entry is incomplete.",
      };
    }
    return {
      status: "ready",
      value: {
        formatVersion: "deterministic-entry-v1",
        matchId: matchId as MatchId,
        entrySeq,
        kind: "action",
        playerId: stringField(value, "playerId") as PlayerId,
        action: value["action"] as Action,
        verification: verification.value,
      },
    };
  }
  if (value["kind"] === "decision") {
    if (
      stringField(value, "playerId") === undefined ||
      stringField(value, "decisionId") === undefined ||
      !isRecord(value["response"]) ||
      typeof value["response"]["type"] !== "string"
    ) {
      return {
        status: "failed",
        reason: "Deterministic decision entry is incomplete.",
      };
    }
    return {
      status: "ready",
      value: {
        formatVersion: "deterministic-entry-v1",
        matchId: matchId as MatchId,
        entrySeq,
        kind: "decision",
        playerId: stringField(value, "playerId") as PlayerId,
        decisionId: stringField(value, "decisionId") as DecisionId,
        response: value["response"] as unknown as DecisionResponse,
        verification: verification.value,
      },
    };
  }
  if (value["kind"] === "system") {
    const operation = decodeSystemOperation(value["operation"]);
    if (operation.status === "failed") {
      return operation;
    }
    return {
      status: "ready",
      value: {
        formatVersion: "deterministic-entry-v1",
        matchId: matchId as MatchId,
        entrySeq,
        kind: "system",
        operation: operation.value,
        verification: verification.value,
      },
    };
  }
  return { status: "failed", reason: "Unknown deterministic entry kind." };
};

const decodeDeterministicCheckpoints = (
  values: readonly unknown[],
): DecodeResult<readonly DeterministicCheckpoint[]> => {
  const checkpoints: DeterministicCheckpoint[] = [];
  for (const [index, value] of values.entries()) {
    if (!isRecord(value)) {
      return {
        status: "failed",
        reason: `Deterministic checkpoint ${String(index)} is not an object.`,
      };
    }
    const matchId = stringField(value, "matchId");
    const checkpointId = stringField(value, "checkpointId");
    const reason = value["reason"];
    const stateSeq = numberField(value, "stateSeq");
    const actionSeq = numberField(value, "actionSeq");
    const stateHash = stringField(value, "stateHash");
    const hashScope = value["hashScope"];
    if (
      value["checkpointVersion"] !== "deterministic-checkpoint-v1" ||
      matchId === undefined ||
      checkpointId === undefined ||
      typeof reason !== "string" ||
      stateSeq === undefined ||
      actionSeq === undefined ||
      stateHash === undefined ||
      (hashScope !== "gameplay-v1" && hashScope !== "operational-v1")
    ) {
      return {
        status: "failed",
        reason: `Deterministic checkpoint ${String(index)} is incomplete.`,
      };
    }
    checkpoints.push({
      checkpointVersion: "deterministic-checkpoint-v1",
      matchId: matchId as MatchId,
      checkpointId,
      reason: reason as DeterministicCheckpoint["reason"],
      stateSeq: stateSeq as StateSeq,
      actionSeq,
      stateHash,
      hashScope,
      ...(typeof value["eventId"] === "string"
        ? { eventId: value["eventId"] as EngineEventId }
        : {}),
      ...(isRecord(value["snapshot"])
        ? { snapshot: value["snapshot"] as unknown as GameState }
        : {}),
      ...(typeof value["snapshotRef"] === "string"
        ? { snapshotRef: value["snapshotRef"] }
        : {}),
    });
  }
  return { status: "ready", value: checkpoints };
};

export const reconstructReplayArtifactStates = ({
  checkpoints,
  deterministicEntries,
  expectedFinalStateHash,
  initialState,
}: {
  readonly initialState: GameState;
  readonly deterministicEntries: readonly unknown[];
  readonly checkpoints?: readonly unknown[] | undefined;
  readonly expectedFinalStateHash?: string | undefined;
}): ReplayArtifactReconstructionResult => {
  const decodedCheckpoints = decodeDeterministicCheckpoints(checkpoints ?? []);
  if (decodedCheckpoints.status === "failed") {
    return { status: "failed", reason: decodedCheckpoints.reason };
  }
  const checkpointResolver = checkpointResolverFromList(
    decodedCheckpoints.value,
  );
  const stateHash = hashReplayStateForScope(initialState, "gameplay-v1");
  const frames: ReplayArtifactStateFrame[] = [
    {
      index: 0,
      entryIndex: null,
      label: "Initial state",
      state: structuredClone(initialState),
      stateHash,
    },
  ];
  let current = structuredClone(initialState);
  for (const [entryIndex, entry] of deterministicEntries.entries()) {
    const decoded = decodeDeterministicEntry(entry);
    if (decoded.status === "failed") {
      return { status: "failed", reason: decoded.reason, entryIndex };
    }
    if (decoded.value.kind === "system") {
      const operation = decoded.value.operation;
      if (operation.type === "restoreRollbackPoint") {
        const checkpoint = checkpointResolver(operation.rollbackPointId);
        if (checkpoint?.snapshot === undefined) {
          return {
            status: "failed",
            reason: `Rollback checkpoint ${operation.rollbackPointId} is not available.`,
            entryIndex,
          };
        }
      }
    }
    const result = applyDeterministicEntry(
      current,
      decoded.value,
      checkpointResolver,
    );
    if (result.status === "failed") {
      return { status: "failed", reason: result.reason, entryIndex };
    }
    current = result.state;
    frames.push({
      index: frames.length,
      entryIndex,
      label: result.label,
      state: structuredClone(current),
      stateHash: result.stateHash,
    });
  }
  const finalStateHash = frames.at(-1)?.stateHash ?? stateHash;
  if (
    expectedFinalStateHash !== undefined &&
    expectedFinalStateHash !== finalStateHash
  ) {
    return {
      status: "failed",
      reason: "Replay reconstruction final hash mismatch.",
    };
  }
  return { status: "ready", frames };
};
