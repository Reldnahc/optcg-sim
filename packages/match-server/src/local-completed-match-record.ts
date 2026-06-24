import { createHash } from "node:crypto";

import {
  hashCanonicalStateValue,
  hashReplayStateForScope,
} from "@optcg/engine-core";
import type { PlayerId } from "@optcg/types";

import { canonicalJson } from "./canonical-json.js";
import type { ReadyDeckSubmission } from "./deck-submission.js";
import type { AuthContext } from "./dev-auth.js";
import {
  createLocalDevMatch,
  type DevMatchSetup,
  type LocalDevMatch,
} from "./local-match.js";
import type {
  CompletedMatchPlayerRecord,
  CompletedMatchRecord,
  JsonObject,
} from "./postgres-completed-match.js";
import type {
  FirstPlayerChoiceState,
  MatchCreationSource,
  StoredDeterministicCheckpointRecord,
  StoredDeterministicSessionRecord,
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
  readonly deterministicRecords: readonly StoredDeterministicSessionRecord[];
  readonly deterministicCheckpoints: readonly StoredDeterministicCheckpointRecord[];
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

const compactCardSnapshot = (card: unknown): JsonObject => {
  if (!isJsonRecord(card)) {
    return {};
  }
  return jsonObject({
    cardId: card["cardId"],
    language: card["language"],
    name: card["name"],
    nameAliases: card["nameAliases"],
    identityTreatment: card["identityTreatment"],
    category: card["category"],
    colors: card["colors"],
    cost: card["cost"],
    power: card["power"],
    counter: card["counter"],
    life: card["life"],
    attributes: card["attributes"],
    types: card["types"],
    effectText: card["effectText"],
    triggerText: card["triggerText"],
    printedKeywords: card["printedKeywords"],
    sourceTextHash: card["sourceTextHash"],
    behaviorHash: card["behaviorHash"],
    support: card["support"],
  });
};

const collectEffectDefinitionIds = (
  value: unknown,
  output: Set<string>,
): void => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectEffectDefinitionIds(entry, output);
    }
    return;
  }
  if (!isJsonRecord(value)) {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === "effectDefinitionId" && typeof entry === "string") {
      output.add(entry);
      continue;
    }
    collectEffectDefinitionIds(entry, output);
  }
};

const compactManifestSnapshot = (
  manifest: unknown,
  cardIds?: ReadonlySet<string>,
): JsonObject => {
  if (!isJsonRecord(manifest) || !isJsonRecord(manifest["cards"])) {
    return {};
  }
  const cards = Object.fromEntries(
    Object.entries(manifest["cards"])
      .filter(([cardId]) => cardIds === undefined || cardIds.has(cardId))
      .map(([cardId, card]) => [cardId, compactCardSnapshot(card)]),
  );
  const effectDefinitionIds = new Set<string>();
  collectEffectDefinitionIds(cards, effectDefinitionIds);
  const effectDefinitions = isJsonRecord(manifest["effectDefinitions"])
    ? Object.fromEntries(
        Object.entries(manifest["effectDefinitions"]).filter(([definitionId]) =>
          effectDefinitionIds.has(definitionId),
        ),
      )
    : undefined;
  return jsonObject({
    manifestHash: manifest["manifestHash"],
    source: manifest["source"],
    cardDataVersion: manifest["cardDataVersion"],
    effectDefinitionsVersion: manifest["effectDefinitionsVersion"],
    customHandlerVersion: manifest["customHandlerVersion"],
    banlistVersion: manifest["banlistVersion"],
    effectDefinitions,
    createdAt: manifest["createdAt"],
    cards,
  });
};

const matchCardIdsForSetup = (
  setup: DevMatchSetup,
): ReadonlySet<string> =>
  new Set(
    setup.players.flatMap((player) => [
      String(player.leaderCardId),
      ...player.deckCardIds.map(String),
      ...player.donDeckCardIds.map(String),
    ]),
  );

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

const uuidOrNull = (value: string | null | undefined): string | null =>
  value !== undefined &&
  value !== null &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)
    ? value
    : null;

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
    userId: uuidOrNull(seat.subject?.userId ?? handoff?.claims.sub),
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
  const matchCardIds = matchCardIdsForSetup(input.setup);
  const replayFinalStateHash = hashReplayStateForScope(
    input.match.state,
    "gameplay-v1",
  );
  const replayFirstPlayerId =
    input.firstPlayerChoice.resolvedFirstPlayerId ?? input.setup.firstPlayerId;
  const initialStateHash = hashReplayStateForScope(
    createLocalDevMatch({
      ...input.setup,
      firstPlayerId: replayFirstPlayerId,
    }).state,
    "gameplay-v1",
  );
  const initialDeckOrders = jsonObject({
    playerOrder: input.setup.playerOrder,
    firstPlayerId: replayFirstPlayerId,
    shuffleDecks: input.setup.shuffleDecks ?? false,
    players: Object.fromEntries(
      input.setup.players.map((player) => [
        player.playerId,
        {
          leaderCardId: player.leaderCardId,
          leaderLifeCount: player.leaderLifeCount,
          deckCardIds: player.deckCardIds.map(String),
          donDeckCardIds: player.donDeckCardIds.map(String),
        },
      ]),
    ),
  });
  const replayCheckpointIds = new Set(
    input.deterministicRecords.flatMap((record) => {
      const entry = record.deterministicEntry;
      return entry.kind === "system" &&
        entry.operation.type === "restoreRollbackPoint"
        ? [entry.operation.rollbackPointId]
        : [];
    }),
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
      matchCardIds,
    ),
    firstPlayerSeatId: input.setup.firstPlayerId,
    firstPlayerChooserSeatId: input.firstPlayerChoice.chooserPlayerId,
    winnerUserId: uuidOrNull(winnerSeat?.subject?.userId),
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
      replayFormatVersion: "dev-local-v2",
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
      manifestSnapshot: compactManifestSnapshot(
        input.match.state.cardManifest,
        matchCardIds,
      ),
      initialStateHash,
      finalStateHash: replayFinalStateHash,
      initialSnapshot: null,
      initialDeckOrders,
      deterministicEntries: input.deterministicRecords.map((record) =>
        jsonObject(record.deterministicEntry),
      ),
      auditEntries: [
        ...input.deterministicRecords.map((record) =>
          jsonObject(record.audit),
        ),
        ...input.match.state.audit.map((entry) => jsonObject(entry)),
      ],
      checkpoints: input.deterministicCheckpoints
        .filter((record) =>
          replayCheckpointIds.has(record.checkpoint.checkpointId),
        )
        .map((record) => jsonObject(record.checkpoint)),
      finalState: null,
      compressed: false,
      artifactStorage: null,
      artifactKey: null,
      artifactSha256: null,
      artifactSizeBytes: null,
    },
  };
};
