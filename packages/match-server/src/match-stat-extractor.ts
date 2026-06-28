import type { CompletedMatchRecord } from "./postgres-completed-match.js";
import type { CompletedMatchPlayerRecord } from "./postgres-completed-match.js";
import { colorBucketKey, leaderNameKey, statKeys } from "./user-stat-keys.js";

export interface UserStatOperation {
  readonly userId: string;
  readonly statKey: string;
  readonly operation: "increment" | "set" | "max";
  readonly value: number;
}

interface LeaderMetadata {
  readonly name?: string;
  readonly colors?: readonly string[];
}

const authUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

const isAuthUuid = (value: string | null): value is string =>
  value !== null && authUuidPattern.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pushIncrement = (
  operations: UserStatOperation[],
  userId: string,
  statKey: string,
  value = 1,
): void => {
  operations.push({ userId, statKey, operation: "increment", value });
};

const dateFromIso = (value: string): Date | undefined => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const durationSeconds = (
  startedAt: string,
  endedAt: string,
): number | undefined => {
  const started = dateFromIso(startedAt);
  const ended = dateFromIso(endedAt);
  if (started === undefined || ended === undefined) {
    return undefined;
  }
  const seconds = Math.floor((ended.getTime() - started.getTime()) / 1_000);
  return seconds >= 0 ? seconds : undefined;
};

const pad2 = (value: number): string => value.toString().padStart(2, "0");

const dayKey = (date: Date): string =>
  `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(
    date.getUTCDate(),
  )}`;

const monthKey = (date: Date): string =>
  `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;

const isoWeekKey = (date: Date): string => {
  const utcDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = utcDate.getUTCDay() === 0 ? 7 : utcDate.getUTCDay();
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((utcDate.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${utcDate.getUTCFullYear()}-${pad2(week)}`;
};

const indicatesConcede = (value: string | null): boolean =>
  value?.toLowerCase().includes("concede") === true;

const leaderMetadata = (
  record: CompletedMatchRecord,
  leaderCardNumber: string,
): LeaderMetadata | undefined => {
  const cards = record.cardManifestSnapshot["cards"];
  if (!isRecord(cards)) {
    return undefined;
  }
  const card = cards[leaderCardNumber];
  if (!isRecord(card)) {
    return undefined;
  }
  const name = typeof card["name"] === "string" ? card["name"] : undefined;
  const colors = Array.isArray(card["colors"])
    ? card["colors"].filter(
        (color): color is string => typeof color === "string",
      )
    : undefined;
  return {
    ...(name === undefined ? {} : { name }),
    ...(colors === undefined ? {} : { colors }),
  };
};

const safeLeaderNameKey = (name: string): string | undefined => {
  try {
    return leaderNameKey(name);
  } catch {
    return undefined;
  }
};

const safeColorBucketKey = (colors: readonly string[]) => {
  try {
    return colorBucketKey(colors);
  } catch {
    return undefined;
  }
};

const pushOutcomeStats = (
  operations: UserStatOperation[],
  userId: string,
  result: CompletedMatchPlayerRecord["result"],
): void => {
  if (result === "win") {
    pushIncrement(operations, userId, statKeys.matchesWon);
    return;
  }
  if (result === "loss") {
    pushIncrement(operations, userId, statKeys.matchesLost);
    return;
  }
  if (result === "draw") {
    pushIncrement(operations, userId, statKeys.matchesDrawn);
  }
};

const pushLeaderStats = (
  operations: UserStatOperation[],
  userId: string,
  result: CompletedMatchPlayerRecord["result"],
  leaderCardNumber: string,
  metadata: LeaderMetadata | undefined,
): void => {
  pushIncrement(
    operations,
    userId,
    statKeys.leaderMatchesCompleted(leaderCardNumber),
  );
  if (result === "win") {
    pushIncrement(
      operations,
      userId,
      statKeys.leaderMatchesWon(leaderCardNumber),
    );
  } else if (result === "loss") {
    pushIncrement(
      operations,
      userId,
      statKeys.leaderMatchesLost(leaderCardNumber),
    );
  } else if (result === "draw") {
    pushIncrement(
      operations,
      userId,
      statKeys.leaderMatchesDrawn(leaderCardNumber),
    );
  }

  if (metadata?.name !== undefined) {
    const key = safeLeaderNameKey(metadata.name);
    if (key !== undefined) {
      pushIncrement(operations, userId, statKeys.leaderNameCompleted(key));
      if (result === "win") {
        pushIncrement(operations, userId, statKeys.leaderNameWon(key));
      } else if (result === "loss") {
        pushIncrement(operations, userId, statKeys.leaderNameLost(key));
      } else if (result === "draw") {
        pushIncrement(operations, userId, statKeys.leaderNameDrawn(key));
      }
    }
  }

  if (metadata?.colors !== undefined && metadata.colors.length > 0) {
    const bucket = safeColorBucketKey(metadata.colors);
    if (bucket !== undefined) {
      pushIncrement(operations, userId, statKeys.leaderColorCompleted(bucket));
      if (result === "win") {
        pushIncrement(operations, userId, statKeys.leaderColorWon(bucket));
      } else if (result === "loss") {
        pushIncrement(operations, userId, statKeys.leaderColorLost(bucket));
      } else if (result === "draw") {
        pushIncrement(operations, userId, statKeys.leaderColorDrawn(bucket));
      }
    }
  }
};

