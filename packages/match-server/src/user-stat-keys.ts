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

const scopedStatKey = (key: string, value: string, label: string): string =>
  `${key}:${scopeSegment(value, label)}`;

export const statKeys = {
  matchesCompleted: completed,
  matchesWon: won,
  matchesLost: lost,
  matchesDrawn: drawn,
  matchesConceded: "matches_conceded",
  matchesOpponentConceded: "matches_opponent_conceded",

  pvpMatchesCompleted: "pvp_matches_completed",
  pvpMatchesWon: "pvp_matches_won",
  botMatchesCompleted: "bot_matches_completed",
  botMatchesWon: "bot_matches_won",
  noviceBotMatchesCompleted: "novice_bot_matches_completed",
  noviceBotMatchesWon: "novice_bot_matches_won",
  advancedBotMatchesCompleted: "advanced_bot_matches_completed",
  advancedBotMatchesWon: "advanced_bot_matches_won",

  formatMatchesCompleted: (formatId: string) =>
    scopedStatKey("format_matches_completed", formatId, "Format id"),
  formatMatchesWon: (formatId: string) =>
    scopedStatKey("format_matches_won", formatId, "Format id"),
  gameTypeMatchesCompleted: (gameType: string) =>
    scopedStatKey("game_type_matches_completed", gameType, "Game type"),
  gameTypeMatchesWon: (gameType: string) =>
    scopedStatKey("game_type_matches_won", gameType, "Game type"),
  rankedMatchesCompleted: "ranked_matches_completed",
  rankedMatchesWon: "ranked_matches_won",
  casualMatchesCompleted: "casual_matches_completed",
  casualMatchesWon: "casual_matches_won",

  leaderMatchesCompleted: (cardNumber: string) =>
    scopedStatKey("leader_matches_completed", cardNumber, "Leader card number"),
  leaderMatchesWon: (cardNumber: string) =>
    scopedStatKey("leader_matches_won", cardNumber, "Leader card number"),
  leaderMatchesLost: (cardNumber: string) =>
    scopedStatKey("leader_matches_lost", cardNumber, "Leader card number"),
  leaderMatchesDrawn: (cardNumber: string) =>
    scopedStatKey("leader_matches_drawn", cardNumber, "Leader card number"),

  leaderColorCompleted: (bucket: ColorBucket) =>
    `leader_color_matches_completed:${bucket}`,
  leaderColorWon: (bucket: ColorBucket) => `leader_color_matches_won:${bucket}`,
  leaderColorLost: (bucket: ColorBucket) =>
    `leader_color_matches_lost:${bucket}`,
  leaderColorDrawn: (bucket: ColorBucket) =>
    `leader_color_matches_drawn:${bucket}`,

  leaderNameCompleted: (key: string) =>
    scopedStatKey("leader_name_matches_completed", key, "Leader name key"),
  leaderNameWon: (key: string) =>
    scopedStatKey("leader_name_matches_won", key, "Leader name key"),
  leaderNameLost: (key: string) =>
    scopedStatKey("leader_name_matches_lost", key, "Leader name key"),
  leaderNameDrawn: (key: string) =>
    scopedStatKey("leader_name_matches_drawn", key, "Leader name key"),

  firstPlayerMatchesCompleted: "matches_started_first",
  firstPlayerMatchesWon: "matches_won_started_first",
  secondPlayerMatchesCompleted: "matches_started_second",
  secondPlayerMatchesWon: "matches_won_started_second",

  totalTurnsPlayed: "total_turns_played",
  totalActionsTaken: "total_actions_taken",
  totalMatchSeconds: "total_match_seconds",
  longMatchesCompleted: "long_matches_completed",
  quickWins: "quick_wins",

  dailyMatchesCompleted: (dateKey: string) =>
    scopedStatKey("daily_matches_completed", dateKey, "Daily date key"),
  dailyMatchesWon: (dateKey: string) =>
    scopedStatKey("daily_matches_won", dateKey, "Daily date key"),
  weeklyMatchesCompleted: (weekKey: string) =>
    scopedStatKey("weekly_matches_completed", weekKey, "Weekly date key"),
  weeklyMatchesWon: (weekKey: string) =>
    scopedStatKey("weekly_matches_won", weekKey, "Weekly date key"),
  monthlyMatchesCompleted: (monthKey: string) =>
    scopedStatKey("monthly_matches_completed", monthKey, "Monthly date key"),
  monthlyMatchesWon: (monthKey: string) =>
    scopedStatKey("monthly_matches_won", monthKey, "Monthly date key"),

  cardsPlayed: "cards_played_total",
  charactersPlayed: "characters_played_total",
  eventsPlayed: "events_played_total",
  stagesPlayed: "stages_played_total",
  cardsPlayedByCard: (cardNumber: string) =>
    scopedStatKey("cards_played_by_card", cardNumber, "Card number"),
  charactersPlayedByCard: (cardNumber: string) =>
    scopedStatKey("characters_played_by_card", cardNumber, "Card number"),
  eventsPlayedByCard: (cardNumber: string) =>
    scopedStatKey("events_played_by_card", cardNumber, "Card number"),
  stagesPlayedByCard: (cardNumber: string) =>
    scopedStatKey("stages_played_by_card", cardNumber, "Card number"),
  cardsPlayedColor: (bucket: ColorBucket) => `cards_played_color:${bucket}`,
  charactersPlayedColor: (bucket: ColorBucket) =>
    `characters_played_color:${bucket}`,
  eventsPlayedColor: (bucket: ColorBucket) => `events_played_color:${bucket}`,
  stagesPlayedColor: (bucket: ColorBucket) => `stages_played_color:${bucket}`,

  donAttached: "don_attached_total",
  donRestored: "don_restored_total",
  donReturned: "don_returned_total",
  donRamped: "don_ramped_total",

  attacksDeclared: "attacks_declared",
  leaderAttacksDeclared: "leader_attacks_declared",
  characterAttacksDeclared: "character_attacks_declared",
  blockersUsed: "blockers_used",
  countersUsed: "counters_used",
  counterCardsUsed: "counter_cards_used",
  counterPowerUsedTotal: "counter_power_used_total",
  charactersKoByBattle: "characters_ko_by_battle",
  charactersKoByEffect: "characters_ko_by_effect",

  cardsDrawn: "cards_drawn",
  cardsDiscarded: "cards_discarded",
  cardsTrashedFromHand: "cards_trashed_from_hand",
  cardsTrashedFromDeck: "cards_trashed_from_deck",
  cardsAddedFromLife: "cards_added_from_life",
  lifeDamageTaken: "life_damage_taken",
  lifeRecovered: "life_recovered",
  cardsRevealed: "cards_revealed",
  cardsSearched: "cards_searched",

  effectsActivatedTotal: "effects_activated_total",
  onPlayEffectsActivated: "on_play_effects_activated",
  activateMainEffectsActivated: "activate_main_effects_activated",
  triggerEffectsActivated: "trigger_effects_activated",
  counterEventsPlayed: "counter_events_played",

  currentWinStreak: "current_win_streak",
  bestWinStreak: "best_win_streak",
  currentLossStreak: "current_loss_streak",
  bestLossStreak: "best_loss_streak",
  currentDailyPlayStreak: "current_daily_play_streak",
  bestDailyPlayStreak: "best_daily_play_streak",
} as const;
