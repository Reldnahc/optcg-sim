import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { CardId, PlayerId } from "@optcg/types";

import {
  createDevDeckCardIds,
  createDevDonDeckCardIds,
  createDevRngSeed,
  createDevManifestCardIds,
  createDevPlayerSetupFromDecklist,
  defaultDevDonCounts,
  defaultDevEffectDefinitionsVersion,
  parseDevDecklistText,
  resolveDevDonCounts,
  type DevDeckCardEntry,
} from "./default-dev-manifest.js";

describe("default dev manifest boundary", () => {
  test("does not compile card text or read card fixtures in match-server", async () => {
    const source = await readFile(
      new URL("./default-dev-manifest.ts", import.meta.url),
      "utf8",
    );

    assert.equal(source.includes("parseCardEffectLineDetailed"), false);
    assert.equal(source.includes("evaluateEffectBlockRuntimeSupport"), false);
    assert.equal(source.includes("readFileSync"), false);
    assert.equal(source.includes("fixtures/poneglyph/cards"), false);
  });

  test("dev deck entries support custom quantities and derive manifest ids", () => {
    const firstPlayerEntries: readonly DevDeckCardEntry[] = [
      { cardId: "OP13-080" as CardId, count: 4 },
      { cardId: "OP13-082" as CardId, count: 2 },
      { cardId: "OP13-091" as CardId, count: 1 },
      { cardId: "OP13-080" as CardId, count: 1 },
    ];
    const secondPlayerEntries: readonly DevDeckCardEntry[] = [
      { cardId: "OP13-084" as CardId, count: 3 },
      { cardId: "OP13-091" as CardId, count: 2 },
    ];

    assert.deepEqual(createDevDeckCardIds(firstPlayerEntries), [
      "OP13-080",
      "OP13-080",
      "OP13-080",
      "OP13-080",
      "OP13-082",
      "OP13-082",
      "OP13-091",
      "OP13-080",
    ]);
    assert.deepEqual(createDevDeckCardIds(secondPlayerEntries), [
      "OP13-084",
      "OP13-084",
      "OP13-084",
      "OP13-091",
      "OP13-091",
    ]);
    assert.deepEqual(
      createDevManifestCardIds(
        {
          leaderCardId: "OP13-079" as CardId,
          deckEntries: firstPlayerEntries,
        },
        {
          leaderCardId: "OP13-079" as CardId,
          deckEntries: secondPlayerEntries,
        },
      ),
      ["OP13-079", "OP13-080", "OP13-082", "OP13-091", "OP13-084"],
    );
  });

  test("dev DON deck counts come from the dev manifest player setup", () => {
    assert.deepEqual(createDevDonDeckCardIds(6), [
      "dev-don-1",
      "dev-don-2",
      "dev-don-3",
      "dev-don-4",
      "dev-don-5",
      "dev-don-6",
    ]);
    assert.deepEqual(defaultDevDonCounts, {
      firstPlayer: 6,
      secondPlayer: 10,
    });
    assert.deepEqual(resolveDevDonCounts(defaultDevDonCounts), [6, 10]);
  });

  test("dev generated effect definition cache version invalidates parser-output changes", () => {
    assert.equal(defaultDevEffectDefinitionsVersion, "generated-dev-v3");
  });

  test("dev RNG seed is fresh for each generated setup", () => {
    assert.notEqual(createDevRngSeed(), createDevRngSeed());
  });

  test("rejects invalid dev DON deck count overrides", () => {
    assert.throws(
      () =>
        resolveDevDonCounts({
          ...defaultDevDonCounts,
          firstPlayer: 0,
        }),
      /deck1 DON deck count must be a positive integer/u,
    );
    assert.throws(
      () =>
        resolveDevDonCounts({
          ...defaultDevDonCounts,
          secondPlayer: 0,
        }),
      /deck2 DON deck count must be a positive integer/u,
    );
  });

  test("parses dev decklists with a required first-line one-copy leader", () => {
    const decklist = parseDevDecklistText(
      ["1xOP13-079", "4xOP13-080", "2xOP13-082", "1xOP13-099"].join("\n"),
    );

    assert.equal(decklist.leaderCardId, "OP13-079");
    assert.deepEqual(decklist.deckEntries, [
      { cardId: "OP13-080", count: 4 },
      { cardId: "OP13-082", count: 2 },
      { cardId: "OP13-099", count: 1 },
    ]);
    assert.deepEqual(createDevDeckCardIds(decklist.deckEntries), [
      "OP13-080",
      "OP13-080",
      "OP13-080",
      "OP13-080",
      "OP13-082",
      "OP13-082",
      "OP13-099",
    ]);
  });

  test("rejects decklists whose first entry is not exactly one leader copy", () => {
    assert.throws(
      () => parseDevDecklistText("4xOP13-079\n4xOP13-080"),
      /first line must be the leader as 1xCARDID/u,
    );
  });

  test("rejects malformed dev decklist lines", () => {
    assert.throws(
      () => parseDevDecklistText("1xOP13-079\n4 x OP13-080"),
      /invalid dev decklist line 2/u,
    );
  });

  test("derives player leader life count from the resolved leader metadata", () => {
    const setup = createDevPlayerSetupFromDecklist(
      "p1" as PlayerId,
      {
        leaderCardId: "OP13-079" as CardId,
        deckEntries: [{ cardId: "OP13-080" as CardId, count: 2 }],
      },
      {
        cards: {
          ["OP13-079" as CardId]: {
            category: "leader",
            life: 4,
          },
        },
      },
      ["dev-don-1" as CardId],
    );

    assert.equal(setup.leaderCardId, "OP13-079");
    assert.equal(setup.leaderLifeCount, 4);
    assert.deepEqual(setup.deckCardIds, ["OP13-080", "OP13-080"]);
  });

  test("rejects dev decklists whose leader metadata is missing life", () => {
    assert.throws(
      () =>
        createDevPlayerSetupFromDecklist(
          "p1" as PlayerId,
          { leaderCardId: "OP13-079" as CardId, deckEntries: [] },
          {
            cards: {
              ["OP13-079" as CardId]: {
                category: "leader",
              },
            },
          },
          [],
        ),
      /leader OP13-079 must have a life count/u,
    );
  });
});
