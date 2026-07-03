import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type {
  CardId,
  EffectTextSpanId,
  PoneglyphCardDetail,
} from "@optcg/types";
import { evaluateEffectBlockRuntimeSupport } from "@optcg/engine-core";

import {
  createManifestSpotlightReport,
  createSpotlightProbeReport,
} from "./spotlight-probe-report.js";
import { buildDevMatchCardManifestFromPoneglyphIds } from "./runtime-supported-cards.js";

const baseCard = (
  cardNumber: string,
  effect: string | null,
  cardType = "Character",
): PoneglyphCardDetail => ({
  card_number: cardNumber,
  name: cardNumber,
  language: "en",
  set: "DEV",
  set_name: "Dev Set",
  released_at: null,
  released: true,
  card_type: cardType,
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

interface RepresentativeSpotlightCase {
  readonly cardId: CardId;
  readonly cardType: string;
  readonly effect: string;
  readonly bodyFragments: readonly string[];
}

const representativeSpotlightCases = [
  {
    cardId: "OP99-101" as CardId,
    cardType: "Event",
    effect:
      "[Counter] Up to 1 of your Leader or Character cards gains +2000 power during this battle. Then, if you have 2 or less Life cards, that card gains an additional +2000 power.",
    bodyFragments: ["that card gains an additional +2000 power"],
  },
  {
    cardId: "OP99-102" as CardId,
    cardType: "Character",
    effect:
      "[On Play] Choose 2 cards from your opponent's hand; your opponent reveals those cards.",
    bodyFragments: ["Choose 2 cards from your opponent's hand"],
  },
  {
    cardId: "OP99-103" as CardId,
    cardType: "Leader",
    effect:
      "When this Leader attacks or is attacked, you may trash any number of Event or Stage cards from your hand. This Leader gains +1000 power during this battle for every card trashed.",
    bodyFragments: ["This Leader gains +1000 power"],
  },
  {
    cardId: "OP99-104" as CardId,
    cardType: "Character",
    effect:
      "When you deal damage to your opponent's Life, you may trash 3 cards from the top of your deck. If you do, trash this Character.",
    bodyFragments: ["If you do, trash this Character"],
  },
  {
    cardId: "OP99-105" as CardId,
    cardType: "Leader",
    effect:
      "[DON!! x1] [When Attacking] If you have a total of 4 or less cards in your Life area and hand, draw 1 card. If you have a Character with a cost of 8 or more, you may add up to 1 card from the top of your deck to the top of your Life cards instead of drawing 1 card.",
    bodyFragments: ["instead of drawing 1 card"],
  },
  {
    cardId: "OP99-106" as CardId,
    cardType: "Event",
    effect:
      "[Main] Choose up to 1 of your opponent's Characters with a cost of 4 or less and K.O. it. If you have 15 or more cards in your trash, choose up to 1 of your opponent's Characters with a cost of 6 or less instead of a Character with a cost of 4 or less.",
    bodyFragments: ["instead of a Character with a cost of 4 or less"],
  },
  {
    cardId: "OP99-107" as CardId,
    cardType: "Event",
    effect:
      "[Main]/[Counter] You may trash any number of Event or Stage cards from your hand. Up to 1 of your Leader or Character cards gains +1000 power during this battle for every card trashed.",
    bodyFragments: ["for every card trashed"],
  },
  {
    cardId: "OP99-108" as CardId,
    cardType: "Character",
    effect:
      "[On Play] You may play 1 [Kotori] from your hand: Add up to 1 of your opponent's Characters with a cost of 3 or less to the top or bottom of your opponent's Life cards face-up.",
    bodyFragments: ["top or bottom of your opponent's Life cards face-up"],
  },
  {
    cardId: "OP99-109" as CardId,
    cardType: "Character",
    effect:
      "[On Play] If your Leader's type includes \"Whitebeard Pirates\" and you have 2 or less Life cards, select all of your opponent's Characters on their field. Until the end of your opponent's next turn, none of the selected Characters can attack unless your opponent trashes 2 cards from their hand whenever they attack.",
    bodyFragments: ["none of the selected Characters can attack"],
  },
  {
    cardId: "OP99-110" as CardId,
    cardType: "Event",
    effect:
      "[Counter] Trash 1 card from the top of your deck. If the trashed card has a cost of 6 or more, up to 1 of your Leader or Character cards gains +5000 power during this battle.",
    bodyFragments: ["If the trashed card has a cost of 6 or more"],
  },
  {
    cardId: "OP99-111" as CardId,
    cardType: "Event",
    effect:
      "[On Play] Place 1 of your opponent's Characters with a cost of 3 or less at the top or bottom of your opponent's Life cards face-up: Your opponent trashes 1 card from their hand.",
    bodyFragments: ["Your opponent trashes 1 card from their hand"],
  },
  {
    cardId: "OP99-112" as CardId,
    cardType: "Leader",
    effect:
      "[DON!! x3] [Activate: Main] [Once Per Turn] If this Leader battles your opponent's Character during this turn, set this Leader as active. Then, this Leader cannot attack your opponent's Characters with a base cost of 7 or less during this turn.",
    bodyFragments: ["set this Leader as active"],
  },
  {
    cardId: "OP99-113" as CardId,
    cardType: "Leader",
    effect:
      "[Activate: Main] [Once Per Turn] Select 2 of your {Supernovas} or {Heart Pirates} type Characters. Swap the base power of the selected Characters with each other during this turn.",
    bodyFragments: ["Swap the base power of the selected Characters"],
  },
  {
    cardId: "OP99-114" as CardId,
    cardType: "Character",
    effect:
      "[Your Turn] When this Character becomes rested, you may add 1 card from the top of your Life cards to your hand. If you do, up to 1 of your opponent's rested Characters or Stages will not become active in your opponent's next Refresh Phase.",
    bodyFragments: ["will not become active"],
  },
  {
    cardId: "OP99-115" as CardId,
    cardType: "Leader",
    effect:
      "[When Attacking]/[On Your Opponent's Attack] You may trash any number of Event or Stage cards from your hand. This Leader gains +1000 power during this battle for every card trashed.",
    bodyFragments: ["for every card trashed"],
  },
  {
    cardId: "OP99-116" as CardId,
    cardType: "Character",
    effect:
      "[On Play] If your Leader has the {Straw Hat Crew} type, play up to 1 {Straw Hat Crew} type Character with a cost of 7 or less from your trash. The Character played with this effect gains [Rush] during this turn.",
    bodyFragments: ["The Character played with this effect gains [Rush]"],
  },
  {
    cardId: "OP99-117" as CardId,
    cardType: "Character",
    effect: [
      "Apply each of the following effects based on the number of cards in your trash:",
      "- If there are 10 or more cards, this Character's base power becomes 9000 and it gains +10 cost.",
      "- If you have 20 or more cards, during your opponent's turn, your Leader's base power becomes 7000.",
      "- If you have 30 or more cards, this Character gains +1000 power.",
    ].join("\n"),
    bodyFragments: ["Apply each of the following effects"],
  },
] satisfies readonly RepresentativeSpotlightCase[];

describe("spotlight probe report", () => {
  test("generated definitions keep body spotlight spans for primitive gap families", async () => {
    const cards = Object.fromEntries(
      representativeSpotlightCases.map((item) => [
        item.cardId,
        baseCard(item.cardId, item.effect, item.cardType),
      ]),
    );
    const manifest = await buildDevMatchCardManifestFromPoneglyphIds({
      cardIds: representativeSpotlightCases.map((item) => item.cardId),
      fetchCard: (url, init) => {
        assert.equal(url.endsWith("/v1/cards/batch"), true);
        assert.equal(init?.method, "POST");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: cards, missing: [] }),
        });
      },
    });

    for (const item of representativeSpotlightCases) {
      const resolved = required(manifest.cards[item.cardId], item.cardId);
      const sourceMap = required(
        resolved.effectTextSourceMap,
        `${item.cardId} source map`,
      );
      const sourceSpans = sourceMap.spans;
      assertUnique(
        sourceSpans.map((span) => span.id),
        item.cardId,
      );
      const sourceSpansById = new Map(
        sourceSpans.map((span) => [span.id, span] as const),
      );
      const definitions = Object.values(
        manifest.effectDefinitions ?? {},
      ).filter((definition) => definition.cardId === item.cardId);
      assert.equal(
        definitions.length > 0,
        true,
        `${item.cardId} should generate effect definitions`,
      );

      for (const definition of definitions) {
        for (const block of definition.effects) {
          const support = evaluateEffectBlockRuntimeSupport(block, {
            siblingBlocks: definition.effects,
          });
          if (!support.supported) {
            continue;
          }
          const presentation = required(
            block.presentation,
            `${item.cardId} ${String(block.id)} presentation`,
          );
          assertUnique(
            presentation.spanIds,
            `${item.cardId} ${String(block.id)}`,
          );
          const activeSpans = presentation.spanIds.map((spanId) =>
            required(
              sourceSpansById.get(spanId),
              `${item.cardId} missing source span ${spanId}`,
            ),
          );
          const activeBodyText = activeSpans
            .filter((span) => span.role === "body")
            .map((span) => span.text)
            .join("\n");
          assert.equal(
            item.bodyFragments.some((fragment) =>
              activeBodyText.includes(fragment),
            ),
            true,
            `${item.cardId} ${String(block.id)} body spotlight text: ${activeBodyText}`,
          );
        }
      }
    }
  });

  test("reports set-level spotlight readiness for runtime-supported cards", async () => {
    const report = await createSpotlightProbeReport({
      setCode: "OP99",
      fetchCard: (url, init) => {
        const href = String(url);
        if (href.includes("/v1/search")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                data: [
                  { card_number: "OP99-001" },
                  { card_number: "OP99-002" },
                ],
                pagination: { has_more: false },
              }),
          });
        }
        assert.equal(href.endsWith("/v1/cards/batch"), true);
        assert.equal(init?.method, "POST");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                "OP99-001": baseCard("OP99-001", "[On Play] Draw 1 card."),
                "OP99-002": baseCard(
                  "OP99-002",
                  "[When Attacking] Select up to 1 of your opponent's Characters. This Character's base power becomes the same as the selected Character's power during this turn.",
                ),
              },
              missing: [],
            }),
        });
      },
    });

    assert.equal(report.exitCode, 0);
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.lines, [
      "Set: OP99",
      "Cards: 2",
      "Runtime-supported cards: 2",
      "Runtime-supported effect blocks: 2",
      "Spotlight-ready effect blocks: 2",
      "Failures: none",
    ]);
  });

  test("fails runtime-supported blocks whose presentation has no body source span", async () => {
    const cardId = "OP99-120" as CardId;
    const manifest = await buildDevMatchCardManifestFromPoneglyphIds({
      cardIds: [cardId],
      fetchCard: (url, init) => {
        assert.equal(url.endsWith("/v1/cards/batch"), true);
        assert.equal(init?.method, "POST");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                [cardId]: baseCard(cardId, "[On Play] Draw 1 card."),
              },
              missing: [],
            }),
        });
      },
    });
    const definition = required(
      Object.values(manifest.effectDefinitions ?? {}).find(
        (candidate) => candidate.cardId === cardId,
      ),
      "draw definition",
    );
    const block = required(definition.effects[0], "draw block");
    const presentation = required(block.presentation, "draw presentation");
    const card = required(manifest.cards[cardId], "draw card");
    const sourceMap = required(card.effectTextSourceMap, "draw source map");
    const presentationSpanIds = new Set(presentation.spanIds);
    const malformedManifest = {
      ...manifest,
      cards: {
        ...manifest.cards,
        [cardId]: {
          ...card,
          effectTextSourceMap: {
            ...sourceMap,
            spans: sourceMap.spans.map((span) =>
              presentationSpanIds.has(span.id)
                ? { ...span, role: "marker" as const }
                : span,
            ),
          },
        },
      },
    };

    const report = createManifestSpotlightReport({
      label: "Card: OP99-120",
      cardIds: [cardId],
      manifest: malformedManifest,
    });

    assert.equal(report.exitCode, 1);
    assert.deepEqual(report.lines.slice(-2), [
      "Failures: 1 effect block",
      `- ${cardId} ${String(block.id)} missing-body-span [${presentation.spanIds
        .map(String)
        .join(", ")}]`,
    ]);
  });

  test("accepts nested supported sequence spotlight spans", async () => {
    const report = await createSpotlightProbeReport({
      cardId: "OP99-201",
      fetchCard: (url, init) => {
        assert.equal(String(url).endsWith("/v1/cards/batch"), true);
        assert.equal(init?.method, "POST");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                "OP99-201": baseCard(
                  "OP99-201",
                  "[Main] Your Leader gains +3000 power during this turn and give up to 1 of your opponent's Characters -8000 power until the end of your opponent's next End Phase. Then, you may trash 2 cards from your hand. If you do, K.O. up to 1 of your opponent's Characters with 0 power or less.",
                  "Event",
                ),
              },
              missing: [],
            }),
        });
      },
    });

    assert.equal(report.exitCode, 0);
    assert.deepEqual(report.errors, []);
    assert.equal(report.lines[0], "Card: OP99-201");
    assert.equal(report.lines.at(-1), "Failures: none");
  });

  test("accepts line-scoped presentations against field-local effect and trigger source maps", async () => {
    const report = await createSpotlightProbeReport({
      cardId: "OP99-202",
      fetchCard: (url, init) => {
        assert.equal(String(url).endsWith("/v1/cards/batch"), true);
        assert.equal(init?.method, "POST");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                "OP99-202": {
                  ...baseCard(
                    "OP99-202",
                    "[Main] Draw 1 card and your Leader gains +1000 power until the end of your opponent's next End Phase.",
                    "Event",
                  ),
                  trigger:
                    "[Trigger] Give up to 1 of your opponent's Characters -4000 power during this turn.",
                },
              },
              missing: [],
            }),
        });
      },
    });

    assert.equal(report.exitCode, 0);
    assert.deepEqual(report.errors, []);
    assert.equal(report.lines[0], "Card: OP99-202");
    assert.equal(report.lines.at(-1), "Failures: none");
  });

  test("fails closed when a set probe resolves no cards", async () => {
    const report = await createSpotlightProbeReport({
      setCode: "OP00",
      fetchCard: (url) => {
        const href = String(url);
        assert.equal(href.includes("/v1/search"), true);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: [],
              pagination: { has_more: false },
            }),
        });
      },
    });

    assert.equal(report.exitCode, 1);
    assert.deepEqual(report.lines, []);
    assert.deepEqual(report.errors, [
      "Poneglyph set catalog fetch returned no cards for OP00",
    ]);
  });

  test("probes multiple sets as one spotlight manifest", async () => {
    const report = await createSpotlightProbeReport({
      setCodes: ["op99", "op98"],
      fetchCard: (url, init) => {
        const href = String(url);
        if (href.includes("/v1/search")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                data: [
                  { card_number: "OP99-001" },
                  { card_number: "OP98-001" },
                ],
                pagination: { has_more: false },
              }),
          });
        }
        assert.equal(href.endsWith("/v1/cards/batch"), true);
        assert.equal(init?.method, "POST");
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              data: {
                "OP99-001": baseCard("OP99-001", "[On Play] Draw 1 card."),
                "OP98-001": baseCard("OP98-001", "[On Play] Draw 1 card."),
              },
              missing: [],
            }),
        });
      },
    });

    assert.equal(report.exitCode, 0);
    assert.deepEqual(report.errors, []);
    assert.equal(report.lines[0], "Sets: OP99, OP98");
    assert.equal(report.lines[1], "Cards: 2");
    assert.equal(report.lines.at(-1), "Failures: none");
  });

  test("reports manifest build exceptions as structured errors", async () => {
    const report = await createSpotlightProbeReport({
      setCode: "OP99",
      fetchCard: (url, init) => {
        const href = String(url);
        if (href.includes("/v1/search")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                data: [{ card_number: "OP99-001" }],
                pagination: { has_more: false },
              }),
          });
        }
        assert.equal(href.endsWith("/v1/cards/batch"), true);
        assert.equal(init?.method, "POST");
        return Promise.reject(new Error("batch unavailable"));
      },
    });

    assert.equal(report.exitCode, 1);
    assert.deepEqual(report.lines, []);
    assert.deepEqual(report.errors, [
      "Spotlight probe manifest build failed: batch unavailable",
    ]);
  });
});

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Expected ${label}`);
  }
  return value;
}

function assertUnique(
  spanIds: readonly EffectTextSpanId[],
  label: string,
): void {
  assert.equal(new Set(spanIds).size, spanIds.length, `${label} span ids`);
}
