import { strict as assert } from "node:assert";
import { test } from "vitest";

import {
  colorBucketKey,
  colorBuckets,
  leaderNameKey,
  statKeys,
} from "./user-stat-keys.js";

const expectedColorBuckets = [
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

const removedNonCatalogInGameStatNames = [
  "cards_drawn_total",
  "characters_ko_total",
  "damage_dealt_total",
  "damage_received_total",
  "life_recovered_total",
  "triggers_activated_total",
] as const;
const removedNonCatalogInGameStatNameSet: ReadonlySet<string> = new Set(
  removedNonCatalogInGameStatNames,
);

test("colorBucketKey builds exact mono and ordered dual buckets", () => {
  assert.equal(colorBucketKey(["Red"]), "mono-red");
  assert.equal(colorBucketKey(["blue", "red"]), "red-blue");
  assert.equal(colorBucketKey(["yellow", "black"]), "black-yellow");
  assert.equal(colorBucketKey(["red", "RED", "Red"]), "mono-red");
});

test("colorBucketKey rejects unsupported, empty, and three-color inputs", () => {
  assert.throws(() => colorBucketKey([]), /at least one/i);
  assert.throws(() => colorBucketKey(["white"]), /unsupported/i);
  assert.throws(() => colorBucketKey(["red", "blue", "green"]), /at most two/i);
});

test("leaderNameKey normalizes names to ASCII slugs", () => {
  assert.equal(leaderNameKey("Monkey.D.Luffy"), "monkey-d-luffy");
  assert.equal(leaderNameKey("Roronoa Zoro"), "roronoa-zoro");
});

test("stat key builders format scoped stats", () => {
  assert.equal(statKeys.matchesCompleted, "matches_completed");
  assert.equal(statKeys.pvpMatchesCompleted, "pvp_matches_completed");
  assert.equal(statKeys.botMatchesWon, "bot_matches_won");
  assert.equal(
    statKeys.formatMatchesCompleted("constructed"),
    "format_matches_completed:constructed",
  );
  assert.equal(
    statKeys.formatMatchesWon("constructed"),
    "format_matches_won:constructed",
  );
  assert.equal(
    statKeys.gameTypeMatchesWon("dev"),
    "game_type_matches_won:dev",
  );
  assert.equal(statKeys.rankedMatchesCompleted, "ranked_matches_completed");
  assert.equal(
    statKeys.leaderMatchesCompleted("OP01-001"),
    "leader_matches_completed:OP01-001",
  );
  assert.equal(
    statKeys.leaderColorWon("red-blue"),
    "leader_color_matches_won:red-blue",
  );
  assert.equal(
    statKeys.leaderNameLost("monkey-d-luffy"),
    "leader_name_matches_lost:monkey-d-luffy",
  );
});

test("stat key constants use catalog names for first second and volume stats", () => {
  assert.equal(statKeys.firstPlayerMatchesCompleted, "matches_started_first");
  assert.equal(statKeys.secondPlayerMatchesCompleted, "matches_started_second");
  assert.equal(statKeys.firstPlayerMatchesWon, "matches_won_started_first");
  assert.equal(statKeys.secondPlayerMatchesWon, "matches_won_started_second");

  assert.equal(statKeys.totalTurnsPlayed, "total_turns_played");
  assert.equal(statKeys.totalActionsTaken, "total_actions_taken");
  assert.equal(statKeys.totalMatchSeconds, "total_match_seconds");
  assert.equal(statKeys.longMatchesCompleted, "long_matches_completed");
  assert.equal(statKeys.quickWins, "quick_wins");
});

test("calendar and activity stat keys use exact catalog names", () => {
  assert.equal(
    statKeys.dailyMatchesCompleted("2026-06-28"),
    "daily_matches_completed:2026-06-28",
  );
  assert.equal(
    statKeys.weeklyMatchesCompleted("2026-26"),
    "weekly_matches_completed:2026-26",
  );
  assert.equal(
    statKeys.monthlyMatchesCompleted("2026-06"),
    "monthly_matches_completed:2026-06",
  );

  assert.equal(statKeys.cardsPlayed, "cards_played_total");
  assert.equal(statKeys.charactersPlayed, "characters_played_total");
});

test("in-game card play stat keys use exact catalog names", () => {
  assert.equal(statKeys.cardsPlayed, "cards_played_total");
  assert.equal(statKeys.charactersPlayed, "characters_played_total");
  assert.equal(statKeys.eventsPlayed, "events_played_total");
  assert.equal(statKeys.stagesPlayed, "stages_played_total");

  assert.equal(
    statKeys.cardsPlayedByCard("OP01-016"),
    "cards_played_by_card:OP01-016",
  );
  assert.equal(
    statKeys.charactersPlayedByCard("OP01-016"),
    "characters_played_by_card:OP01-016",
  );
  assert.equal(
    statKeys.eventsPlayedByCard("OP01-016"),
    "events_played_by_card:OP01-016",
  );
  assert.equal(
    statKeys.stagesPlayedByCard("OP01-016"),
    "stages_played_by_card:OP01-016",
  );
});

test("in-game card color play stat keys use exact catalog names", () => {
  assert.equal(
    statKeys.cardsPlayedColor("black-yellow"),
    "cards_played_color:black-yellow",
  );
  assert.equal(
    statKeys.charactersPlayedColor("black-yellow"),
    "characters_played_color:black-yellow",
  );
  assert.equal(
    statKeys.eventsPlayedColor("black-yellow"),
    "events_played_color:black-yellow",
  );
  assert.equal(
    statKeys.stagesPlayedColor("black-yellow"),
    "stages_played_color:black-yellow",
  );
});

test("in-game DON resource stat keys use exact catalog names", () => {
  assert.equal(statKeys.donAttached, "don_attached_total");
  assert.equal(statKeys.donRestored, "don_restored_total");
  assert.equal(statKeys.donReturned, "don_returned_total");
  assert.equal(statKeys.donRamped, "don_ramped_total");
});

test("in-game combat stat keys use exact catalog names", () => {
  assert.equal(statKeys.attacksDeclared, "attacks_declared");
  assert.equal(statKeys.leaderAttacksDeclared, "leader_attacks_declared");
  assert.equal(
    statKeys.characterAttacksDeclared,
    "character_attacks_declared",
  );
  assert.equal(statKeys.blockersUsed, "blockers_used");
  assert.equal(statKeys.countersUsed, "counters_used");
  assert.equal(statKeys.counterCardsUsed, "counter_cards_used");
  assert.equal(statKeys.counterPowerUsedTotal, "counter_power_used_total");
  assert.equal(statKeys.charactersKoByBattle, "characters_ko_by_battle");
  assert.equal(statKeys.charactersKoByEffect, "characters_ko_by_effect");
});

test("in-game card movement stat keys use exact catalog names", () => {
  assert.equal(statKeys.cardsDrawn, "cards_drawn");
  assert.equal(statKeys.cardsDiscarded, "cards_discarded");
  assert.equal(statKeys.cardsTrashedFromHand, "cards_trashed_from_hand");
  assert.equal(statKeys.cardsTrashedFromDeck, "cards_trashed_from_deck");
  assert.equal(statKeys.cardsAddedFromLife, "cards_added_from_life");
  assert.equal(statKeys.lifeDamageTaken, "life_damage_taken");
  assert.equal(statKeys.lifeRecovered, "life_recovered");
  assert.equal(statKeys.cardsRevealed, "cards_revealed");
  assert.equal(statKeys.cardsSearched, "cards_searched");
});

test("in-game effect stat keys use exact catalog names", () => {
  assert.equal(statKeys.effectsActivatedTotal, "effects_activated_total");
  assert.equal(
    statKeys.onPlayEffectsActivated,
    "on_play_effects_activated",
  );
  assert.equal(
    statKeys.activateMainEffectsActivated,
    "activate_main_effects_activated",
  );
  assert.equal(
    statKeys.triggerEffectsActivated,
    "trigger_effects_activated",
  );
  assert.equal(statKeys.counterEventsPlayed, "counter_events_played");
});

test("streak stat keys use exact catalog names", () => {
  assert.equal(statKeys.currentWinStreak, "current_win_streak");
  assert.equal(statKeys.bestWinStreak, "best_win_streak");
  assert.equal(statKeys.currentLossStreak, "current_loss_streak");
  assert.equal(statKeys.bestLossStreak, "best_loss_streak");
  assert.equal(
    statKeys.currentDailyPlayStreak,
    "current_daily_play_streak",
  );
  assert.equal(statKeys.bestDailyPlayStreak, "best_daily_play_streak");
});

test("stat keys do not emit old colon-reordered names", () => {
  assert.notEqual(
    statKeys.leaderMatchesCompleted("OP01-001"),
    "leader:OP01-001:matches_completed",
  );
  assert.notEqual(
    statKeys.leaderColorWon("red-blue"),
    "leader_color:red-blue:matches_won",
  );
  assert.notEqual(
    statKeys.leaderNameLost("monkey-d-luffy"),
    "leader_name:monkey-d-luffy:matches_lost",
  );
  assert.notEqual(statKeys.pvpMatchesCompleted, "pvp:matches_completed");
});

test("stat keys do not emit removed non-catalog in-game names", () => {
  const emittedKeys = [
    statKeys.cardsPlayed,
    statKeys.charactersPlayed,
    statKeys.eventsPlayed,
    statKeys.stagesPlayed,
    statKeys.cardsPlayedByCard("OP01-016"),
    statKeys.charactersPlayedByCard("OP01-016"),
    statKeys.eventsPlayedByCard("OP01-016"),
    statKeys.stagesPlayedByCard("OP01-016"),
    statKeys.cardsPlayedColor("black-yellow"),
    statKeys.charactersPlayedColor("black-yellow"),
    statKeys.eventsPlayedColor("black-yellow"),
    statKeys.stagesPlayedColor("black-yellow"),
    statKeys.donAttached,
    statKeys.donRestored,
    statKeys.donReturned,
    statKeys.donRamped,
    statKeys.attacksDeclared,
    statKeys.leaderAttacksDeclared,
    statKeys.characterAttacksDeclared,
    statKeys.blockersUsed,
    statKeys.countersUsed,
    statKeys.counterCardsUsed,
    statKeys.counterPowerUsedTotal,
    statKeys.cardsDrawn,
    statKeys.cardsDiscarded,
    statKeys.cardsTrashedFromHand,
    statKeys.cardsTrashedFromDeck,
    statKeys.cardsAddedFromLife,
    statKeys.charactersKoByBattle,
    statKeys.charactersKoByEffect,
    statKeys.lifeDamageTaken,
    statKeys.lifeRecovered,
    statKeys.cardsRevealed,
    statKeys.cardsSearched,
    statKeys.effectsActivatedTotal,
    statKeys.onPlayEffectsActivated,
    statKeys.activateMainEffectsActivated,
    statKeys.triggerEffectsActivated,
    statKeys.counterEventsPlayed,
    statKeys.currentWinStreak,
    statKeys.bestWinStreak,
    statKeys.currentLossStreak,
    statKeys.bestLossStreak,
    statKeys.currentDailyPlayStreak,
    statKeys.bestDailyPlayStreak,
  ];

  assert.deepEqual(
    emittedKeys.filter((key) => removedNonCatalogInGameStatNameSet.has(key)),
    [],
  );
});

test("colorBuckets exports all expected buckets", () => {
  assert.equal(colorBuckets.length, 21);
  assert.deepEqual(colorBuckets, expectedColorBuckets);
});
