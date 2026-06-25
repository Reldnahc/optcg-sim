import type { MatchId, PlayerId } from "@optcg/types";

import type { MatchClientState } from "../controller.js";
import type {
  MatchCardCatalog,
  MatchCardCatalogEntry,
  MatchSnapshot,
} from "../transport.js";
import type { ReplayDisplayArtifactPayload } from "../replay-client.js";

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
  if (!isRecord(manifest)) {
    return [];
  }
  const cards = manifest["cards"];
  if (!isRecord(cards)) {
    return [];
  }
  return Object.values(cards).flatMap((card) =>
    isRecord(card) ? [card] : [],
  );
};

const stockCardImageUrl = (cardId: string): string =>
  `https://cdn.poneglyph.one/images/${encodeURIComponent(cardId)}/en/stock/0/full.png`;

const imageUrlFromManifestCard = (
  card: Record<string, unknown>,
): string | undefined => {
  const compactImageUrl = stringValue(card["imageUrl"]);
  if (compactImageUrl !== undefined) {
    return compactImageUrl;
  }
  const variants = card["variants"];
  if (!Array.isArray(variants)) {
    const cardId = stringValue(card["cardId"]);
    const category = stringValue(card["category"]);
    return cardId === undefined || category === "don"
      ? undefined
      : stockCardImageUrl(cardId);
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

export const replayFrameFromSnapshot = ({
  cards: inputCards,
  frameIndex,
  label,
  manifestSnapshot,
  matchId,
  snapshot,
}: {
  readonly frameIndex: number;
  readonly label: string;
  readonly manifestSnapshot: unknown;
  readonly cards?: MatchCardCatalog | undefined;
  readonly matchId: string;
  readonly snapshot: MatchSnapshot;
}): ReplayFrame[] => {
  const playerId = Object.keys(snapshot.players)[0] as PlayerId | undefined;
  if (playerId === undefined) {
    return [];
  }
  const cards =
    inputCards ??
    replayCatalog(manifestSnapshot, [
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

const isZoneRef = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value["playerId"] === "string" &&
  typeof value["zone"] === "string";

const isOptionalStringList = (value: unknown): boolean =>
  value === undefined ||
  (Array.isArray(value) && value.every((item) => typeof item === "string"));

const isPublicCardView = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value["instanceId"] === "string" &&
  typeof value["cardId"] === "string" &&
  typeof value["owner"] === "string" &&
  typeof value["controller"] === "string" &&
  isZoneRef(value["zone"]) &&
  (value["state"] === undefined || typeof value["state"] === "string") &&
  typeof value["attachedDonCount"] === "number" &&
  Array.isArray(value["attachedDonIds"]) &&
  value["attachedDonIds"].every((item) => typeof item === "string") &&
  isOptionalStringList(value["keywords"]) &&
  isOptionalStringList(value["restrictions"]);

const isTerminalStatus = (status: unknown): boolean =>
  status === "completed" || status === "gameOver";

const isPublicLifeView = (
  value: unknown,
  options: { readonly terminalStatus: boolean },
): boolean =>
  isRecord(value) &&
  typeof value["count"] === "number" &&
  Array.isArray(value["faceUpCards"]) &&
  (options.terminalStatus ? value["faceUpCards"].length === 0 : true) &&
  value["faceUpCards"].every(isPublicCardView);

const isVisiblePlayerState = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value["playerId"] === "string" &&
  typeof value["deckCount"] === "number" &&
  value["deck"] === undefined &&
  typeof value["donDeckCount"] === "number" &&
  value["donDeck"] === undefined &&
  Array.isArray(value["hand"]) &&
  value["hand"].every(isPublicCardView) &&
  Array.isArray(value["trash"]) &&
  value["trash"].every(isPublicCardView) &&
  isPublicCardView(value["leader"]) &&
  Array.isArray(value["characters"]) &&
  value["characters"].every(isPublicCardView) &&
  (value["stage"] === undefined || isPublicCardView(value["stage"])) &&
  Array.isArray(value["costArea"]) &&
  value["costArea"].every(isPublicCardView) &&
  isPublicLifeView(value["life"], { terminalStatus: false }) &&
  typeof value["hasMulliganed"] === "boolean" &&
  typeof value["turnCount"] === "number";

const isOpponentVisibleState = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value["playerId"] === "string" &&
  typeof value["deckCount"] === "number" &&
  value["deck"] === undefined &&
  typeof value["donDeckCount"] === "number" &&
  value["donDeck"] === undefined &&
  typeof value["handCount"] === "number" &&
  value["hand"] === undefined &&
  Array.isArray(value["trash"]) &&
  value["trash"].every(isPublicCardView) &&
  isPublicCardView(value["leader"]) &&
  Array.isArray(value["characters"]) &&
  value["characters"].every(isPublicCardView) &&
  (value["stage"] === undefined || isPublicCardView(value["stage"])) &&
  Array.isArray(value["costArea"]) &&
  value["costArea"].every(isPublicCardView) &&
  isPublicLifeView(value["life"], { terminalStatus: false }) &&
  typeof value["hasMulliganed"] === "boolean" &&
  typeof value["turnCount"] === "number";

const isReplayDisplayPlayerView = (
  value: unknown,
  perspectivePlayerId: string,
  status: string,
): boolean => {
  if (!isRecord(value)) {
    return false;
  }
  const self = value["self"];
  const opponent = value["opponent"];
  return (
    isRecord(self) &&
    isRecord(opponent) &&
    typeof value["matchId"] === "string" &&
    value["playerId"] === perspectivePlayerId &&
    typeof value["stateSeq"] === "number" &&
    typeof value["actionSeq"] === "number" &&
    isRecord(value["turn"]) &&
    typeof value["turn"]["turnPlayerId"] === "string" &&
    typeof value["turn"]["globalTurn"] === "number" &&
    isRecord(value["turn"]["playerTurnCounts"]) &&
    typeof value["turn"]["phase"] === "string" &&
    isVisiblePlayerState(self) &&
    self["playerId"] === perspectivePlayerId &&
    isPublicLifeView(self["life"], {
      terminalStatus: isTerminalStatus(status),
    }) &&
    isOpponentVisibleState(opponent) &&
    opponent["playerId"] !== perspectivePlayerId &&
    isPublicLifeView(opponent["life"], {
      terminalStatus: isTerminalStatus(status),
    }) &&
    isRecord(value["timers"]) &&
    Array.isArray(value["revealedCards"]) &&
    Array.isArray(value["events"]) &&
    Array.isArray(value["legalActions"]) &&
    value["legalActions"].length === 0
  );
};

export const isReplayDisplayArtifactPayload = (
  value: unknown,
): value is ReplayDisplayArtifactPayload => {
  if (!isRecord(value)) {
    return false;
  }
  const perspectivePlayerId = value["perspectivePlayerId"];
  const frames = value["frames"];
  return (
    value["replayDisplayVersion"] === "display-v1" &&
    typeof perspectivePlayerId === "string" &&
    typeof value["frameCount"] === "number" &&
    Array.isArray(frames) &&
    value["frameCount"] > 0 &&
    frames.length === value["frameCount"] &&
    frames.every((frame) => {
      if (!isRecord(frame)) {
        return false;
      }
      const snapshot = frame["snapshot"];
      if (!isRecord(snapshot)) {
        return false;
      }
      if (
        typeof frame["index"] !== "number" ||
        (typeof frame["actionIndex"] !== "number" &&
          frame["actionIndex"] !== null) ||
        typeof frame["label"] !== "string" ||
        frame["perspectivePlayerId"] !== perspectivePlayerId ||
        typeof frame["stateSeq"] !== "number" ||
        typeof frame["actionSeq"] !== "number" ||
        typeof frame["status"] !== "string" ||
        typeof frame["activePlayerId"] !== "string"
      ) {
        return false;
      }
      if (
        typeof snapshot["stateSeq"] !== "number" ||
        typeof snapshot["actionSeq"] !== "number" ||
        typeof snapshot["stateHash"] !== "string" ||
        typeof snapshot["status"] !== "string" ||
        snapshot["status"] !== frame["status"] ||
        !isRecord(snapshot["turn"]) ||
        typeof snapshot["activePlayerId"] !== "string"
      ) {
        return false;
      }
      const players = snapshot["players"];
      if (!isRecord(players)) {
        return false;
      }
      const playerIds = Object.keys(players);
      const player = players[perspectivePlayerId];
      const view = isRecord(player) ? player["view"] : undefined;
      return (
        playerIds.length === 1 &&
        playerIds[0] === perspectivePlayerId &&
        isRecord(player) &&
        Array.isArray(player["actions"]) &&
        player["actions"].length === 0 &&
        isReplayDisplayPlayerView(view, perspectivePlayerId, frame["status"])
      );
    })
  );
};

export const replayFramesFromDisplayArtifact = (input: {
  readonly matchId: string;
  readonly manifestSnapshot: unknown;
  readonly artifact: ReplayDisplayArtifactPayload;
}): readonly ReplayFrame[] => {
  const cards = replayCatalog(input.manifestSnapshot, [
    input.artifact.perspectivePlayerId as PlayerId,
  ]);
  return input.artifact.frames.flatMap((frame) => {
    if (!isRecord(frame.snapshot) || !isRecord(frame.snapshot["players"])) {
      return [];
    }
    return replayFrameFromSnapshot({
      frameIndex: frame.index,
      label: frame.label,
      manifestSnapshot: input.manifestSnapshot,
      cards,
      matchId: input.matchId,
      snapshot: frame.snapshot as unknown as MatchSnapshot,
    });
  });
};
