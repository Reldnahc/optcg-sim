import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { CardId, PoneglyphCardDetail, ResolvedCard } from "@optcg/types";

import {
  buildDevMatchCardManifestFromPoneglyphIds,
  type DevPoneglyphFetch,
} from "./index.js";

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
  (url, init) => {
    assert.equal(url.endsWith("/v1/cards/batch"), true);
    assert.equal(init?.method, "POST");
    const body = JSON.parse(init.body ?? "{}") as {
      card_numbers?: string[];
    };
    const data: Record<string, PoneglyphCardDetail> = {};
    const missing: string[] = [];
    for (const cardId of body.card_numbers ?? []) {
      const card = cards[cardId];
      if (card === undefined) {
        missing.push(cardId);
      } else {
        data[cardId] = card;
      }
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data, missing }),
    });
  };

describe("engine-backed card support package", () => {
  test("builds generated manifests with engine runtime support evaluation", async () => {
    const cardId = "OP01-001" as CardId;
    const manifest = await buildDevMatchCardManifestFromPoneglyphIds({
      cardIds: [cardId],
      fetchCard: fetchFrom({
        "OP01-001": baseCard("OP01-001", "[On Play] Draw 1 card."),
      }),
      createdAt: "2026-05-25T00:00:00.000Z",
    });

    const card = manifestCard(manifest.cards, cardId);

    assert.equal(card.support.status, "implemented-dsl");
    assert.ok(card.support.effectDefinitionId);
    assert.ok(manifest.effectDefinitions?.[card.support.effectDefinitionId]);
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
