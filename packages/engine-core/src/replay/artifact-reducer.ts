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
  replayStateForExpectedHash,
} from "./deterministic-entry.js";
import {
  replayEntryAfterCheckpointId,
  replayInitialCheckpointId,
} from "./deterministic-checkpoint-ids.js";

export interface ReplayArtifactStateFrame {
  readonly index: number;
  readonly entryIndex: number | null;
  readonly label: string;
  readonly state: GameState;
  readonly stateHash: string;
}

export interface ReplayArtifactFrameWindow {
  readonly start: number;
  readonly limit: number;
}

export type ReplayArtifactReconstructionResult =
  | {
      readonly status: "ready";
      readonly frames: readonly ReplayArtifactStateFrame[];
      readonly frameCount?: number | undefined;
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
): DecodeResult<
  Extract<DeterministicMatchEntry, { kind: "system" }>["operation"]
> => {
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
    if (
      !isRecord(value["action"]) ||
      typeof value["action"]["type"] !== "string"
    ) {
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

const deterministicEntryLabel = (entry: DeterministicMatchEntry): string => {
  if (entry.kind === "action") {
    return entry.action.type;
  }
  if (entry.kind === "decision") {
    return "respondToDecision";
  }
  return entry.operation.type;
};

const verifiedCheckpointSnapshot = (
  checkpoint: DeterministicCheckpoint,
  manifest: GameState["cardManifest"],
  expected?: {
    readonly actionSeq: number;
    readonly hashScope: DeterministicCheckpoint["hashScope"];
    readonly stateHash: string;
    readonly stateSeq: StateSeq;
  },
): DecodeResult<{ readonly state: GameState; readonly stateHash: string }> => {
  if (checkpoint.snapshot === undefined) {
    return {
      status: "failed",
      reason: `Replay checkpoint ${checkpoint.checkpointId} does not include a snapshot.`,
    };
  }
  if (
    expected !== undefined &&
    (checkpoint.stateSeq !== expected.stateSeq ||
      checkpoint.actionSeq !== expected.actionSeq ||
      checkpoint.hashScope !== expected.hashScope ||
      checkpoint.stateHash !== expected.stateHash)
  ) {
    return {
      status: "failed",
      reason: `Replay checkpoint ${checkpoint.checkpointId} does not match deterministic entry verification.`,
    };
  }
  const snapshot =
    checkpoint.snapshot.cardManifest.manifestHash === manifest.manifestHash &&
    Object.keys(checkpoint.snapshot.cardManifest.cards).length === 0
      ? { ...checkpoint.snapshot, cardManifest: structuredClone(manifest) }
      : checkpoint.snapshot;
  const stateHash = hashReplayStateForScope(snapshot, checkpoint.hashScope);
  if (stateHash !== checkpoint.stateHash) {
    return {
      status: "failed",
      reason: `Replay checkpoint ${checkpoint.checkpointId} snapshot hash does not match.`,
    };
  }
  return {
    status: "ready",
    value: {
      state: structuredClone(snapshot),
      stateHash,
    },
  };
};

const verifyCurrentBeforeEntry = (
  current: GameState,
  entry: DeterministicMatchEntry,
): string | undefined => {
  if (current.seq !== entry.verification.stateSeqBefore) {
    return `State sequence before mismatch: expected ${String(
      entry.verification.stateSeqBefore,
    )}, got ${String(current.seq)}.`;
  }
  if (current.actionSeq !== entry.verification.actionSeqBefore) {
    return `Action sequence before mismatch: expected ${String(
      entry.verification.actionSeqBefore,
    )}, got ${String(current.actionSeq)}.`;
  }
  const stateHash = hashReplayStateForScope(
    current,
    entry.verification.hashScope,
  );
  if (
    stateHash !== entry.verification.stateHashBefore &&
    replayStateForExpectedHash(
      current,
      entry.verification.hashScope,
      entry.verification.stateHashBefore,
    ) === undefined
  ) {
    return "State hash before deterministic entry does not match.";
  }
  return undefined;
};

export const reconstructReplayArtifactStates = ({
  checkpoints,
  deterministicEntries,
  expectedFinalStateHash,
  frameWindow,
  initialState,
}: {
  readonly initialState: GameState;
  readonly deterministicEntries: readonly unknown[];
  readonly checkpoints?: readonly unknown[] | undefined;
  readonly expectedFinalStateHash?: string | undefined;
  readonly frameWindow?: ReplayArtifactFrameWindow | undefined;
}): ReplayArtifactReconstructionResult => {
  const totalFrameCount = deterministicEntries.length + 1;
  const frameStart =
    frameWindow === undefined ? 0 : Math.max(0, Math.trunc(frameWindow.start));
  const frameLimit =
    frameWindow === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.trunc(frameWindow.limit));
  const frameEnd = Math.min(totalFrameCount, frameStart + frameLimit);
  const includeFrame = (frameIndex: number): boolean =>
    frameIndex >= frameStart && frameIndex < frameEnd;
  const ready = (
    frames: readonly ReplayArtifactStateFrame[],
  ): ReplayArtifactReconstructionResult => ({
    status: "ready",
    frames,
    ...(frameWindow === undefined ? {} : { frameCount: totalFrameCount }),
  });

  if (frameWindow !== undefined && frameStart >= totalFrameCount) {
    return ready([]);
  }

  const decodedCheckpoints = decodeDeterministicCheckpoints(checkpoints ?? []);
  if (decodedCheckpoints.status === "failed") {
    return { status: "failed", reason: decodedCheckpoints.reason };
  }
  const checkpointResolver = checkpointResolverFromList(
    decodedCheckpoints.value,
  );
  const initialCheckpoint = checkpointResolver(replayInitialCheckpointId());
  const initialFrame =
    initialCheckpoint === undefined
      ? {
          state: structuredClone(initialState),
          stateHash: hashReplayStateForScope(initialState, "gameplay-v1"),
        }
      : verifiedCheckpointSnapshot(
          initialCheckpoint,
          initialState.cardManifest,
        );
  if ("status" in initialFrame && initialFrame.status === "failed") {
    return { status: "failed", reason: initialFrame.reason };
  }
  const firstFrame =
    "status" in initialFrame ? initialFrame.value : initialFrame;
  const firstReplayFrame: ReplayArtifactStateFrame = {
    index: 0,
    entryIndex: null,
    label: "Initial state",
    state: structuredClone(firstFrame.state),
    stateHash: firstFrame.stateHash,
  };
  const frames: ReplayArtifactStateFrame[] = includeFrame(0)
    ? [firstReplayFrame]
    : [];
  if (frameWindow !== undefined && frameEnd <= 1) {
    return ready(frames);
  }
  let current = structuredClone(firstFrame.state);
  let toleratedHashMismatch = false;
  let startEntryIndex = 0;
  if (frameWindow !== undefined && frameStart > 0) {
    const previousEntryIndex = frameStart - 1;
    const previousEntry = deterministicEntries[previousEntryIndex];
    const decodedPrevious = decodeDeterministicEntry(previousEntry);
    if (decodedPrevious.status === "failed") {
      return {
        status: "failed",
        reason: decodedPrevious.reason,
        entryIndex: previousEntryIndex,
      };
    }
    const previousCheckpoint = checkpointResolver(
      replayEntryAfterCheckpointId(decodedPrevious.value.entrySeq),
    );
    if (previousCheckpoint !== undefined) {
      const checkpoint = verifiedCheckpointSnapshot(
        previousCheckpoint,
        firstFrame.state.cardManifest,
        {
          actionSeq: decodedPrevious.value.verification.actionSeqAfter,
          hashScope: decodedPrevious.value.verification.hashScope,
          stateHash: decodedPrevious.value.verification.stateHashAfter,
          stateSeq: decodedPrevious.value.verification.stateSeqAfter,
        },
      );
      if (checkpoint.status === "failed") {
        return {
          status: "failed",
          reason: checkpoint.reason,
          entryIndex: previousEntryIndex,
        };
      }
      current = checkpoint.value.state;
      frames.push({
        index: frameStart,
        entryIndex: previousEntryIndex,
        label: deterministicEntryLabel(decodedPrevious.value),
        state: structuredClone(current),
        stateHash: checkpoint.value.stateHash,
      });
      startEntryIndex = frameStart;
      if (frameEnd <= frameStart + 1) {
        return ready(frames);
      }
    }
  }
  for (const [entryIndex, entry] of deterministicEntries
    .slice(startEntryIndex)
    .entries()) {
    const absoluteEntryIndex = entryIndex + startEntryIndex;
    const frameIndex = absoluteEntryIndex + 1;
    const decoded = decodeDeterministicEntry(entry);
    if (decoded.status === "failed") {
      return {
        status: "failed",
        reason: decoded.reason,
        entryIndex: absoluteEntryIndex,
      };
    }
    const afterCheckpoint = checkpointResolver(
      replayEntryAfterCheckpointId(decoded.value.entrySeq),
    );
    if (afterCheckpoint !== undefined) {
      const beforeError = verifyCurrentBeforeEntry(current, decoded.value);
      if (beforeError !== undefined) {
        return {
          status: "failed",
          reason: beforeError,
          entryIndex: absoluteEntryIndex,
        };
      }
      const checkpoint = verifiedCheckpointSnapshot(
        afterCheckpoint,
        firstFrame.state.cardManifest,
        {
          actionSeq: decoded.value.verification.actionSeqAfter,
          hashScope: decoded.value.verification.hashScope,
          stateHash: decoded.value.verification.stateHashAfter,
          stateSeq: decoded.value.verification.stateSeqAfter,
        },
      );
      if (checkpoint.status === "failed") {
        return {
          status: "failed",
          reason: checkpoint.reason,
          entryIndex: absoluteEntryIndex,
        };
      }
      current = checkpoint.value.state;
      if (includeFrame(frameIndex)) {
        frames.push({
          index: frameIndex,
          entryIndex: absoluteEntryIndex,
          label: deterministicEntryLabel(decoded.value),
          state: structuredClone(current),
          stateHash: checkpoint.value.stateHash,
        });
      }
      if (frameWindow !== undefined && frameIndex + 1 >= frameEnd) {
        return ready(frames);
      }
      continue;
    }
    if (decoded.value.kind === "system") {
      const operation = decoded.value.operation;
      if (operation.type === "restoreRollbackPoint") {
        const checkpoint = checkpointResolver(operation.rollbackPointId);
        if (checkpoint?.snapshot === undefined) {
          return {
            status: "failed",
            reason: `Rollback checkpoint ${operation.rollbackPointId} is not available.`,
            entryIndex: absoluteEntryIndex,
          };
        }
      }
    }
    const result = applyDeterministicEntry(
      current,
      decoded.value,
      checkpointResolver,
      {
        tolerateAfterHashMismatch: true,
        tolerateBeforeHashMismatch: toleratedHashMismatch,
      },
    );
    if (result.status === "failed") {
      return {
        status: "failed",
        reason: result.reason,
        entryIndex: absoluteEntryIndex,
      };
    }
    toleratedHashMismatch =
      toleratedHashMismatch || result.toleratedHashMismatch === true;
    current = result.state;
    if (includeFrame(frameIndex)) {
      frames.push({
        index: frameIndex,
        entryIndex: absoluteEntryIndex,
        label: result.label,
        state: structuredClone(current),
        stateHash: result.stateHash,
      });
    }
    if (frameWindow !== undefined && frameIndex + 1 >= frameEnd) {
      return ready(frames);
    }
  }
  const finalStateHash = frames.at(-1)?.stateHash ?? firstFrame.stateHash;
  if (
    expectedFinalStateHash !== undefined &&
    expectedFinalStateHash !== finalStateHash &&
    !toleratedHashMismatch
  ) {
    return {
      status: "failed",
      reason: "Replay reconstruction final hash mismatch.",
    };
  }
  return ready(frames);
};
