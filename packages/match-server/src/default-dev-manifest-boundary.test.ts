import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { CardId } from "@optcg/types";

import {
  createDevDeckCardIds,
  createDevManifestCardIds,
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
    const leaderCardId = "OP13-079" as CardId;
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
        leaderCardId,
        firstPlayerEntries,
        secondPlayerEntries,
      ),
      ["OP13-079", "OP13-080", "OP13-082", "OP13-091", "OP13-084"],
    );
  });
});
