import {
  createInitialState,
  filterStateForPlayer,
  reconstructReplayArtifactStates,
  startMulliganFlow,
  type ReplayArtifactStateFrame,
} from "@optcg/engine-core";
import type {
  CardId,
  GameState,
  MatchCardManifest,
  MatchId,
  PlayerId,
} from "@optcg/types";

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

const stringArray = (value: unknown): readonly string[] | undefined =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value
    : undefined;

const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

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

const savedSnapshotForEntry = (
  entry: unknown,
): Record<string, unknown> | undefined => {
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

const replayFramesFromInitialState = (
  initialState: GameState,
  detail: Pick<CompletedMatchReplayDetail, "replay">,
  deterministicEntries: readonly unknown[],
  checkpoints: readonly unknown[],
  expectedFinalStateHash: string | undefined,
): ReplayFrameReconstructionResult | undefined => {
  const result = reconstructReplayArtifactStates({
    initialState,
    deterministicEntries,
    checkpoints,
    expectedFinalStateHash,
  });
  if (result.status === "failed") {
    return {
      status: "failed",
      reason: result.reason,
      ...(result.entryIndex === undefined
        ? {}
        : { actionIndex: result.entryIndex }),
    };
  }
  try {
    return {
      status: "ready",
      frames: result.frames.map((frame) => ({
        index: frame.index,
        actionIndex: frame.entryIndex ?? -1,
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

const replayFramesFromEngineState = (
  detail: CompletedMatchReplayDetail,
  deterministicEntries: readonly unknown[],
  checkpoints: readonly unknown[],
  expectedFinalStateHash: string | undefined,
): ReplayFrameReconstructionResult | undefined => {
  const initialSnapshot = detail.replay["initialSnapshot"];
  if (!isRecord(initialSnapshot)) {
    return undefined;
  }
  return replayFramesFromInitialState(
    initialSnapshot as unknown as GameState,
    detail,
    deterministicEntries,
    checkpoints,
    expectedFinalStateHash,
  );
};

const initialStateFromCompactSource = (
  detail: CompletedMatchReplayDetail,
): GameState | undefined => {
  const source = detail.replay["initialDeckOrders"];
  const manifestSnapshot = detail.replay["manifestSnapshot"];
  const rngSeed = detail.replay["rngSeedRevealed"];
  if (
    !isRecord(source) ||
    !isRecord(source["players"]) ||
    !isRecord(manifestSnapshot) ||
    typeof rngSeed !== "string"
  ) {
    return undefined;
  }
  const playerOrder = stringArray(source["playerOrder"]);
  const firstPlayerId = stringValue(source["firstPlayerId"]);
  if (
    playerOrder === undefined ||
    playerOrder.length !== 2 ||
    firstPlayerId === undefined
  ) {
    return undefined;
  }

  const deckCardIds: Record<PlayerId, CardId[]> = {};
  const donDeckCardIds: Record<PlayerId, CardId[]> = {};
  const leaderCardIds: Record<PlayerId, CardId> = {};
  const leaderLifeCounts: Record<PlayerId, number> = {};
  for (const playerId of playerOrder) {
    const player = source["players"][playerId];
    if (!isRecord(player)) {
      return undefined;
    }
    const deck = stringArray(player["deckCardIds"]);
    const donDeck = stringArray(player["donDeckCardIds"]);
    const leaderCardId = stringValue(player["leaderCardId"]);
    const leaderLifeCount = numberValue(player["leaderLifeCount"]);
    if (
      deck === undefined ||
      donDeck === undefined ||
      leaderCardId === undefined ||
      leaderLifeCount === undefined
    ) {
      return undefined;
    }
    const typedPlayerId = playerId as PlayerId;
    deckCardIds[typedPlayerId] = deck.map((cardId) => cardId as CardId);
    donDeckCardIds[typedPlayerId] = donDeck.map((cardId) => cardId as CardId);
    leaderCardIds[typedPlayerId] = leaderCardId as CardId;
    leaderLifeCounts[typedPlayerId] = leaderLifeCount;
  }

  try {
    const setupState = createInitialState({
      matchId: detail.matchId as MatchId,
      playerOrder: [playerOrder[0] as PlayerId, playerOrder[1] as PlayerId],
      firstPlayerId: firstPlayerId as PlayerId,
      deckCardIds,
      donDeckCardIds,
      leaderCardIds,
      leaderLifeCounts,
      cardManifest: manifestSnapshot as unknown as MatchCardManifest,
      rngSeed,
      shuffleDecks: source["shuffleDecks"] === true,
    });
    if (setupState.pendingDecision !== undefined) {
      return setupState;
    }
    const started = startMulliganFlow(setupState);
    if (started.errors !== undefined && started.errors.length > 0) {
      return undefined;
    }
    return started.state;
  } catch {
    return undefined;
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
  const checkpoints = Array.isArray(detail.replay["checkpoints"])
    ? detail.replay["checkpoints"]
    : [];
  const replayFormatVersion = stringValue(detail.replay["replayFormatVersion"]);
  const expectedFinalStateHash =
    replayFormatVersion === "dev-local-v2"
      ? stringValue(detail.replay["finalStateHash"])
      : undefined;
  if (replayFormatVersion !== "dev-local-v2") {
    const frames = savedSnapshotFrames(deterministicEntries);
    if (frames.length > 0) {
      return { status: "ready", frames };
    }
  }
  const compactInitialState = initialStateFromCompactSource(detail);
  if (compactInitialState !== undefined) {
    const result = replayFramesFromInitialState(
      compactInitialState,
      detail,
      deterministicEntries,
      checkpoints,
      expectedFinalStateHash,
    );
    if (result !== undefined) {
      return result;
    }
  }
  const engineFrames = replayFramesFromEngineState(
    detail,
    deterministicEntries,
    checkpoints,
    expectedFinalStateHash,
  );
  if (engineFrames !== undefined) {
    return engineFrames;
  }
  return {
    status: "failed",
    reason:
      "Replay artifact does not contain saved frames or reconstructable engine state.",
  };
};
