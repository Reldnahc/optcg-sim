import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { CardId } from "@optcg/types";
import { describe, expect, it } from "vitest";

import {
  REDIS_CARD_DATA_CACHE_DEFERRED,
  createFileCardDataCache,
  createInMemoryCardDataCache,
} from "./cache.js";
import { validatePoneglyphCardDetail } from "./poneglyph-schema.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

async function readJsonFixture(relativePath: string): Promise<unknown> {
  const source = await readFile(path.join(repoRoot, relativePath), "utf8");
  return JSON.parse(source) as unknown;
}

function toCardId(value: string): CardId {
  return value as CardId;
}

describe("card data cache", () => {
  it("returns undefined on miss and validated card detail on hit for memory cache", async () => {
    const cache = createInMemoryCardDataCache();
    const fixture = await readJsonFixture(
      "fixtures/poneglyph/cards/OP01-060.donquixote-doflamingo.json",
    );

    await expect(cache.get(toCardId("OP01-060"))).resolves.toBeUndefined();
    await cache.set(toCardId("OP01-060"), validatePoneglyphCardDetail(fixture));
    await expect(cache.get(toCardId("OP01-060"))).resolves.toMatchObject({
      card_number: "OP01-060",
      name: "Donquixote Doflamingo",
    });
  });

  it("fails closed when cached payload is malformed", async () => {
    const cache = createInMemoryCardDataCache({
      seed: {
        "en:OP01-060": {
          card_number: "OP01-060",
          name: "Incomplete",
        },
      },
    });

    await expect(cache.get(toCardId("OP01-060"))).rejects.toThrow(
      /Invalid Poneglyph card detail/,
    );
  });

  it("persists and loads validated card detail with the file cache", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "optcg-cards-cache-"));
    const cache = createFileCardDataCache({ directory });
    const fixture = await readJsonFixture(
      "fixtures/poneglyph/cards/OP05-091.rebecca.json",
    );

    try {
      await expect(cache.get(toCardId("OP05-091"))).resolves.toBeUndefined();
      await cache.set(
        toCardId("OP05-091"),
        validatePoneglyphCardDetail(fixture),
        {
          lang: "ja",
        },
      );
      await expect(
        cache.get(toCardId("OP05-091"), { lang: "ja" }),
      ).resolves.toMatchObject({
        card_number: "OP05-091",
        name: "Rebecca",
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("explicitly defers Redis adapter implementation", () => {
    expect(REDIS_CARD_DATA_CACHE_DEFERRED).toMatch(/deferred/i);
  });
});
