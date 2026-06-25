import type { MatchSnapshot } from "../transport.js";
import { createBoardViewModel } from "../view-model.js";
import type { ReplayFrameReconstructionPayload } from "../replay-client.js";
import type { MatchClientUi } from "./useMatchClient-support.js";
import {
  replayFrameFromSnapshot,
  type ReplayFrame,
} from "./replay-display-frame.js";

export type { ReplayFrame } from "./replay-display-frame.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const snapshotFromRecord = (record: unknown): MatchSnapshot | undefined => {
  if (!isRecord(record) || !isRecord(record["result"])) {
    return undefined;
  }
  const snapshot = record["result"]["snapshot"];
  return isRecord(snapshot) && isRecord(snapshot["players"])
    ? (snapshot as unknown as MatchSnapshot)
    : undefined;
};

const frameLabel = (record: unknown, fallbackIndex: number): string => {
  if (!isRecord(record) || !isRecord(record["envelope"])) {
    return `Action ${String(fallbackIndex + 1)}`;
  }
  const request = record["envelope"]["request"];
  if (!isRecord(request)) {
    return `Action ${String(fallbackIndex + 1)}`;
  }
  return stringValue(request["type"]) ?? `Action ${String(fallbackIndex + 1)}`;
};

export const replayFramesFromDetail = (input: {
  readonly matchId: string;
  readonly manifestSnapshot: unknown;
  readonly frameReconstruction?: ReplayFrameReconstructionPayload | undefined;
  readonly deterministicEntries: readonly unknown[];
}): readonly ReplayFrame[] => {
  if (input.frameReconstruction?.status === "ready") {
    return input.frameReconstruction.frames.flatMap((frame) => {
      const snapshot = frame.snapshot;
      if (!isRecord(snapshot) || !isRecord(snapshot["players"])) {
        return [];
      }
      return replayFrameFromSnapshot({
        frameIndex: frame.index,
        label: frame.label,
        manifestSnapshot: input.manifestSnapshot,
        matchId: input.matchId,
        snapshot: snapshot as unknown as MatchSnapshot,
      });
    });
  }
  return input.deterministicEntries.flatMap((record, index) => {
    const snapshot = snapshotFromRecord(record);
    if (snapshot === undefined) {
      return [];
    }
    return replayFrameFromSnapshot({
      frameIndex: index,
      label: frameLabel(record, index),
      manifestSnapshot: input.manifestSnapshot,
      matchId: input.matchId,
      snapshot,
    });
  });
};

const resolved = (): Promise<void> => Promise.resolve();

export const createReplayMatchClient = (
  frame: ReplayFrame | undefined,
): MatchClientUi => {
  const board =
    frame === undefined
      ? undefined
      : createBoardViewModel({
          snapshot: frame.clientState.snapshot,
          catalog: frame.clientState.cards,
          playerId: frame.clientState.seat.playerId,
        });
  return {
    state: {
      ...(frame === undefined ? {} : { clientState: frame.clientState }),
      ...(board === undefined ? {} : { board }),
      selectedDonInstanceIds: [],
      pendingChoiceInstanceIds: [],
      decisionSelectedInstanceIds: [],
      accountLoadouts: [],
      accountLoadoutsStatus: "idle",
      accountLoadoutValidationRequired: false,
      actionInFlight: false,
      errors: frame === undefined ? ["No replay frames were saved."] : [],
    },
    currentPlayerId: frame?.clientState.seat.playerId,
    cardActions: () => [],
    globalActions: () => [],
    selectCard: () => undefined,
    submitAction: resolved,
    toggleDecisionCard: () => undefined,
    moveDecisionCard: () => undefined,
    setDecisionPlacementDestination: () => undefined,
    setDecisionQuantityValue: () => undefined,
    setDecisionOptionValue: () => undefined,
    setDecisionActionOptionValue: () => undefined,
    submitDecisionQuantityValue: resolved,
    submitDecisionOptionValue: resolved,
    submitDecisionActionOptionValue: resolved,
    chooseDecisionTriggerValue: () => undefined,
    confirmDecision: resolved,
    chooseFirstPlayer: resolved,
    requestRematch: resolved,
    requestRollback: resolved,
    cancelRollback: resolved,
    createNewMatch: resolved,
    refreshAccountLoadouts: () => undefined,
    submitLobbyLoadout: resolved,
  };
};
