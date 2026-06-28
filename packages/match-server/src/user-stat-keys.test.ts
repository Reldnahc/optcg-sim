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

test("colorBuckets exports all expected buckets", () => {
  assert.equal(colorBuckets.length, 21);
  assert.deepEqual(colorBuckets, expectedColorBuckets);
});
