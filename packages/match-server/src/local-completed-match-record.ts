import { createHash } from "node:crypto";

import { hashCanonicalStateValue } from "@optcg/engine-core";
import type { PlayerId } from "@optcg/types";

import { canonicalJson } from "./canonical-json.js";
import type { ReadyDeckSubmission } from "./deck-submission.js";
import type { AuthContext } from "./dev-auth.js";
import type { DevMatchSetup, LocalDevMatch } from "./local-match.js";
import type {
  CompletedMatchPlayerRecord,
  CompletedMatchRecord,
  JsonObject,
} from "./postgres-completed-match.js";
import type {
  FirstPlayerChoiceState,
  MatchCreationSource,
  StoredSessionRecord,
} from "./session-types.js";
import type { VerifiedSimHandoff } from "./sim-handoff.js";

export interface CompletedMatchSeatContext {
  playerId: PlayerId;
  subject?: AuthContext["subject"];
  deckSubmission?: ReadyDeckSubmission;
  verifiedHandoff?: VerifiedSimHandoff;
}

export interface BuildLocalCompletedMatchRecordInput {
  readonly match: LocalDevMatch;
  readonly setup: DevMatchSetup;
  readonly seats: Record<string, CompletedMatchSeatContext>;
  readonly firstPlayerChoice: FirstPlayerChoiceState;
  readonly records: readonly StoredSessionRecord[];
  readonly endedAt: string;
}

const jsonObject = (value: unknown): JsonObject => {
  const cloned = JSON.parse(JSON.stringify(value)) as unknown;
  return typeof cloned === "object" && cloned !== null && !Array.isArray(cloned)
    ? (cloned as JsonObject)
    : {};
};

const isJsonRecord = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const compactVariantSnapshot = (variant: unknown): JsonObject => {
  if (!isJsonRecord(variant)) {
    return {};
  }
  return jsonObject({
    stockImageFull: variant["stockImageFull"],
    scanImageDisplay: variant["scanImageDisplay"],
  });
};

const compactCardSnapshot = (card: unknown): JsonObject => {
  if (!isJsonRecord(card)) {
    return {};
  }
  const variants = Array.isArray(card["variants"])
    ? card["variants"].slice(0, 1).map(compactVariantSnapshot)
    : [];
  return jsonObject({
    cardId: card["cardId"],
    name: card["name"],
    category: card["category"],
    cost: card["cost"],
    power: card["power"],
    counter: card["counter"],
    attributes: card["attributes"],
    types: card["types"],
    effectText: card["effectText"],
    triggerText: card["triggerText"],
    variants,
  });
};

const compactManifestSnapshot = (manifest: unknown): JsonObject => {
  if (!isJsonRecord(manifest) || !isJsonRecord(manifest["cards"])) {
    return {};
  }
  return jsonObject({
    manifestHash: manifest["manifestHash"],
    cardDataVersion: manifest["cardDataVersion"],
    effectDefinitionsVersion: manifest["effectDefinitionsVersion"],
    cards: Object.fromEntries(
      Object.entries(manifest["cards"]).map(([cardId, card]) => [
        cardId,
        compactCardSnapshot(card),
      ]),
    ),
  });
};

const hashJson = (value: unknown): string =>
  createHash("sha256")
    .update(canonicalJson(jsonObject(value)))
    .digest("hex");

const seedText = (seed: string | number | bigint): string => {
  if (typeof seed === "string") {
    return seed;
  }
  return seed.toString();
};

const readySubmissionSnapshot = (submission: ReadyDeckSubmission): JsonObject =>
  jsonObject({
    source: submission.source,
    hash: submission.hash,
    decoded: submission.decoded,
    donDeckCount: submission.donDeckCount,
  });

const resolvedLoadoutSnapshot = (
  seat: CompletedMatchSeatContext,
): JsonObject => {
  if (seat.verifiedHandoff !== undefined) {
    return jsonObject(seat.verifiedHandoff.resolvedLoadout);
  }
  if (seat.deckSubmission !== undefined) {
    return readySubmissionSnapshot(seat.deckSubmission);
  }
  return {};
};

const cosmeticSnapshot = (seat: CompletedMatchSeatContext): JsonObject => {
  if (seat.verifiedHandoff === undefined) {
    return {};
  }
  return jsonObject(seat.verifiedHandoff.resolvedLoadout.cosmetics);
};

const deckSnapshot = (seat: CompletedMatchSeatContext): JsonObject =>
  seat.deckSubmission === undefined
    ? {}
    : readySubmissionSnapshot(seat.deckSubmission);

const playerResult = (
  winner: PlayerId | "draw",
  playerId: PlayerId,
): CompletedMatchPlayerRecord["result"] => {
  if (winner === "draw") {
    return "draw";
  }
  return winner === playerId ? "win" : "loss";
};

const creationSourceForSetup = (setup: DevMatchSetup): MatchCreationSource =>
  setup.lobbyId !== undefined
    ? {
        type: "customLobby",
        lobbyId: setup.lobbyId,
        lobbyConfigId: "dev-local-lobby",
      }
    : { type: "dev" };

