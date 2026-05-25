import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { CardId, PoneglyphCardDetail, ResolvedCard } from "@optcg/types";

import {
  buildDevMatchCardManifestFromPoneglyphIds,
  type DevPoneglyphFetch,
  parseDevCardIdList,
} from "./dev-manifest.js";

const baseCard = (
  cardNumber: string,
  effect: string | null,
): PoneglyphCardDetail => ({
  card_number: cardNumber,
  name: cardNumber,
  language: "en",
  set: "DEV",
  set_name: "Dev Set",
  released_at: null,
  released: true,
  card_type: "Character",
  rarity: null,
  color: ["Blue"],
  cost: 1,
  power: 1000,
  counter: 1000,
  life: null,
  attribute: ["Special"],
  types: ["Test"],
  effect,
  trigger: null,
  block: null,
  variants: [
    {
      index: 0,
      name: null,
      label: null,
      artist: null,
      product: {
        id: null,
        slug: null,
        name: null,
        set_code: null,
        released_at: null,
      },
      images: {
        stock: { full: "https://cdn.example/card.png", thumb: null },
        scan: { display: null, full: null, thumb: null },
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
  legality: {},
  available_languages: ["en"],
  official_faq: [],
});

const fetchFrom =
  (cards: Record<string, PoneglyphCardDetail>): DevPoneglyphFetch =>
  (url) => {
    const cardId = decodeURIComponent(url.split("/").at(-1) ?? "");
    const card = cards[cardId];
    if (card === undefined) {
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: card }),
    });
  };

describe("dev Poneglyph manifest builder", () => {
  test("parses a text card list into unique card IDs", () => {
    assert.deepEqual(
      parseDevCardIdList(`
        OP13-079
        OP13-080

        OP13-080
      `),
      ["OP13-079", "OP13-080"],
    );
  });

  test("builds a live Poneglyph-backed manifest and checks generated support", async () => {
    const op01001 = "OP01-001" as CardId;
    const op01002 = "OP01-002" as CardId;
    const manifest = await buildDevMatchCardManifestFromPoneglyphIds({
      cardIds: parseDevCardIdList("OP01-001\nOP01-002"),
      fetchCard: fetchFrom({
        "OP01-001": baseCard("OP01-001", "[On Play] Draw 1 card."),
        "OP01-002": baseCard("OP01-002", "unsupported text."),
      }),
      createdAt: "2026-05-25T00:00:00.000Z",
    });

    const supported = manifestCard(manifest.cards, op01001);
    const unsupported = manifestCard(manifest.cards, op01002);
    assert.equal(manifest.source, "poneglyph");
    assert.equal(supported.support.status, "implemented-dsl");
    assert.ok(supported.support.effectDefinitionId);
    assert.ok(
      manifest.effectDefinitions?.[supported.support.effectDefinitionId],
    );
    assert.equal(unsupported.support.status, "unsupported");
    assert.equal(unsupported.support.effectDefinitionId, undefined);
    assert.match(unsupported.support.notes ?? "", /parse failed/u);
  });
});

const manifestCard = (
  cards: Record<CardId, ResolvedCard>,
  cardId: CardId,
): ResolvedCard => {
  const card = cards[cardId];
  if (card === undefined) {
    throw new Error(`Missing manifest card ${String(cardId)}.`);
  }
  return card;
};
