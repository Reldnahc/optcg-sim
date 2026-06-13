import { describe, expect, it } from "vitest";

import {
  battleProtectionSourcePrimitive,
  effectsProtectionSourcePrimitive,
  opponentCardCategoryEffectsProtectionSourcePrimitive,
  opponentEffectsProtectionSourcePrimitive,
  parseProtectionSource,
  selfEffectsProtectionSourcePrimitive,
} from "./source.js";

describe("protection source parser", () => {
  it("defines source/cause as primitive parents separate from protection process", () => {
    expect(opponentEffectsProtectionSourcePrimitive).toMatchObject({
      primitiveId: "protectionSource:opponentEffects",
      matches: [
        {
          id: "by-your-opponents-effects",
        },
      ],
    });
    expect(effectsProtectionSourcePrimitive).toMatchObject({
      primitiveId: "protectionSource:effects",
    });
    expect(selfEffectsProtectionSourcePrimitive).toMatchObject({
      primitiveId: "protectionSource:selfEffects",
    });
    expect(opponentCardCategoryEffectsProtectionSourcePrimitive).toMatchObject({
      primitiveId: "protectionSource:opponentCardCategoryEffects",
      matches: [
        {
          id: "by-your-opponents-card-category-effects",
        },
      ],
    });
    expect(battleProtectionSourcePrimitive).toMatchObject({
      primitiveId: "protectionSource:battle",
    });
  });

  it("parses opponent effects source", () => {
    expect(
      parseProtectionSource({ text: "by your opponent's effects." }),
    ).toEqual({
      source: {
        kind: "cardEffect",
        controllerRelation: "opponentControlled",
      },
      evidence: ["protectionSource:opponentEffects"],
      rest: "",
    });
  });

  it("parses opponent Leader and Character effect source categories", () => {
    expect(
      parseProtectionSource({
        text: "by your opponent's Leader and Character effects.",
      }),
    ).toEqual({
      source: {
        kind: "cardEffect",
        controllerRelation: "opponentControlled",
        cardCategories: ["leader", "character"],
      },
      evidence: [
        "protectionSource:opponentCardCategoryEffects",
        "sourceCategory:leader",
        "sourceCategory:character",
      ],
      rest: "",
    });
  });

  it("parses opponent card effect source categories without binding to one pair", () => {
    expect(
      parseProtectionSource({
        text: "by your opponent's Stage and Event effects.",
      }),
    ).toEqual({
      source: {
        kind: "cardEffect",
        controllerRelation: "opponentControlled",
        cardCategories: ["stage", "event"],
      },
      evidence: [
        "protectionSource:opponentCardCategoryEffects",
        "sourceCategory:stage",
        "sourceCategory:event",
      ],
      rest: "",
    });
  });

  it("parses any effects source", () => {
    expect(parseProtectionSource({ text: "by effects." })).toEqual({
      source: {
        kind: "cardEffect",
        controllerRelation: "eitherController",
      },
      evidence: ["protectionSource:effects"],
      rest: "",
    });
  });

  it("parses self effects source", () => {
    expect(parseProtectionSource({ text: "by your effects." })).toEqual({
      source: {
        kind: "cardEffect",
        controllerRelation: "selfControlled",
      },
      evidence: ["protectionSource:selfEffects"],
      rest: "",
    });
  });

  it("parses battle cause with reusable source card filters", () => {
    expect(
      parseProtectionSource({ text: "in battle by <Slash> attribute cards." }),
    ).toEqual({
      source: {
        kind: "battle",
        controllerRelation: "eitherController",
        cardFilter: { attributesAny: ["slash"] },
      },
      evidence: ["protectionSource:battle", "filter:attribute", "filter:any"],
      rest: "",
    });
  });

  it("parses effect cause with reusable negative source card filters", () => {
    expect(
      parseProtectionSource({
        text: "by effects of Characters without the <Special> attribute.",
      }),
    ).toEqual({
      source: {
        kind: "cardEffect",
        controllerRelation: "eitherController",
        cardFilter: {
          categories: ["character"],
          attributesNotAny: ["special"],
        },
        cardCategories: ["character"],
      },
      evidence: [
        "protectionSource:cardFilterEffects",
        "filter:category:character",
        "filter:attribute",
        "filter:negated",
      ],
      rest: "",
    });
  });
});
