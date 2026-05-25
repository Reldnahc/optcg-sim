import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "vitest";
import type { PoneglyphCardDetail } from "@optcg/types";

import { capturePoneglyphFixtures } from "./fixture-capture.js";

const cardDetail = (cardNumber: string, name: string): PoneglyphCardDetail => ({
  card_number: cardNumber,
  name,
  language: "en",
  set: "EB01",
  set_name: "Extra Booster",
  released_at: "2024-01-01",
  released: true,
  card_type: "Character",
  rarity: "C",
  color: ["Blue"],
  cost: 4,
  power: 6000,
  counter: 1000,
  life: null,
  attribute: ["Slash"],
  types: ["Test"],
  effect: "[On Play] Draw 1 card.",
  trigger: null,
  block: "EB01",
  variants: [
    {
      index: 0,
      name: null,
      label: "Standard",
      artist: null,
      product: {
        id: "eb01",
        slug: "extra-booster",
        name: "Extra Booster",
        set_code: "EB01",
        released_at: "2024-01-01",
      },
      images: {
        stock: {
          full: `https://cdn.poneglyph.one/images/${cardNumber}/en/stock/0/full.png`,
          thumb: `https://cdn.poneglyph.one/images/${cardNumber}/en/stock/0/thumb.webp`,
        },
        scan: {
          display: null,
          full: null,
          thumb: null,
        },
      },
      errata: [],
      market: {
        tcgplayer_url: null,
        market_price: null,
        low_price: null,
        mid_price: null,
        high_price: null,
      },
    },
  ],
  legality: {
    standard: {
      status: "legal",
      max_copies: 4,
    },
  },
  available_languages: ["en"],
  official_faq: [],
});

describe("fixture capture helper", () => {
  test("dry-run validates Poneglyph detail payloads without writing files", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "optcg-capture-dry-"));
    const requestedUrls: string[] = [];

    const result = await capturePoneglyphFixtures({
      cardIds: ["EB01-023"],
      outDir,
      dryRun: true,
      fetchCard: (url) => {
        requestedUrls.push(url);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({ data: cardDetail("EB01-023", "Edward Weevil") }),
        });
      },
    });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(requestedUrls, [
      "https://api.poneglyph.one/v1/cards/EB01-023",
    ]);
    assert.deepEqual(await readdir(outDir), []);
    assert.deepEqual(result.files, [
      path.join(outDir, "EB01-023.edward-weevil.json"),
    ]);
    assert.match(result.lines[0] ?? "", /^Validated EB01-023 Edward Weevil/u);
  });

  test("captures multiple explicit cards after every payload validates", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "optcg-capture-"));
    const payloads = new Map([
      ["EB01-023", cardDetail("EB01-023", "Edward Weevil")],
      ["OP10-045", cardDetail("OP10-045", "Cavendish")],
    ]);

    const result = await capturePoneglyphFixtures({
      cardIds: ["EB01-023", "OP10-045", "EB01-023"],
      outDir,
      lang: "en",
      baseUrl: "https://api.test",
      fetchCard: (url) => {
        const cardId = url.includes("OP10-045") ? "OP10-045" : "EB01-023";
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: payloads.get(cardId) }),
        });
      },
    });

    assert.equal(result.exitCode, 0);
    assert.deepEqual((await readdir(outDir)).sort(), [
      "EB01-023.edward-weevil.json",
      "OP10-045.cavendish.json",
    ]);
    const captured = JSON.parse(
      await readFile(path.join(outDir, "EB01-023.edward-weevil.json"), "utf8"),
    ) as { card_number?: unknown; name?: unknown };
    assert.equal(captured.card_number, "EB01-023");
    assert.equal(captured.name, "Edward Weevil");
  });

  test("does not write partial fixtures when a later card fails validation", async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), "optcg-capture-fail-"));

    const result = await capturePoneglyphFixtures({
      cardIds: ["EB01-023", "OP10-999"],
      outDir,
      fetchCard: (url) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve(
              url.includes("OP10-999")
                ? { data: { card_number: "OP10-999" } }
                : { data: cardDetail("EB01-023", "Edward Weevil") },
            ),
        }),
    });

    assert.equal(result.exitCode, 1);
    assert.deepEqual(await readdir(outDir), []);
    assert.deepEqual(result.errors, [
      "Poneglyph fixture capture failed for OP10-999: invalid response payload",
    ]);
  });
});
