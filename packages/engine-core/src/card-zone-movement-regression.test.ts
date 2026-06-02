import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import assert from "node:assert/strict";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

const readSource = (path: string): string =>
  readFileSync(join(repoRoot, path), "utf8");

test("trash front doors delegate concrete movement to the shared zone movement helper", () => {
  const frontDoors = [
    "packages/engine-core/src/effect-runtime-move-cards.ts",
    "packages/engine-core/src/effect-runtime-trash-from-hand.ts",
    "packages/engine-core/src/effect-runtime-target-ko-primitives.ts",
  ];

  for (const path of frontDoors) {
    const source = readSource(path);
    assert.match(
      source,
      /\bmoveConcreteCardsToTrash\b/,
      `${path} must use shared concrete card-to-trash movement`,
    );
    assert.doesNotMatch(
      source,
      /appendEvent\([^)]*"cardMoved"/s,
      `${path} must not hand-roll cardMoved for trash movement`,
    );
    assert.doesNotMatch(
      source,
      /appendEvent\([^)]*"cardTrashed"/s,
      `${path} must not hand-roll cardTrashed for trash movement`,
    );
    assert.doesNotMatch(
      source,
      /reindexZoneCards\([^)]*"trash"/s,
      `${path} must not hand-roll trash-zone reindexing`,
    );
  }
});

test("battle K.O. keeps K.O. semantics but delegates concrete trash movement", () => {
  const source = readSource("packages/engine-core/src/battle/resolution.ts");

  assert.match(source, /\bmoveConcreteCardsToTrash\b/);
  assert.match(source, /appendEvent\([^)]*"cardKOd"/s);
  assert.doesNotMatch(
    source,
    /reason:\s*"ko"/,
    "battle K.O. movement reason must be owned by the shared movement helper",
  );
});

test("play-card placement trash front doors delegate concrete movement", () => {
  const source = readSource("packages/engine-core/src/play-card/placement.ts");

  assert.match(source, /\bmoveConcreteCardsToTrash\b/);
  assert.doesNotMatch(
    source,
    /appendEvent\([^)]*"cardTrashed"/s,
    "play-card must not hand-roll cardTrashed for event cleanup, overflow, or stage replacement",
  );
  assert.doesNotMatch(
    source,
    /zone:\s*\{\s*zone:\s*"trash"/s,
    "play-card must not construct trash-zone cards directly",
  );
});

test("counter card trash front door delegates concrete movement", () => {
  const source = readSource(
    "packages/engine-core/src/battle/counter-card-use.ts",
  );

  assert.match(source, /\bmoveConcreteCardsToTrash\b/);
  assert.doesNotMatch(
    source,
    /appendEvent\([^)]*"cardTrashed"/s,
    "counter card use must not hand-roll cardTrashed",
  );
  assert.doesNotMatch(
    source,
    /zone:\s*\{\s*zone:\s*"trash"/s,
    "counter card use must not construct trash-zone cards directly",
  );
});

test("search reveal trash remainder delegates concrete movement", () => {
  const source = readSource(
    "packages/engine-core/src/effect-runtime-search-reveal/remainder.ts",
  );

  assert.match(source, /\bmoveConcreteCardsToTrash\b/);
  assert.doesNotMatch(
    source,
    /appendEvent\([^)]*"cardTrashed"/s,
    "search reveal trash remainder must not hand-roll cardTrashed",
  );
  assert.doesNotMatch(
    source,
    /zone:\s*\{\s*zone:\s*"trash"/s,
    "search reveal trash remainder must not construct trash-zone cards directly",
  );
});

test("life trigger cleanup delegates concrete movement", () => {
  const source = readSource(
    "packages/engine-core/src/effect-runtime-life-trigger-cleanup.ts",
  );

  assert.match(source, /\bmoveConcreteCardsToTrash\b/);
  assert.doesNotMatch(
    source,
    /appendEvent\([^)]*"cardTrashed"/s,
    "life trigger cleanup must not hand-roll cardTrashed",
  );
  assert.doesNotMatch(
    source,
    /zone:\s*\{\s*zone:\s*"trash"/s,
    "life trigger cleanup must not construct trash-zone cards directly",
  );
});

test("optional activation trash costs delegate concrete movement", () => {
  const source = readSource(
    "packages/engine-core/src/optional-activation-actions.ts",
  );

  assert.match(source, /\bmoveConcreteCardsToTrash\b/);
  assert.doesNotMatch(
    source,
    /appendEvent\([^)]*"cardTrashed"/s,
    "optional activation trash costs must not hand-roll cardTrashed",
  );
  assert.doesNotMatch(
    source,
    /zone:\s*\{\s*zone:\s*"trash"/s,
    "optional activation trash costs must not construct trash-zone cards directly",
  );
});

test("start-of-game stage replacement delegates concrete movement", () => {
  const source = readSource(
    "packages/engine-core/src/start-of-game-effects.ts",
  );

  assert.match(source, /\bmoveConcreteCardsToTrash\b/);
  assert.doesNotMatch(
    source,
    /appendEvent\([^)]*"cardTrashed"/s,
    "start-of-game stage replacement must not hand-roll cardTrashed",
  );
  assert.doesNotMatch(
    source,
    /zone:\s*\{\s*zone:\s*"trash"/s,
    "start-of-game stage replacement must not construct trash-zone cards directly",
  );
});

test("sequence effect trash delegates concrete movement", () => {
  const source = [
    "packages/engine-core/src/effect-runtime-sequence-all-target-segments.ts",
    "packages/engine-core/src/effect-runtime-sequence/saved-field-object.ts",
  ]
    .map(readSource)
    .join("\n");

  assert.match(source, /\bmoveConcreteCardsToTrash\b/);
  assert.doesNotMatch(
    source,
    /appendEvent\([^)]*"cardTrashed"/s,
    "sequence effect trash must not hand-roll cardTrashed",
  );
  assert.doesNotMatch(
    source,
    /zone:\s*\{\s*zone:\s*"trash"/s,
    "sequence effect trash must not construct trash-zone cards directly",
  );
});
