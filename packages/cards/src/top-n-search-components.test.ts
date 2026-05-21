import { describe, expect, it } from "vitest";
import type { CardId, EffectId } from "@optcg/types";

import { parseCertifiedCardText } from "./certified-card-text-parser.js";
import { isCompleteGeneratedSupportParseResult } from "./generated-support-types.js";
import {
  parseTopNAnyCardAddToHandAndBottomRemainder,
  parseTopNBottomRemainder,
  parseTopNDeckLookPrefix,
  parseTopNFilteredRevealSelection,
  parseTopNSearchFilter,
} from "./top-n-search-components.js";

const cardId = "SUP-002G-PARSER" as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;

const parse = (sourceText: string) =>
  parseCertifiedCardText({
    cardId,
    effectDefinitionsVersion: "effects-sup-002g",
    rulesVersion: "rules-sup-002g",
    sourceText,
    sourceTextHash: "sha256:sup-002g-source",
  });

describe("SUP-002G top-N search parser components", () => {
  it("parses top-N search primitive boundaries independently", () => {
    expect(
      parseTopNDeckLookPrefix(
        "Look at 5 cards from the top of your deck; reveal up to 1 {Five Elders} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
      ),
    ).toEqual({
      bodyText:
        "reveal up to 1 {Five Elders} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
      lookCount: 5,
    });
    expect(parseTopNSearchFilter("green {East Blue} type card")).toEqual({
      filter: { colorsAny: ["green"], typesAny: ["East Blue"] },
    });
    expect(
      parseTopNSearchFilter("{East Blue} type card other than [Nami]"),
    ).toEqual({
      filter: { nameNot: ["Nami"], typesAny: ["East Blue"] },
    });
    expect(
      parseTopNFilteredRevealSelection(
        "reveal up to 1 {Five Elders} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
      ),
    ).toEqual({
      bodyText: "place the rest at the bottom of your deck in any order.",
      filter: { typesAny: ["Five Elders"] },
      revealTo: "bothPlayers",
    });
    expect(
      parseTopNAnyCardAddToHandAndBottomRemainder(
        "add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order.",
      ),
    ).toEqual({
      bodyText: "place the rest at the bottom of your deck in any order.",
    });
    expect(
      parseTopNBottomRemainder(
        "place the rest at the bottom of your deck in any order.",
      ),
    ).toEqual({
      bodyText: "place the rest at the bottom of your deck in any order.",
    });
  });

  it.each([{ lookCount: 3 }, { lookCount: 6 }])(
    "parses standalone top-N any-card chooser-only search with lookCount $lookCount",
    ({ lookCount }) => {
      const result = parse(
        `[On Play] Look at ${String(
          lookCount,
        )} cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order.`,
      );

      expect(result.status).toBe("complete");
      if (!isCompleteGeneratedSupportParseResult(result)) {
        throw new Error("Expected complete standalone any-card search parse.");
      }

      expect(result.parserRuleIds).toEqual([
        "exact:on-play:top-n-search:any-card:up-to-1:hand:bottom-owner-choice",
      ]);
      expect(result.effectDefinition.effects).toEqual([
        {
          category: "auto",
          effect: {
            request: {
              destination: "hand",
              filter: {},
              lookCount,
              max: 1,
              min: 0,
              player: "self",
              remainingCards: {
                destination: "deck",
                order: "ownerChoice",
                position: "bottom",
              },
              revealTo: "chooserOnly",
              shuffleAfter: false,
              zone: "deck",
            },
            type: "search",
          },
          id: toEffectId(
            `SUP-002G-PARSER:auto-on-play-top-${String(
              lookCount,
            )}-any-card-search-add-up-to-1`,
          ),
          sourcePresencePolicy: "mustRemainInSameZone",
          trigger: { type: "onPlay" },
        },
      ]);
    },
  );

  it.each([
    {
      expectedFilter: {
        typesAny: ["Five Elders"],
      },
      lookCount: 5,
      searchPhrase: "{Five Elders} type card",
    },
    {
      expectedFilter: {
        colorsAny: ["red"],
        typesAny: ["Straw Hat Crew"],
      },
      lookCount: 7,
      searchPhrase: "red {Straw Hat Crew} type card",
    },
    {
      expectedFilter: {
        nameNot: ["Trafalgar Law"],
        typesAny: ["Heart Pirates"],
      },
      lookCount: 4,
      searchPhrase: "{Heart Pirates} type card other than [Trafalgar Law]",
    },
    {
      expectedFilter: {
        colorsAny: ["blue"],
        nameNot: ["Trafalgar Law"],
        typesAny: ["Heart Pirates"],
      },
      lookCount: 6,
      searchPhrase: "blue {Heart Pirates} type card other than [Trafalgar Law]",
    },
  ])(
    "parses filtered top-N reveal search with $searchPhrase",
    ({ expectedFilter, lookCount, searchPhrase }) => {
      const result = parse(
        `[On Play] Look at ${String(
          lookCount,
        )} cards from the top of your deck; reveal up to 1 ${searchPhrase} and add it to your hand. Then, place the rest at the bottom of your deck in any order.`,
      );

      expect(result.status).toBe("complete");
      if (!isCompleteGeneratedSupportParseResult(result)) {
        throw new Error("Expected complete filtered search parse.");
      }

      expect(result.parserRuleIds).toEqual([
        "exact:on-play:top-n-search:filtered:reveal-up-to-1:hand:bottom-owner-choice",
      ]);
      expect(result.effectDefinition.effects).toEqual([
        {
          category: "auto",
          effect: {
            request: {
              destination: "hand",
              filter: expectedFilter,
              lookCount,
              max: 1,
              min: 0,
              player: "self",
              remainingCards: {
                destination: "deck",
                order: "ownerChoice",
                position: "bottom",
              },
              revealTo: "bothPlayers",
              shuffleAfter: false,
              zone: "deck",
            },
            type: "search",
          },
          id: toEffectId(
            `SUP-002G-PARSER:auto-on-play-top-${String(
              lookCount,
            )}-filtered-search-reveal-1`,
          ),
          sourcePresencePolicy: "mustRemainInSameZone",
          trigger: { type: "onPlay" },
        },
      ]);
    },
  );

  it.each([
    { donCount: 1, lookCount: 5, trashCount: 1 },
    { donCount: 2, lookCount: 4, trashCount: 2 },
  ])(
    "parses return-DON top-N any-card search then hand trash composition",
    ({ donCount, lookCount, trashCount }) => {
      const result = parse(
        `[On Play] DON!! \u2212${String(donCount)}: Look at ${String(
          lookCount,
        )} cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order, and trash ${String(
          trashCount,
        )} ${trashCount === 1 ? "card" : "cards"} from your hand.`,
      );

      expect(result.status).toBe("complete");
      if (!isCompleteGeneratedSupportParseResult(result)) {
        throw new Error("Expected complete non-reveal search composition.");
      }

      expect(result.parserRuleIds).toEqual([
        "component:cost:return-don:self:count-exact",
        "exact:on-play:top-n-search:any-card:up-to-1:hand:bottom-owner-choice",
        "exact:on-play:return-don-top-n-search:any-card:hand:bottom-owner-choice:trash-hand",
      ]);
      expect(result.effectDefinition.effects).toEqual([
        {
          category: "auto",
          cost: {
            chooser: "self",
            count: donCount,
            type: "returnDon",
          },
          effect: {
            effects: [
              {
                connector: "always",
                effect: {
                  request: {
                    destination: "hand",
                    filter: {},
                    lookCount,
                    max: 1,
                    min: 0,
                    player: "self",
                    remainingCards: {
                      destination: "deck",
                      order: "ownerChoice",
                      position: "bottom",
                    },
                    revealTo: "chooserOnly",
                    shuffleAfter: false,
                    zone: "deck",
                  },
                  type: "search",
                },
              },
              {
                connector: "then",
                effect: {
                  chooser: "self",
                  count: trashCount,
                  player: "self",
                  type: "trashFromHand",
                },
              },
            ],
            type: "sequence",
          },
          id: toEffectId(
            `SUP-002G-PARSER:auto-on-play-return-don-${String(
              donCount,
            )}-top-${String(lookCount)}-any-card-search-trash-${String(
              trashCount,
            )}`,
          ),
          sourcePresencePolicy: "mustRemainInSameZone",
          trigger: { type: "onPlay" },
        },
      ]);
    },
  );

  it.each([
    "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 purple Mink card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 purple {Mink} type card other than [Carrot] and add it to your hand. Then, place the rest at the top of your deck in any order.",
    "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 purple {Mink} type card other than [Carrot]. Then, place the rest at the bottom of your deck in any order.",
    "[On Play] Look at 5 cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the top of your deck in any order.",
    "[On Play] Look at 5 cards from the top of your deck and add up to 1 card to your trash. Then, place the rest at the bottom of your deck in any order.",
    "[On Play] DON!! -1: Look at 5 cards from the top of your deck and add up to 1 Character card to your hand. Then, place the rest at the bottom of your deck in any order, and trash 1 card from your hand.",
    "[On Play] DON!! -1: Look at 5 cards from the top of your deck and add up to 1 card to your trash. Then, place the rest at the bottom of your deck in any order, and trash 1 card from your hand.",
    "[On Play] DON!! -1: Look at 5 cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the top of your deck in any order, and trash 1 card from your hand.",
    "[On Play] DON!! -1: Look at 5 cards from the top of your deck and add up to 1 card to your hand. Then, place the rest at the bottom of your deck in any order, and draw 1 card.",
  ])("fails closed on unsupported top-N search wording (%s)", (sourceText) => {
    const result = parse(sourceText);

    expect(result.status).toBe("partial");
    expect(isCompleteGeneratedSupportParseResult(result)).toBe(false);
    expect(result).toMatchObject({
      blockers: [expect.objectContaining({ code: "unparsed-span" })],
    });
  });
});
