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
  if (
    isRecord(detail.replay["initialSnapshot"]) &&
    isRecord(detail.replay["finalState"])
  ) {
    return {
      status: "failed",
      reason:
        "Replay artifact is reconstructable, but the engine replay reducer is not available yet.",
    };
  }
  return {
    status: "failed",
    reason:
      "Replay artifact does not contain saved frames or reconstructable engine state.",
  };
};
