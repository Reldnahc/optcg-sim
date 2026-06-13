import { readFile } from "node:fs/promises";

import type {
  CompletedMatchReplayDetail,
  CompletedMatchReplayPlayerSummary,
  CompletedMatchReplayRepository,
  CompletedMatchReplaySummary,
} from "./postgres-completed-match.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (
  record: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
};

const nullableStringValue = (
  record: Record<string, unknown>,
  key: string,
): string | null | undefined => {
  const value = record[key];
  return value === null || typeof value === "string" ? value : undefined;
};

const nullableNumberValue = (
  record: Record<string, unknown>,
  key: string,
): number | null | undefined => {
  const value = record[key];
  return value === null || typeof value === "number" ? value : undefined;
};

const booleanValue = (
  record: Record<string, unknown>,
  key: string,
): boolean | undefined => {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
};

const playerSummaryFromFixture = (
  value: unknown,
): CompletedMatchReplayPlayerSummary | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const seatId = stringValue(value, "seatId");
  const userId = nullableStringValue(value, "userId");
  const displayName = nullableStringValue(value, "displayName");
  const leaderCardNumber = stringValue(value, "leaderCardNumber");
  const result = stringValue(value, "result");
  const isWinner = booleanValue(value, "isWinner");
  if (
    seatId === undefined ||
    userId === undefined ||
    displayName === undefined ||
    leaderCardNumber === undefined ||
    isWinner === undefined ||
    (result !== "win" && result !== "loss" && result !== "draw")
  ) {
    return undefined;
  }
  return {
    seatId,
    userId,
    displayName,
    leaderCardNumber,
    result,
    isWinner,
  };
};

const replayDetailFromFixture = (
  value: unknown,
): CompletedMatchReplayDetail | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const matchId = stringValue(value, "matchId");
  const status = stringValue(value, "status");
  const gameType = stringValue(value, "gameType");
  const formatId = stringValue(value, "formatId");
  const lobbyId = nullableStringValue(value, "lobbyId");
  const winnerUserId = nullableStringValue(value, "winnerUserId");
  const winnerSeatId = nullableStringValue(value, "winnerSeatId");
  const startedAt = stringValue(value, "startedAt");
  const endedAt = stringValue(value, "endedAt");
  const turnCount = nullableNumberValue(value, "turnCount");
  const actionCount = value["actionCount"];
  const players = Array.isArray(value["players"])
    ? value["players"].flatMap((player) => {
        const summary = playerSummaryFromFixture(player);
        return summary === undefined ? [] : [summary];
      })
    : undefined;
  const replay = value["replay"];
  if (
    matchId === undefined ||
    (status !== "completed" && status !== "draw" && status !== "abandoned") ||
    (gameType !== "ranked" && gameType !== "unranked" && gameType !== "dev") ||
    formatId === undefined ||
    lobbyId === undefined ||
    winnerUserId === undefined ||
    winnerSeatId === undefined ||
    startedAt === undefined ||
    endedAt === undefined ||
    turnCount === undefined ||
    typeof actionCount !== "number" ||
    players === undefined ||
    !isRecord(replay)
  ) {
    return undefined;
  }
  return {
    matchId,
    status,
    gameType,
    formatId,
    lobbyId,
    winnerUserId,
    winnerSeatId,
    startedAt,
    endedAt,
    turnCount,
    actionCount,
    players,
    replay,
  };
};

const replaySummaryFromDetail = (
  detail: CompletedMatchReplayDetail,
): CompletedMatchReplaySummary => ({
  matchId: detail.matchId,
  status: detail.status,
  gameType: detail.gameType,
  formatId: detail.formatId,
  lobbyId: detail.lobbyId,
  winnerUserId: detail.winnerUserId,
  winnerSeatId: detail.winnerSeatId,
  startedAt: detail.startedAt,
  endedAt: detail.endedAt,
  turnCount: detail.turnCount,
  actionCount: detail.actionCount,
  players: detail.players,
});

export const createLocalReplayFixtureRepository = (
  fixturePath: string,
): CompletedMatchReplayRepository => {
  const loadReplay = async (): Promise<
    CompletedMatchReplayDetail | undefined
  > => {
    const parsed = JSON.parse(await readFile(fixturePath, "utf8")) as unknown;
    const replayValue = isRecord(parsed) ? parsed["replay"] : undefined;
    return replayDetailFromFixture(replayValue);
  };
  return {
    async listReplays() {
      const replay = await loadReplay();
      return replay === undefined ? [] : [replaySummaryFromDetail(replay)];
    },
    async getReplay(matchId) {
      const replay = await loadReplay();
      return replay?.matchId === matchId ? replay : undefined;
    },
  };
};
