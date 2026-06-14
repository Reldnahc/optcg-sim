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
  trigger: string | null = null,
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
  trigger,
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

  test("does not mark parsed DSL supported when executable runtime support rejects it", async () => {
    const cardId = "OP01-002" as CardId;
    const manifest = await buildDevMatchCardManifestFromPoneglyphIds({
      cardIds: [cardId],
      fetchCard: fetchFrom({
        "OP01-002": baseCard("OP01-002", "[Your Turn] Draw 1 card."),
      }),
      createdAt: "2026-05-25T00:00:00.000Z",
    });

    const card = manifestCard(manifest.cards, cardId);

    assert.equal(card.support.status, "unsupported");
    assert.equal(card.support.effectDefinitionId, undefined);
    assert.equal(Object.keys(manifest.effectDefinitions ?? {}).length, 0);
  });

  test("builds generated manifests for conditioned optional opponent DON attachment", async () => {
    const cardId = "OP01-003" as CardId;
    const line =
      "[On Play] If your Leader has the {East Blue} type, give up to 1 DON!! card from your opponent's cost area to 1 of your opponent's Characters.";
    const manifest = await buildDevMatchCardManifestFromPoneglyphIds({
      cardIds: [cardId],
      fetchCard: fetchFrom({
        "OP01-003": baseCard("OP01-003", line),
      }),
      createdAt: "2026-05-25T00:00:00.000Z",
    });

    const card = manifestCard(manifest.cards, cardId);

    assert.equal(card.support.status, "implemented-dsl");
    assert.ok(card.support.effectDefinitionId);
    assert.ok(manifest.effectDefinitions?.[card.support.effectDefinitionId]);
  });

  test("does not mark referenced trigger activation supported without a referenced effect", async () => {
    const cardId = "OP01-004" as CardId;
    const manifest = await buildDevMatchCardManifestFromPoneglyphIds({
      cardIds: [cardId],
      fetchCard: fetchFrom({
        "OP01-004": baseCard(
          "OP01-004",
          null,
          "[Trigger] Activate this card's [On K.O.] effect.",
        ),
      }),
      createdAt: "2026-05-25T00:00:00.000Z",
    });

    const card = manifestCard(manifest.cards, cardId);

    assert.equal(card.support.status, "unsupported");
    assert.equal(card.support.effectDefinitionId, undefined);
    assert.equal(Object.keys(manifest.effectDefinitions ?? {}).length, 0);
  });

  test("marks referenced trigger activation supported when the referenced effect exists", async () => {
    const cardId = "OP01-005" as CardId;
    const manifest = await buildDevMatchCardManifestFromPoneglyphIds({
      cardIds: [cardId],
      fetchCard: fetchFrom({
        "OP01-005": baseCard(
          "OP01-005",
          "[On K.O.] Draw 1 card.",
          "[Trigger] Activate this card's [On K.O.] effect.",
        ),
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
