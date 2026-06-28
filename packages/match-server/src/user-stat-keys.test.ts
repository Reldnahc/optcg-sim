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
  assert.equal(
    statKeys.formatMatchesCompleted("constructed"),
    "format:constructed:matches_completed",
  );
  assert.equal(
    statKeys.formatMatchesWon("constructed"),
    "format:constructed:matches_won",
  );
  assert.equal(
    statKeys.leaderMatchesCompleted("OP01-001"),
    "leader:OP01-001:matches_completed",
  );
  assert.equal(
    statKeys.leaderColorWon("red-blue"),
    "leader_color:red-blue:matches_won",
  );
  assert.equal(
    statKeys.leaderNameLost("monkey-d-luffy"),
    "leader_name:monkey-d-luffy:matches_lost",
  );
});

test("colorBuckets exports all expected buckets", () => {
  assert.equal(colorBuckets.length, 21);
  assert.deepEqual(colorBuckets, expectedColorBuckets);
});
