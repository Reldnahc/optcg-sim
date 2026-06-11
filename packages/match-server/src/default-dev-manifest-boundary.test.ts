import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { CardId, MatchId, PlayerId, VariantKey } from "@optcg/types";
import type { ReadyDeckSubmission } from "./deck-submission.js";

import {
  createDevDecklistFromSubmission,
  createDevDeckCardIds,
  createDevDeckVariantIndexes,
  createDevDonDeckCardIds,
  createDefaultDevMatchSetup,
  createDevRngSeed,
  createDevManifestCardIds,
  createDevPlayerSetupFromDecklist,
  defaultDevDonCounts,
  defaultDevEffectDefinitionsVersion,
  resolveDevDonCounts,
  validateReadyDevDeckSubmissions,
  validateDevDeckSubmissionVariants,
  validateAndAdaptDevDecklist,
  type DevDeckCardEntry,
} from "./default-dev-manifest.js";
import { createDefaultDevFixtureFetch } from "./default-dev-fixture-fetch.test-support.js";

const readySubmission = (
  leaderCardId: CardId,
  main: ReadonlyArray<{
    cardId: CardId;
    count: number;
    variantIndex?: number;
  }>,
  donDeckCount = 10,
): ReadyDeckSubmission => ({
  source: "deckHash",
  hash: "hash-value",
  status: "ready",
  decoded: {
    leader: { cardId: leaderCardId, count: 1 },
    main,
  },
  donDeckCount,
});

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
    assert.equal(source.includes("deck1.txt"), false);
    assert.equal(source.includes("deck2.txt"), false);
    assert.equal(source.includes("parseDevDecklistText"), false);
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
      createDevDeckVariantIndexes([
        { cardId: "OP13-080" as CardId, count: 2, variantIndex: 0 },
        { cardId: "OP13-080" as CardId, count: 1, variantIndex: 2 },
        { cardId: "OP13-091" as CardId, count: 1 },
      ]),
      [0, 0, 2, undefined],
    );
    assert.deepEqual(
      createDevManifestCardIds(
        {
          leader: { cardId: "OP13-079" as CardId, count: 1 },
          deckEntries: firstPlayerEntries,
          donDeckCount: 10,
        },
        {
          leader: { cardId: "OP13-079" as CardId, count: 1 },
          deckEntries: secondPlayerEntries,
          donDeckCount: 10,
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
      firstPlayer: 10,
      secondPlayer: 10,
    });
    assert.deepEqual(resolveDevDonCounts(defaultDevDonCounts), [10, 10]);
  });

  test("deck validation adapts submitted DON decks from leader construction rules", async () => {
    const adapted = await validateAndAdaptDevDecklist({
      decklist: createDevDecklistFromSubmission(
        readySubmission(
          "OP15-058" as CardId,
          [{ cardId: "OP13-080" as CardId, count: 50 }],
          10,
        ),
      ),
      cardManifest: {
        manifestHash: "manifest",
        source: "poneglyph",
        cardDataVersion: "cards",
        effectDefinitionsVersion: "effects",
        customHandlerVersion: "custom",
        banlistVersion: "banlist",
        createdAt: "2026-05-31T00:00:00.000Z",
        cards: {
          ["OP15-058" as CardId]: {
            cardId: "OP15-058" as CardId,
            language: "en",
            name: "OP15-058",
            category: "leader",
            set: "TEST",
            setName: "Test",
            released: true,
            colors: ["purple"],
            life: 5,
            attributes: [],
            types: [],
            effectText:
              "Under the rules of this game, your DON!! deck consists of 6 cards.",
            printedKeywords: [],
            variants: [],
            legality: {},
            officialFaq: [],
            errata: [],
            sourceTextHash: "source",
            behaviorHash: "behavior",
            support: {
              cardId: "OP15-058" as CardId,
              status: "implemented-dsl",
              tested: true,
              rulesVersion: "rules",
              cardDataVersion: "cards",
              sourceTextHash: "source",
              behaviorHash: "behavior",
            },
          },
          ["OP13-080" as CardId]: {
            cardId: "OP13-080" as CardId,
            language: "en",
            name: "OP13-080",
            category: "character",
            set: "TEST",
            setName: "Test",
            released: true,
            colors: ["black"],
            attributes: [],
            types: [],
            printedKeywords: [],
            variants: [],
            legality: {},
            officialFaq: [],
            errata: [],
            sourceTextHash: "source",
            behaviorHash: "behavior",
            support: {
              cardId: "OP13-080" as CardId,
              status: "vanilla-confirmed",
              tested: true,
              rulesVersion: "rules",
              cardDataVersion: "cards",
              sourceTextHash: "source",
              behaviorHash: "behavior",
            },
          },
          ...Object.fromEntries(
            createDevDonDeckCardIds(10).map((cardId) => [
              cardId,
              {
                cardId,
                language: "en",
                name: String(cardId),
                category: "don",
                set: "TEST",
                setName: "Test",
                released: true,
                colors: [],
                attributes: [],
                types: [],
                printedKeywords: [],
                variants: [],
                legality: {},
                officialFaq: [],
                errata: [],
                sourceTextHash: "source",
                behaviorHash: "behavior",
                support: {
                  cardId,
                  status: "vanilla-confirmed",
                  tested: true,
                  rulesVersion: "rules",
                  cardDataVersion: "cards",
                  sourceTextHash: "source",
                  behaviorHash: "behavior",
                },
              },
            ]),
          ),
        },
      },
    });

    assert.equal(adapted.donDeckCount, 6);
  });

  test("dev generated effect definition cache version invalidates parser-output changes", () => {
    assert.equal(defaultDevEffectDefinitionsVersion, "generated-dev-v10");
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

  test("creates dev decklists from ready deck hash submissions", () => {
    const decklist = createDevDecklistFromSubmission(
      readySubmission("OP13-079" as CardId, [
        { cardId: "OP13-080" as CardId, count: 4 },
        { cardId: "OP13-082" as CardId, count: 2, variantIndex: 1 },
      ]),
    );

    assert.equal(decklist.leader.cardId, "OP13-079");
    assert.equal(decklist.donDeckCount, 10);
    assert.deepEqual(decklist.deckEntries, [
      { cardId: "OP13-080", count: 4 },
      { cardId: "OP13-082", count: 2, variantIndex: 1 },
    ]);
    assert.deepEqual(createDevDeckCardIds(decklist.deckEntries), [
      "OP13-080",
      "OP13-080",
      "OP13-080",
      "OP13-080",
      "OP13-082",
      "OP13-082",
    ]);
  });

  test("batch validates ready deck submissions with one shared card fetch", async () => {
    const requests: string[][] = [];
    const fixtureFetch = createDefaultDevFixtureFetch();
    const fetchCard: ReturnType<typeof createDefaultDevFixtureFetch> = (
      url,
      init,
    ) => {
      const body = JSON.parse(init?.body ?? "{}") as {
        card_numbers?: string[];
      };
      requests.push(body.card_numbers ?? []);
      return fixtureFetch(url, init);
    };

    const results = await validateReadyDevDeckSubmissions({
      submissions: [
        readySubmission("OP13-079" as CardId, [
          { cardId: "OP13-080" as CardId, count: 50 },
        ]),
        readySubmission("OP13-079" as CardId, [
          { cardId: "OP13-080" as CardId, count: 50 },
        ]),
      ],
      createdAt: "2026-05-04T00:00:00.000Z",
      fetchCard,
    });

    assert.deepEqual(
      results.map((result) => result.valid),
      [true, true],
    );
    assert.equal(requests.length, 1);
    const [request] = requests;
    if (request === undefined) {
      throw new Error("Expected one batch card request.");
    }
    assert.equal(request.includes("OP13-079"), true);
    assert.equal(request.includes("OP13-080"), true);
  });

  test("creates the default dev setup without local deck hash files", async () => {
    const setup = await createDefaultDevMatchSetup({
      matchId: "default-dev-match" as MatchId,
      firstPlayerId: "p1" as PlayerId,
      playerOrder: ["p1" as PlayerId, "p2" as PlayerId],
      createdAt: "2026-05-04T00:00:00.000Z",
      fetchCard: createDefaultDevFixtureFetch(),
    });

    assert.equal(setup.matchId, "default-dev-match");
    const [firstPlayer, secondPlayer] = setup.players;
    assert.equal(firstPlayer.leaderCardId, "OP13-079");
    assert.equal(secondPlayer.leaderCardId, "OP13-079");
    assert.equal(firstPlayer.deckCardIds.length, 50);
    assert.equal(secondPlayer.deckCardIds.length, 50);
  });

  test("rejects non-ready deck submissions before setup creation", () => {
    assert.throws(
      () =>
        createDevDecklistFromSubmission({
          source: "deckHash",
          hash: "bad",
          status: "invalid",
          error: "bad hash",
          donDeckCount: 10,
        }),
      /ready deck submission/u,
    );
  });

  test("validates requested variant indexes against resolved card details", () => {
    validateDevDeckSubmissionVariants(
      createDevDecklistFromSubmission(
        readySubmission("OP13-079" as CardId, [
          { cardId: "OP13-080" as CardId, count: 1, variantIndex: 2 },
        ]),
      ),
      {
        cards: {
          ["OP13-079" as CardId]: {
            category: "leader",
            life: 5,
            variants: [
              { variantIndex: 0, variantKey: "OP13-079:v0" as VariantKey },
            ],
          },
          ["OP13-080" as CardId]: {
            category: "character",
            variants: [
              { variantIndex: 2, variantKey: "OP13-080:v2" as VariantKey },
            ],
          },
        },
      },
    );

    assert.throws(() => {
      validateDevDeckSubmissionVariants(
        createDevDecklistFromSubmission(
          readySubmission("OP13-079" as CardId, [
            { cardId: "OP13-080" as CardId, count: 1, variantIndex: 9 },
          ]),
        ),
        {
          cards: {
            ["OP13-079" as CardId]: {
              category: "leader",
              life: 5,
              variants: [
                {
                  variantIndex: 0,
                  variantKey: "OP13-079:v0" as VariantKey,
                },
              ],
            },
            ["OP13-080" as CardId]: {
              category: "character",
              variants: [
                {
                  variantIndex: 2,
                  variantKey: "OP13-080:v2" as VariantKey,
                },
              ],
            },
          },
        },
      );
    }, /variant 9 is not available for OP13-080/u);
  });

  test("derives player leader life count from the resolved leader metadata", () => {
    const setup = createDevPlayerSetupFromDecklist(
      "p1" as PlayerId,
      {
        leader: {
          cardId: "OP13-079" as CardId,
          count: 1,
          variantIndex: 1,
        },
        deckEntries: [
          { cardId: "OP13-080" as CardId, count: 1, variantIndex: 0 },
          { cardId: "OP13-080" as CardId, count: 1, variantIndex: 2 },
        ],
        donDeckCount: 10,
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
    assert.equal(setup.leaderVariantIndex, 1);
    assert.deepEqual(setup.deckVariantIndexes, [0, 2]);
  });

  test("rejects dev decklists whose leader metadata is missing life", () => {
    assert.throws(
      () =>
        createDevPlayerSetupFromDecklist(
          "p1" as PlayerId,
          {
            leader: { cardId: "OP13-079" as CardId, count: 1 },
            deckEntries: [],
            donDeckCount: 10,
          },
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
