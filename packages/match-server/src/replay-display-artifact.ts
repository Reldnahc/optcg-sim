import type { PlayerId, PlayerView } from "@optcg/types";

import { canonicalJson } from "./canonical-json.js";
import type {
  DevMatchSnapshot,
  DevPlayerSnapshot,
} from "./dev-snapshot-types.js";

export interface ReplayDisplayPlayerSnapshotV1 {
  readonly view: PlayerView;
  readonly actions: readonly [];
}

export interface ReplayDisplaySnapshotV1 {
  readonly stateSeq: number;
  readonly actionSeq: number;
  readonly stateHash: string;
  readonly status: string;
  readonly turn: DevMatchSnapshot["turn"];
  readonly activePlayerId: PlayerId;
  readonly playerLabels?: DevMatchSnapshot["playerLabels"];
  readonly players: Readonly<Record<PlayerId, ReplayDisplayPlayerSnapshotV1>>;
}

export interface ReplayDisplayFrameV1 {
  readonly index: number;
  readonly actionIndex: number | null;
  readonly label: string;
  readonly perspectivePlayerId: PlayerId;
  readonly stateSeq: number;
  readonly actionSeq: number;
  readonly status: string;
  readonly activePlayerId: PlayerId;
  readonly snapshot: ReplayDisplaySnapshotV1;
}

export interface ReplayDisplayArtifactV1 {
  readonly replayDisplayVersion: "display-v1";
  readonly perspectivePlayerId: PlayerId;
  readonly frameCount: number;
  readonly frames: readonly ReplayDisplayFrameV1[];
}

