import { describe, expect, test } from "vitest";
import type {
  CardRef,
  EffectDefinition,
  EffectTextSourceMap,
  ResolvedCard,
} from "@optcg/types";

import {
  activeEffectTextPresentationForEffectBlock,
  activeEffectTextPresentationForFailedCondition,
  activeSpanIdsForChoice,
  activeSpanIdsForChoiceOptionIndex,
  activeSpanIdsForCost,
  activeSpanIdsForEffectPath,
  activeSpanIdsForSequenceIndex,
  activeSpanIdsWithoutCost,
} from "./runtime/effect-presentation.js";

describe("runtime effect presentation refs", () => {
  const source: CardRef = {
    instanceId: "source-instance" as CardRef["instanceId"],
    cardId: "OP00-001" as CardRef["cardId"],
    playerId: "p1" as CardRef["playerId"],
  };
  const resolvedCard = {
    cardId: source.cardId,
    language: "en",
    name: "Test Card",
    category: "character",
    set: "TEST",
    setName: "Test Set",
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
      cardId: source.cardId,
      status: "implemented-dsl",
      tested: true,
      rulesVersion: "rules",
      cardDataVersion: "cards",
      sourceTextHash: "source",
      behaviorHash: "behavior",
      effectDefinitionId: "definition",
    },
  } satisfies ResolvedCard;
  const effectBlock = {
    id: "effect:on-play" as EffectDefinition["effects"][number]["id"],
    category: "auto",
    trigger: { type: "onPlay" },
    sourcePresencePolicy: "mustRemainInSameZone",
    effect: { type: "draw", player: "self", count: 1 },
  } satisfies EffectDefinition["effects"][number];

  test("falls back to a no-highlight effect presentation when parser spans are unavailable", () => {
    expect(
      activeEffectTextPresentationForEffectBlock({
        effectBlock,
        resolvedCard,
        source,
      }),
    ).toEqual({
      source,
      textKind: "effect",
      activeSpanIds: [],
    });
  });

  test("falls back to no-highlight presentation when source map ids are stale", () => {
    expect(
      activeEffectTextPresentationForEffectBlock({
        effectBlock: {
          ...effectBlock,
          presentation: {
            textKind: "effect",
            spanIds: ["span:missing"],
          },
        },
        resolvedCard: {
          ...resolvedCard,
          effectTextSourceMap: {
            textKind: "effect",
            sourceText: "[On Play] Draw 1 card.",
            spans: [],
          },
        },
        source,
      }),
    ).toEqual({
      source,
      textKind: "effect",
      activeSpanIds: [],
    });
  });

  test("maps generated line-scoped presentation refs to field-local source map ids", () => {
    expect(
      activeEffectTextPresentationForEffectBlock({
        effectBlock: {
          ...effectBlock,
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: {
                  type: "revealTop",
                  player: "self",
                  zone: "deck",
                  count: 5,
                  saveAs: "set:presentation-search" as never,
                  visibility: "chooserOnly",
                },
              },
              {
                connector: "then",
                effect: {
                  type: "placeSetRemainder",
                  set: "set:presentation-search" as never,
                  owner: "self",
                  destination: "deck",
                  position: "bottom",
                  order: "chooser",
                },
              },
            ],
          },
          presentation: {
            textKind: "effect",
            spanIds: [
              "span:search:selection:line:1",
              "span:search:remaining:line:1",
            ],
          },
        },
        resolvedCard: {
          ...resolvedCard,
          effectTextSourceMap: {
            textKind: "effect",
            sourceText:
              "[On Play] Look at 5 cards from the top of your deck; reveal up to 1 {Sky Island} type card other than [Shura] and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
            spans: [
              {
                id: "span:search:selection",
                role: "body",
                start: 10,
                end: 145,
                text: "Look at 5 cards from the top of your deck; reveal up to 1 {Sky Island} type card other than [Shura] and add it to your hand.",
              },
              {
                id: "span:search:remaining",
                role: "body",
                start: 146,
                end: 206,
                text: "Then, place the rest at the bottom of your deck in any order.",
              },
            ],
          },
        },
        source,
      }),
    ).toEqual({
      source,
      textKind: "effect",
      activeSpanIds: ["span:search:selection", "span:search:remaining"],
    });
  });

  test("resolves sequence effect paths to parser span ids", () => {
    const sourceMap: EffectTextSourceMap = {
      textKind: "effect",
      sourceText: "[On Play] Draw 1 card. Then, K.O. up to 1 Character.",
      spans: [
        {
          id: "span:sequence:1:body",
          role: "body",
          start: 35,
          end: 64,
          text: "K.O. up to 1 Character.",
          effectPath: ["effect", "sequence"],
          sequenceIndex: 1,
        },
      ],
    };

    const ids = activeSpanIdsForEffectPath({
      sourceMap,
      effectPath: ["effect", "sequence"],
      sequenceIndex: 1,
    });

    expect(ids).toEqual(["span:sequence:1:body"]);
  });

  test("resolves failed condition presentation to condition parser span ids", () => {
    expect(
      activeEffectTextPresentationForFailedCondition({
        effectBlock: {
          ...effectBlock,
          condition: {
            type: "trashCount",
            player: "self",
            op: "gte",
            value: 7,
          },
          presentation: {
            textKind: "effect",
            spanIds: ["span:body"],
          },
        },
        resolvedCard: {
          ...resolvedCard,
          effectTextSourceMap: {
            textKind: "effect",
            sourceText:
              "[On Play] If you have 7 or more cards in your trash, draw 1 card.",
            spans: [
              {
                id: "span:condition",
                role: "condition",
                start: 13,
                end: 56,
                text: "you have 7 or more cards in your trash",
              },
              {
                id: "span:body",
                role: "body",
                start: 58,
                end: 70,
                text: "draw 1 card.",
              },
            ],
          },
        },
        source,
      }),
    ).toEqual({
      source,
      textKind: "effect",
      activeSpanIds: ["span:condition"],
    });
  });

  test("narrows active span ids by shared presentation phases", () => {
    const ids = [
      "span:cost:optional",
      "span:choice",
      "span:choice:1:option",
      "span:choice:1:body",
      "span:sequence:1:body",
      "span:sequence:2:body",
    ] as const;

    expect(activeSpanIdsForCost(ids)).toEqual(["span:cost:optional"]);
    expect(activeSpanIdsForChoice(ids)).toEqual(["span:choice"]);
    expect(activeSpanIdsForChoiceOptionIndex(ids, 1)).toEqual([
      "span:choice:1:body",
    ]);
    expect(activeSpanIdsWithoutCost(ids)).toEqual([
      "span:choice",
      "span:choice:1:option",
      "span:choice:1:body",
      "span:sequence:1:body",
      "span:sequence:2:body",
    ]);
    expect(activeSpanIdsForSequenceIndex(ids, 1)).toEqual([
      "span:sequence:1:body",
    ]);
    expect(activeSpanIdsForSequenceIndex(ids, 2)).toEqual([
      "span:sequence:2:body",
    ]);
    expect(activeSpanIdsForSequenceIndex(ids, 0)).toBeUndefined();
  });
});