const buildPlayerRecord = (
  input: BuildLocalCompletedMatchRecordInput,
  seat: CompletedMatchSeatContext,
): CompletedMatchPlayerRecord => {
  const player = input.match.state.players[seat.playerId];
  const submission = seat.deckSubmission;
  const handoff = seat.verifiedHandoff;
  const status = input.match.state.status;
  const winner =
    status.type === "completed" || status.type === "gameOver"
      ? status.winner
      : "draw";
  const leader = submission?.decoded.leader;
  return {
    seatId: seat.playerId,
    userId: seat.subject?.userId ?? handoff?.claims.sub ?? null,
    savedDeckId: handoff?.resolvedLoadout.loadoutId ?? null,
    handoffTokenId: null,
    displayName: seat.subject?.displayName ?? null,
    leaderCardNumber: String(leader?.cardId ?? player?.leader.cardId ?? ""),
    leaderVariantIndex: leader?.variantIndex ?? null,
    deckHash:
      submission?.hash ?? handoff?.resolvedLoadout.mainDeck.hash ?? null,
    deckSnapshot: deckSnapshot(seat),
    resolvedLoadoutSnapshot: resolvedLoadoutSnapshot(seat),
    cosmeticSnapshot: cosmeticSnapshot(seat),
    startingDeckOrderHash:
      submission === undefined ? null : hashJson(submission.decoded.main),
    result: playerResult(winner, seat.playerId),
    resultReason:
      input.match.state.status.type === "gameOver" ? "game_over" : "completed",
    wentFirst: input.setup.firstPlayerId === seat.playerId,
    choseFirst: input.firstPlayerChoice.chooserPlayerId === seat.playerId,
    isWinner: winner === seat.playerId,
    finalLifeCount: player?.life.length ?? null,
  };
};

export const buildLocalCompletedMatchRecord = (
  input: BuildLocalCompletedMatchRecordInput,
): CompletedMatchRecord | undefined => {
  const status = input.match.state.status;
  if (status.type !== "completed" && status.type !== "gameOver") {
    return undefined;
  }
  const winnerSeatId = status.winner === "draw" ? null : status.winner;
  const winnerSeat =
    winnerSeatId === null ? undefined : input.seats[winnerSeatId];
  const players = input.setup.playerOrder.flatMap((playerId) => {
    const seat = input.seats[String(playerId)];
    return seat === undefined ? [] : [buildPlayerRecord(input, seat)];
  });
  if (players.length === 0) {
    return undefined;
  }
  const finalStateHash = hashCanonicalStateValue(input.match.state);
  const initialDeckOrders = jsonObject(
    Object.fromEntries(
      input.setup.players.map((player) => [
        player.playerId,
        player.deckCardIds.map(String),
      ]),
    ),
  );
  return {
    matchId: input.match.state.matchId,
    status: status.winner === "draw" ? "draw" : "completed",
    gameType: "dev",
    formatId: "dev",
    ladderId: null,
    lobbyId: input.setup.lobbyId ?? null,
    queueId: null,
    creationSource: creationSourceForSetup(input.setup),
    spectatorPolicy: { mode: "live-filtered" },
    disconnectPolicy: { mode: "dev-none" },
    rollbackPolicy: { mode: "mutual-consent" },
    runtimeVersions: jsonObject(input.match.state.version),
    cardManifestHash: hashJson(input.match.state.cardManifest),
    cardManifestSnapshot: compactManifestSnapshot(
      input.match.state.cardManifest,
    ),
    firstPlayerSeatId: input.setup.firstPlayerId,
    firstPlayerChooserSeatId: input.firstPlayerChoice.chooserPlayerId,
    winnerUserId: winnerSeat?.subject?.userId ?? null,
    winnerSeatId,
    resultReason: "completed",
    winType: "game",
    startedAt: input.setup.cardManifest.createdAt,
    endedAt: input.endedAt,
    turnCount: input.match.state.turn.globalTurn,
    actionCount: input.match.state.actionSeq,
    finalStateHash,
    finalStateSeq: input.match.state.seq,
    errorPayload: null,
    players,
    replay: {
      replayFormatVersion: "dev-local-v1",
      engineVersion: input.match.state.version.engineVersion,
      rulesVersion: input.match.state.version.rulesVersion,
      cardDataVersion: input.match.state.version.cardDataVersion,
      effectDefinitionsVersion:
        input.match.state.version.effectDefinitionsVersion,
      customHandlerVersion: input.match.state.version.customHandlerVersion,
      banlistVersion: input.match.state.version.banlistVersion,
      protocolVersion: "dev-http-v1",
      rngAlgorithm: "test-fixed",
      rngSeedCommitment: hashJson(input.setup.rngSeed),
      rngSeedRevealed: seedText(input.setup.rngSeed),
      manifestHash: hashJson(input.match.state.cardManifest),
      manifestSnapshot: compactManifestSnapshot(input.match.state.cardManifest),
      initialStateHash: hashJson(input.setup),
      finalStateHash,
      initialSnapshot: null,
      initialDeckOrders,
      deterministicEntries: input.records.map((record) => jsonObject(record)),
      auditEntries: input.match.state.audit.map((entry) => jsonObject(entry)),
      checkpoints: [],
      finalState: null,
      compressed: false,
      artifactStorage: null,
      artifactKey: null,
      artifactSha256: null,
      artifactSizeBytes: null,
    },
  };
};