// Reads transient player metadata such as isBot/botDifficulty from the freshly
// built completion record. Run before persisting or reconstructing from SQL.
export const extractCompletedMatchStatOperations = (
  record: CompletedMatchRecord,
): UserStatOperation[] => {
  if (record.status !== "completed" && record.status !== "draw") {
    return [];
  }

  const operations: UserStatOperation[] = [];
  const duration = durationSeconds(record.startedAt, record.endedAt);
  const ended = dateFromIso(record.endedAt);
  const matchHasConcede =
    indicatesConcede(record.resultReason) || indicatesConcede(record.winType);

  for (const player of record.players) {
    if (!isAuthUuid(player.userId) || player.isBot === true) {
      continue;
    }
    const opponent = record.players.find(
      (candidate) => candidate.seatId !== player.seatId,
    );
    const playedBot = opponent?.isBot === true;
    const playerConceded =
      player.result === "loss" &&
      (matchHasConcede || indicatesConcede(player.resultReason));
    const opponentConceded =
      player.result === "win" &&
      opponent?.result === "loss" &&
      (matchHasConcede || indicatesConcede(opponent.resultReason));

    pushIncrement(operations, player.userId, statKeys.matchesCompleted);
    pushOutcomeStats(operations, player.userId, player.result);

    if (playerConceded) {
      pushIncrement(operations, player.userId, statKeys.matchesConceded);
    }
    if (opponentConceded) {
      pushIncrement(
        operations,
        player.userId,
        statKeys.matchesOpponentConceded,
      );
    }

    if (playedBot) {
      pushIncrement(operations, player.userId, statKeys.botMatchesCompleted);
      if (player.result === "win") {
        pushIncrement(operations, player.userId, statKeys.botMatchesWon);
      }
      if (opponent.botDifficulty === "novice") {
        pushIncrement(
          operations,
          player.userId,
          statKeys.noviceBotMatchesCompleted,
        );
        if (player.result === "win") {
          pushIncrement(
            operations,
            player.userId,
            statKeys.noviceBotMatchesWon,
          );
        }
      }
      if (opponent.botDifficulty === "advanced") {
        pushIncrement(
          operations,
          player.userId,
          statKeys.advancedBotMatchesCompleted,
        );
        if (player.result === "win") {
          pushIncrement(
            operations,
            player.userId,
            statKeys.advancedBotMatchesWon,
          );
        }
      }
    } else {
      pushIncrement(operations, player.userId, statKeys.pvpMatchesCompleted);
      if (player.result === "win") {
        pushIncrement(operations, player.userId, statKeys.pvpMatchesWon);
      }
    }

    pushIncrement(
      operations,
      player.userId,
      statKeys.formatMatchesCompleted(record.formatId),
    );
    pushIncrement(
      operations,
      player.userId,
      statKeys.gameTypeMatchesCompleted(record.gameType),
    );
    if (player.result === "win") {
      pushIncrement(
        operations,
        player.userId,
        statKeys.formatMatchesWon(record.formatId),
      );
      pushIncrement(
        operations,
        player.userId,
        statKeys.gameTypeMatchesWon(record.gameType),
      );
    }

    if (record.gameType === "ranked") {
      pushIncrement(operations, player.userId, statKeys.rankedMatchesCompleted);
      if (player.result === "win") {
        pushIncrement(operations, player.userId, statKeys.rankedMatchesWon);
      }
    }
    if (record.gameType === "unranked") {
      pushIncrement(operations, player.userId, statKeys.casualMatchesCompleted);
      if (player.result === "win") {
        pushIncrement(operations, player.userId, statKeys.casualMatchesWon);
      }
    }

    pushIncrement(
      operations,
      player.userId,
      player.wentFirst
        ? statKeys.firstPlayerMatchesCompleted
        : statKeys.secondPlayerMatchesCompleted,
    );
    if (player.result === "win") {
      pushIncrement(
        operations,
        player.userId,
        player.wentFirst
          ? statKeys.firstPlayerMatchesWon
          : statKeys.secondPlayerMatchesWon,
      );
    }

    if (record.turnCount !== null) {
      pushIncrement(
        operations,
        player.userId,
        statKeys.totalTurnsPlayed,
        record.turnCount,
      );
    }
    if (duration !== undefined) {
      pushIncrement(
        operations,
        player.userId,
        statKeys.totalMatchSeconds,
        duration,
      );
      if (duration >= 1_800) {
        pushIncrement(operations, player.userId, statKeys.longMatchesCompleted);
      }
      if (duration < 300 && player.result === "win") {
        pushIncrement(operations, player.userId, statKeys.quickWins);
      }
    }

    if (ended !== undefined) {
      pushIncrement(
        operations,
        player.userId,
        statKeys.dailyMatchesCompleted(dayKey(ended)),
      );
      pushIncrement(
        operations,
        player.userId,
        statKeys.weeklyMatchesCompleted(isoWeekKey(ended)),
      );
      pushIncrement(
        operations,
        player.userId,
        statKeys.monthlyMatchesCompleted(monthKey(ended)),
      );
    }

    pushLeaderStats(
      operations,
      player.userId,
      player.result,
      player.leaderCardNumber,
      leaderMetadata(record, player.leaderCardNumber),
    );
  }

  return operations;
};
