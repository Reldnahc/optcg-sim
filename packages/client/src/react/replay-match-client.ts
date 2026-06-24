import type { MatchId, PlayerId } from "@optcg/types";

import type {
  MatchCardCatalog,
  MatchCardCatalogEntry,
  MatchSnapshot,
} from "../transport.js";
import { createBoardViewModel } from "../view-model.js";
import type { MatchClientState } from "../controller.js";
import type { ReplayFrameReconstructionPayload } from "../replay-client.js";
import type { MatchClientUi } from "./useMatchClient-support.js";

export interface ReplayFrame {
  readonly index: number;
  readonly label: string;
  readonly clientState: MatchClientState;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => (typeof entry === "string" ? [entry] : []))
    : [];

const manifestCards = (
  manifest: unknown,
): readonly Record<string, unknown>[] => {
  if (!isRecord(manifest) || !isRecord(manifest["cards"])) {
    return [];
  }
  return Object.values(manifest["cards"]).flatMap((card) =>
    isRecord(card) ? [card] : [],
  );
};

const imageUrlFromManifestCard = (
  card: Record<string, unknown>,
): string | undefined => {
  const variants = card["variants"];
  if (!Array.isArray(variants)) {
    return undefined;
  }
  const firstVariant = variants.find(isRecord);
  return firstVariant === undefined
    ? undefined
    : (stringValue(firstVariant["stockImageFull"]) ??
        stringValue(firstVariant["scanImageDisplay"]));
};

const catalogEntryFromManifestCard = (
  card: Record<string, unknown>,
): MatchCardCatalogEntry | undefined => {
  const cardId = stringValue(card["cardId"]);
  const name = stringValue(card["name"]);
  const category = stringValue(card["category"]);
  if (cardId === undefined || name === undefined || category === undefined) {
    return undefined;
  }
  const imageUrl = imageUrlFromManifestCard(card);
  const cost = numberValue(card["cost"]);
  const power = numberValue(card["power"]);
  const counter = numberValue(card["counter"]);
  const attributes = stringArray(card["attributes"]);
  const types = stringArray(card["types"]);
  const effectText = stringValue(card["effectText"]);
  const triggerText = stringValue(card["triggerText"]);
  return {
    cardId: cardId as MatchCardCatalogEntry["cardId"],
    name,
    category,
    ...(cost === undefined ? {} : { cost }),
    ...(power === undefined ? {} : { power }),
    ...(counter === undefined ? {} : { counter }),
    ...(attributes.length === 0 ? {} : { attributes }),
    ...(types.length === 0 ? {} : { types }),
    ...(effectText === undefined ? {} : { effectText }),
    ...(triggerText === undefined ? {} : { triggerText }),
    ...(imageUrl === undefined ? {} : { imageUrl }),
  };
};

const replayCatalog = (
  manifest: unknown,
  playerIds: readonly PlayerId[],
): MatchCardCatalog => {
  const cards = Object.fromEntries(
    manifestCards(manifest).flatMap((card) => {
      const entry = catalogEntryFromManifestCard(card);
      return entry === undefined ? [] : [[entry.cardId, entry] as const];
    }),
  );
  return {
    players: Object.fromEntries(playerIds.map((id) => [id, { cards }])),
  };
};

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

const replayFrameFromSnapshot = ({
  frameIndex,
  label,
  manifestSnapshot,
  matchId,
  snapshot,
}: {
  readonly frameIndex: number;
  readonly label: string;
  readonly manifestSnapshot: unknown;
  readonly matchId: string;
  readonly snapshot: MatchSnapshot;
}): ReplayFrame[] => {
  const playerId = Object.keys(snapshot.players)[0] as PlayerId | undefined;
  if (playerId === undefined) {
    return [];
  }
  const cards = replayCatalog(manifestSnapshot, [
    ...Object.keys(snapshot.players).map((id) => id as PlayerId),
  ]);
  return [
    {
      index: frameIndex,
      label,
      clientState: {
        matchId: matchId as MatchId,
        seat: {
          matchId: matchId as MatchId,
          playerId,
        },
        snapshot,
        cards,
      },
    },
  ];
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
