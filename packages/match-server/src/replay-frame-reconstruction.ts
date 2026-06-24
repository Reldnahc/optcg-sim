import {
  filterStateForPlayer,
  reconstructReplayArtifactStates,
  type ReplayArtifactStateFrame,
} from "@optcg/engine-core";
import type { GameState, PlayerId } from "@optcg/types";

import type { CompletedMatchReplayDetail } from "./postgres-completed-match.js";

export interface ReplayApiFrame {
  readonly index: number;
  readonly actionIndex: number;
  readonly label: string;
  readonly snapshot: unknown;
}

export type ReplayFrameReconstructionResult =
  | {
      readonly status: "ready";
      readonly frames: readonly ReplayApiFrame[];
    }
  | {
      readonly status: "failed";
      readonly reason: string;
      readonly actionIndex?: number | undefined;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const labelForEntry = (entry: unknown, index: number): string => {
  if (!isRecord(entry) || !isRecord(entry["envelope"])) {
    return `Action ${String(index + 1)}`;
  }
  const request = entry["envelope"]["request"];
  if (!isRecord(request)) {
    return `Action ${String(index + 1)}`;
  }
  const type = request["type"];
  return typeof type === "string" && type.length > 0
    ? type
    : `Action ${String(index + 1)}`;
};

const savedSnapshotForEntry = (entry: unknown): unknown | undefined => {
  if (!isRecord(entry) || !isRecord(entry["result"])) {
    return undefined;
  }
  const snapshot = entry["result"]["snapshot"];
  return isRecord(snapshot) && isRecord(snapshot["players"])
    ? snapshot
    : undefined;
};

const savedSnapshotFrames = (
  entries: readonly unknown[],
): readonly ReplayApiFrame[] =>
  entries.flatMap((entry, actionIndex) => {
    const snapshot = savedSnapshotForEntry(entry);
    if (snapshot === undefined) {
      return [];
    }
    return [
      {
        index: actionIndex,
        actionIndex,
        label: labelForEntry(entry, actionIndex),
        snapshot,
      },
    ];
  });

const snapshotForFrame = (frame: ReplayArtifactStateFrame): unknown => ({
  stateSeq: frame.state.seq,
  actionSeq: frame.state.actionSeq,
  stateHash: frame.stateHash,
  status: frame.state.status.type,
  turn: frame.state.turn,
  activePlayerId:
    frame.state.pendingDecision?.playerId ?? frame.state.turn.turnPlayerId,
  players: Object.fromEntries(
    Object.keys(frame.state.players).map((playerId) => [
      playerId,
      {
        view: filterStateForPlayer(frame.state, playerId as PlayerId, {
          includeLegalActions: false,
        }),
        actions: [],
      },
    ]),
  ),
});

const replayFramesFromEngineState = (
  detail: CompletedMatchReplayDetail,
  deterministicEntries: readonly unknown[],
): ReplayFrameReconstructionResult | undefined => {
  const initialSnapshot = detail.replay["initialSnapshot"];
  if (
    !isRecord(initialSnapshot) ||
    !isRecord(detail.replay["finalState"])
  ) {
    return undefined;
  }
  const result = reconstructReplayArtifactStates({
    initialState: initialSnapshot as unknown as GameState,
    deterministicEntries,
    expectedFinalStateHash: stringValue(detail.replay["finalStateHash"]),
  });
  if (result.status === "failed") {
    return result;
  }
  try {
    return {
      status: "ready",
      frames: result.frames.map((frame) => ({
        index: frame.index,
        actionIndex: frame.actionIndex ?? -1,
        label: frame.label,
        snapshot: snapshotForFrame(frame),
      })),
    };
  } catch (caught) {
    return {
      status: "failed",
      reason:
        caught instanceof Error
          ? `Replay frame projection failed: ${caught.message}`
          : "Replay frame projection failed.",
    };
  }
};

export const reconstructReplayFrames = (
  detail: CompletedMatchReplayDetail,
): ReplayFrameReconstructionResult => {
  const deterministicEntries = Array.isArray(
    detail.replay["deterministicEntries"],
  )
    ? detail.replay["deterministicEntries"]
    : [];
  const frames = savedSnapshotFrames(deterministicEntries);
  if (frames.length > 0) {
    return { status: "ready", frames };
  }
  const engineFrames = replayFramesFromEngineState(detail, deterministicEntries);
  if (engineFrames !== undefined) {
    return engineFrames;
  }
  return {
    status: "failed",
    reason:
      "Replay artifact does not contain saved frames or reconstructable engine state.",
  };
};
