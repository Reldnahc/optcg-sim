import { describe, expect, it } from "vitest";

import {
  battleProtectionSourcePrimitive,
  effectsProtectionSourcePrimitive,
  opponentEffectsProtectionSourcePrimitive,
  parseProtectionSource,
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

  it("parses battle cause while leaving source filters for later layers", () => {
    expect(
      parseProtectionSource({ text: "in battle by <Slash> attribute cards." }),
    ).toEqual({
      source: {
        kind: "battle",
        controllerRelation: "eitherController",
      },
      evidence: ["protectionSource:battle"],
      rest: "by <Slash> attribute cards",
    });
  });
});
