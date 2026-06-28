export const cardColors = [
  "red",
  "green",
  "blue",
  "purple",
  "black",
  "yellow",
] as const;

export type CardColor = (typeof cardColors)[number];

export const colorBuckets = [
  "mono-red",
  "mono-green",
  "mono-blue",
  "mono-purple",
  "mono-black",
  "mono-yellow",
  "red-green",
  "red-blue",
  "red-purple",
  "red-black",
  "red-yellow",
  "green-blue",
  "green-purple",
  "green-black",
  "green-yellow",
  "blue-purple",
  "blue-black",
  "blue-yellow",
  "purple-black",
  "purple-yellow",
  "black-yellow",
] as const;

export type ColorBucket = (typeof colorBuckets)[number];

const cardColorSet: ReadonlySet<string> = new Set(cardColors);
const colorOrder = new Map<CardColor, number>(
  cardColors.map((color, index) => [color, index]),
);

const isCardColor = (color: string): color is CardColor =>
  cardColorSet.has(color);

const scopeSegment = (value: string, label: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
};

export const colorBucketKey = (colors: readonly string[]): ColorBucket => {
  if (colors.length === 0) {
    throw new Error("Color bucket requires at least one color");
  }

  const normalizedColors = new Set<CardColor>();
  for (const color of colors) {
    const normalizedColor = color.trim().toLowerCase();
    if (!isCardColor(normalizedColor)) {
      throw new Error(`Unsupported card color: ${color}`);
    }
    normalizedColors.add(normalizedColor);
  }

  if (normalizedColors.size > 2) {
    throw new Error("Color bucket supports at most two colors");
  }

  const sortedColors = [...normalizedColors].sort(
    (left, right) =>
      (colorOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (colorOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
  );
  const firstColor = sortedColors[0];
  if (firstColor === undefined) {
    throw new Error("Color bucket requires at least one color");
  }

  if (sortedColors.length === 1) {
    return `mono-${firstColor}`;
  }

  const secondColor = sortedColors[1];
  if (secondColor === undefined) {
    throw new Error(
      "Color bucket supports exactly two colors for dual buckets",
    );
  }

  return `${firstColor}-${secondColor}` as ColorBucket;
};

export const leaderNameKey = (name: string): string => {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length === 0) {
    throw new Error("Leader name is required");
  }

  return slug;
};

const completed = "matches_completed";
const won = "matches_won";
const lost = "matches_lost";
const drawn = "matches_drawn";

export const statKeys = {
  matchesCompleted: completed,
  matchesWon: won,
  matchesLost: lost,
  matchesDrawn: drawn,
  matchesConceded: "matches_conceded",
  matchesOpponentConceded: "matches_opponent_conceded",

  pvpMatchesCompleted: "pvp:matches_completed",
  pvpMatchesWon: "pvp:matches_won",
  botMatchesCompleted: "bot:matches_completed",
  botMatchesWon: "bot:matches_won",
  noviceBotMatchesCompleted: "novice_bot:matches_completed",
  noviceBotMatchesWon: "novice_bot:matches_won",
  advancedBotMatchesCompleted: "advanced_bot:matches_completed",
  advancedBotMatchesWon: "advanced_bot:matches_won",

  formatMatchesCompleted: (formatId: string) =>
    `format:${scopeSegment(formatId, "Format id")}:${completed}`,
  formatMatchesWon: (formatId: string) =>
    `format:${scopeSegment(formatId, "Format id")}:${won}`,
  gameTypeMatchesCompleted: (gameType: string) =>
    `game_type:${scopeSegment(gameType, "Game type")}:${completed}`,
  gameTypeMatchesWon: (gameType: string) =>
    `game_type:${scopeSegment(gameType, "Game type")}:${won}`,
  rankedMatchesCompleted: "ranked:matches_completed",
  rankedMatchesWon: "ranked:matches_won",
  casualMatchesCompleted: "casual:matches_completed",
  casualMatchesWon: "casual:matches_won",

  leaderMatchesCompleted: (cardNumber: string) =>
    `leader:${scopeSegment(cardNumber, "Leader card number")}:${completed}`,
  leaderMatchesWon: (cardNumber: string) =>
    `leader:${scopeSegment(cardNumber, "Leader card number")}:${won}`,
  leaderMatchesLost: (cardNumber: string) =>
    `leader:${scopeSegment(cardNumber, "Leader card number")}:${lost}`,
  leaderMatchesDrawn: (cardNumber: string) =>
    `leader:${scopeSegment(cardNumber, "Leader card number")}:${drawn}`,

  leaderColorCompleted: (bucket: ColorBucket) =>
    `leader_color:${bucket}:${completed}`,
  leaderColorWon: (bucket: ColorBucket) => `leader_color:${bucket}:${won}`,
  leaderColorLost: (bucket: ColorBucket) => `leader_color:${bucket}:${lost}`,
  leaderColorDrawn: (bucket: ColorBucket) => `leader_color:${bucket}:${drawn}`,

  leaderNameCompleted: (key: string) =>
    `leader_name:${scopeSegment(key, "Leader name key")}:${completed}`,
  leaderNameWon: (key: string) =>
    `leader_name:${scopeSegment(key, "Leader name key")}:${won}`,
  leaderNameLost: (key: string) =>
    `leader_name:${scopeSegment(key, "Leader name key")}:${lost}`,
  leaderNameDrawn: (key: string) =>
    `leader_name:${scopeSegment(key, "Leader name key")}:${drawn}`,

  firstPlayerMatchesCompleted: "first_player:matches_completed",
  firstPlayerMatchesWon: "first_player:matches_won",
  secondPlayerMatchesCompleted: "second_player:matches_completed",
  secondPlayerMatchesWon: "second_player:matches_won",

  totalTurnsPlayed: "total_turns_played",
  totalActionsTaken: "total_actions_taken",
  totalPlayTimeSeconds: "total_play_time_seconds",
  fastestWinSeconds: "fastest_win_seconds",
  longestMatchSeconds: "longest_match_seconds",

  dailyMatchesCompleted: (dateKey: string) =>
    `calendar:daily:${scopeSegment(dateKey, "Daily date key")}:${completed}`,
  dailyMatchesWon: (dateKey: string) =>
    `calendar:daily:${scopeSegment(dateKey, "Daily date key")}:${won}`,
  weeklyMatchesCompleted: (weekKey: string) =>
    `calendar:weekly:${scopeSegment(weekKey, "Weekly date key")}:${completed}`,
  weeklyMatchesWon: (weekKey: string) =>
    `calendar:weekly:${scopeSegment(weekKey, "Weekly date key")}:${won}`,
  monthlyMatchesCompleted: (monthKey: string) =>
    `calendar:monthly:${scopeSegment(monthKey, "Monthly date key")}:${completed}`,
  monthlyMatchesWon: (monthKey: string) =>
    `calendar:monthly:${scopeSegment(monthKey, "Monthly date key")}:${won}`,

  cardsDrawn: "cards_drawn",
  cardsPlayed: "cards_played",
  charactersPlayed: "characters_played",
  charactersKo: "characters_ko",
  damageDealt: "damage_dealt",
  damageReceived: "damage_received",
  donAttached: "don_attached",
  lifeRecovered: "life_recovered",
  triggersActivated: "triggers_activated",
} as const;