export interface ReplayDisplayFrameResult {
  readonly frame: ReplayDisplayFrameV1;
  readonly nextEventSeqByPlayer: ReadonlyMap<PlayerId, number>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isTerminalStatus = (status: unknown): boolean =>
  status === "completed" || status === "gameOver";

const eventSeq = (event: unknown): number | undefined =>
  isRecord(event) && typeof event["seq"] === "number"
    ? event["seq"]
    : undefined;

const compactViewEvents = (
  view: PlayerView,
  previousMaxSeq: number,
): PlayerView["events"] =>
  view.events.filter((event) => {
    const seq = eventSeq(event);
    return seq === undefined || seq > previousMaxSeq;
  });

const nextEventSeq = (
  player: DevPlayerSnapshot,
  previousMaxSeq: number,
): number =>
  player.view.events.reduce((maxSeq, event) => {
    const seq = eventSeq(event);
    return seq === undefined ? maxSeq : Math.max(maxSeq, seq);
  }, previousMaxSeq);

const stripTerminalLifeIdentities = (
  status: DevMatchSnapshot["status"],
  life: PlayerView["self"]["life"],
): PlayerView["self"]["life"] =>
  isTerminalStatus(status) ? { count: life.count, faceUpCards: [] } : life;

const sanitizeDisplayView = ({
  previousMaxSeq,
  status,
  view,
}: {
  readonly view: PlayerView;
  readonly status: DevMatchSnapshot["status"];
  readonly previousMaxSeq: number;
}): PlayerView => {
  const {
    deck: _selfDeck,
    donDeck: _selfDonDeck,
    ...selfWithoutPrivateDecks
  } = view.self;
  const {
    deck: _opponentDeck,
    donDeck: _opponentDonDeck,
    hand: _opponentHand,
    ...opponentWithoutPrivateZones
  } = view.opponent;
  return {
    ...view,
    self: {
      ...selfWithoutPrivateDecks,
      life: stripTerminalLifeIdentities(status, view.self.life),
    },
    opponent: {
      ...opponentWithoutPrivateZones,
      life: stripTerminalLifeIdentities(status, view.opponent.life),
    },
    legalActions: [],
    events: compactViewEvents(view, previousMaxSeq),
  };
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

const isReplayDisplayPlayerViewV1 = (
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

const isReplayDisplayPlayerSnapshotV1 = (
  value: unknown,
  perspectivePlayerId: string,
  status: string,
): boolean =>
  isRecord(value) &&
  Array.isArray(value["actions"]) &&
  value["actions"].length === 0 &&
  isReplayDisplayPlayerViewV1(value["view"], perspectivePlayerId, status);

const hasOnlyPerspectivePlayer = (
  players: Record<string, unknown>,
  perspectivePlayerId: string,
  status: string,
): boolean => {
  const playerIds = Object.keys(players);
  return (
    playerIds.length === 1 &&
    playerIds[0] === perspectivePlayerId &&
    isReplayDisplayPlayerSnapshotV1(
      players[perspectivePlayerId],
      perspectivePlayerId,
      status,
    )
  );
};

const isReplayDisplayFrameV1 = (
  value: unknown,
  perspectivePlayerId: string,
): value is ReplayDisplayFrameV1 => {
  if (
    !isRecord(value) ||
    typeof value["index"] !== "number" ||
    (typeof value["actionIndex"] !== "number" &&
      value["actionIndex"] !== null) ||
    typeof value["label"] !== "string" ||
    typeof value["perspectivePlayerId"] !== "string" ||
    value["perspectivePlayerId"] !== perspectivePlayerId ||
    typeof value["stateSeq"] !== "number" ||
    typeof value["actionSeq"] !== "number" ||
    typeof value["status"] !== "string" ||
    typeof value["activePlayerId"] !== "string" ||
    !isRecord(value["snapshot"])
  ) {
    return false;
  }
  const snapshot = value["snapshot"];
  const players = snapshot["players"];
  if (
    typeof snapshot["stateSeq"] !== "number" ||
    typeof snapshot["actionSeq"] !== "number" ||
    typeof snapshot["stateHash"] !== "string" ||
    typeof snapshot["status"] !== "string" ||
    snapshot["status"] !== value["status"] ||
    !isRecord(snapshot["turn"]) ||
    typeof snapshot["activePlayerId"] !== "string"
  ) {
    return false;
  }
  return (
    isRecord(players) &&
    hasOnlyPerspectivePlayer(players, perspectivePlayerId, value["status"])
  );
};

export const createReplayDisplayFrameFromSnapshot = ({
  actionIndex,
  index,
  label,
  perspectivePlayerId,
  previousEventSeqByPlayer,
  snapshot,
}: {
  readonly index: number;
  readonly actionIndex: number | null;
  readonly label: string;
  readonly perspectivePlayerId: PlayerId;
  readonly snapshot: DevMatchSnapshot;
  readonly previousEventSeqByPlayer: ReadonlyMap<PlayerId, number>;
}): ReplayDisplayFrameResult | undefined => {
  const perspectivePlayer = snapshot.players[perspectivePlayerId];
  if (perspectivePlayer === undefined) {
    return undefined;
  }
  const previousMaxSeq = previousEventSeqByPlayer.get(perspectivePlayerId) ?? 0;
  const next = new Map(previousEventSeqByPlayer);
  next.set(
    perspectivePlayerId,
    nextEventSeq(perspectivePlayer, previousMaxSeq),
  );
  const players: Record<PlayerId, ReplayDisplayPlayerSnapshotV1> = {
    [perspectivePlayerId]: {
      view: sanitizeDisplayView({
        view: perspectivePlayer.view,
        status: snapshot.status,
        previousMaxSeq,
      }),
      actions: [],
    },
  };
  const displaySnapshot: ReplayDisplaySnapshotV1 = {
    stateSeq: snapshot.stateSeq,
    actionSeq: snapshot.actionSeq,
    stateHash: snapshot.stateHash,
    status: snapshot.status,
    turn: snapshot.turn,
    activePlayerId: snapshot.activePlayerId,
    ...(snapshot.playerLabels === undefined
      ? {}
      : { playerLabels: snapshot.playerLabels }),
    players,
  };
  return {
    frame: {
      index,
      actionIndex,
      label,
      perspectivePlayerId,
      stateSeq: snapshot.stateSeq,
      actionSeq: snapshot.actionSeq,
      status: snapshot.status,
      activePlayerId: snapshot.activePlayerId,
      snapshot: displaySnapshot,
    },
    nextEventSeqByPlayer: next,
  };
};

export const createReplayDisplayArtifact = ({
  frames,
  perspectivePlayerId,
}: {
  readonly perspectivePlayerId: PlayerId;
  readonly frames: readonly ReplayDisplayFrameV1[];
}): ReplayDisplayArtifactV1 => ({
  replayDisplayVersion: "display-v1",
  perspectivePlayerId,
  frameCount: frames.length,
  frames,
});

export const isReplayDisplayArtifactV1 = (
  value: unknown,
): value is ReplayDisplayArtifactV1 =>
  isRecord(value) &&
  value["replayDisplayVersion"] === "display-v1" &&
  typeof value["perspectivePlayerId"] === "string" &&
  typeof value["frameCount"] === "number" &&
  Array.isArray(value["frames"]) &&
  value["frameCount"] > 0 &&
  value["frames"].length === value["frameCount"] &&
  value["frames"].every((frame) => {
    const perspectivePlayerId = value["perspectivePlayerId"];
    return (
      typeof perspectivePlayerId === "string" &&
      isReplayDisplayFrameV1(frame, perspectivePlayerId)
    );
  });

export const replayDisplayArtifactByteSize = (
  artifact: ReplayDisplayArtifactV1,
): number => Buffer.byteLength(canonicalJson(artifact), "utf8");
