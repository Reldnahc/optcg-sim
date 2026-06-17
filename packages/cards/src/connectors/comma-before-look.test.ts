import type { Effect } from "@optcg/types";
import { describe, expect, it } from "vitest";

import { parseExpression } from "../expression-parser.js";
import { syntheticInstructionParser } from "../instructions/index.js";
import { syntheticInstructionSegmentParser } from "../segments/index.js";
import { parseCommaBeforeLookConnector } from "./comma-before-look.js";

describe("comma-before-look connector parser", () => {
  it("splits a completed instruction before a top-deck look segment", () => {
    expect(
      parseCommaBeforeLookConnector({
        text: "Add up to 1 DON!! card from your DON!! deck and rest it, look at 5 cards from the top of your deck.",
      }),
    ).toEqual({
      segments: [
        "Add up to 1 DON!! card from your DON!! deck and rest it",
        "look at 5 cards from the top of your deck.",
      ],
      connectors: ["always", "then"],
      evidence: ["connector:commaBeforeLook"],
    });
  });

  it("does not split unrelated comma text", () => {
    expect(
      parseCommaBeforeLookConnector({
        text: "Give up to 1 Character +1000 power, then draw 1 card.",
      }),
    ).toBeUndefined();
  });

  it("does not capture Then-comma look connectors owned by the Then parser", () => {
    expect(
      parseCommaBeforeLookConnector({
        text: "Draw 1 card. Then, look at 3 cards from the top of your deck.",
      }),
    ).toBeUndefined();
  });

  it("integrates with expression parsing without owning instruction text", () => {
    const effectA: Effect = { type: "custom", handler: "synthetic:A" };
    const effectB: Effect = { type: "custom", handler: "synthetic:B" };

    expect(
      parseExpression("A, look at B.", {
        connectors: [parseCommaBeforeLookConnector],
        segments: [
          syntheticInstructionSegmentParser([
            syntheticInstructionParser({
              text: "A",
              effect: effectA,
              evidence: ["instruction:synthetic:A"],
            }),
            syntheticInstructionParser({
              text: "look at B.",
              effect: effectB,
              evidence: ["instruction:synthetic:B"],
            }),
          ]),
        ],
      }),
    ).toEqual({
      effect: {
        type: "sequence",
        effects: [
          { connector: "always", effect: effectA },
          { connector: "then", effect: effectB },
        ],
      },
      evidence: [
        "expression:sequence",
        "instruction:synthetic:A",
        "connector:commaBeforeLook",
        "instruction:synthetic:B",
      ],
      rest: "",
    });
  });
});
