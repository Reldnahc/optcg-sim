import type { Effect } from "@optcg/types";
import { describe, expect, it } from "vitest";

import { parseExpression } from "../expression-parser.js";
import { syntheticInstructionParser } from "../instructions/index.js";
import { syntheticInstructionSegmentParser } from "../segments/index.js";
import { parseAndConnector } from "./and.js";

describe("and connector parser", () => {
  it("splits and-composed expression text into ordered segments", () => {
    expect(parseAndConnector({ text: "A and B." })).toEqual({
      segments: ["A", "B."],
      connectors: ["always", "then"],
      evidence: ["connector:andOrdered"],
    });
  });

  it("treats inline and-then wording as one ordered connector", () => {
    expect(parseAndConnector({ text: "A and then B." })).toEqual({
      segments: ["A", "B."],
      connectors: ["always", "then"],
      evidence: ["connector:andOrdered"],
    });
  });

  it("treats comma-punctuated conditional continuation as one ordered connector", () => {
    expect(parseAndConnector({ text: "A and, if C, B." })).toEqual({
      segments: ["A", "if C, B."],
      connectors: ["always", "then"],
      evidence: ["connector:andOrdered"],
    });
  });

  it("does not parse text without an and connector", () => {
    expect(parseAndConnector({ text: "A." })).toBeUndefined();
  });

  it("keeps different-card-name filter wording inside the same segment", () => {
    expect(
      parseAndConnector({
        text: "Trash all of your Characters and play up to 5 {Five Elders} type Character cards with 5000 power and different card names from your trash.",
      }),
    ).toMatchObject({
      segments: [
        "Trash all of your Characters",
        "play up to 5 {Five Elders} type Character cards with 5000 power and different card names from your trash.",
      ],
    });
  });

  it("keeps Leader and Character effect source wording inside the same segment", () => {
    expect(
      parseAndConnector({
        text: "This Character cannot be rested by your opponent's Leader and Character effects and gains [Blocker].",
      }),
    ).toMatchObject({
      segments: [
        "This Character cannot be rested by your opponent's Leader and Character effects",
        "gains [Blocker].",
      ],
    });
  });

  it("keeps singular and plural DON state continuations inside the same segment", () => {
    expect(
      parseAndConnector({
        text: "Add up to 1 additional DON!! card and rest it.",
      }),
    ).toBeUndefined();
    expect(
      parseAndConnector({
        text: "Add up to 2 DON!! cards from your DON!! deck and set them as active.",
      }),
    ).toBeUndefined();
  });

  it("does not authorize support unless split segments parse independently", () => {
    expect(
      parseExpression("A and UNKNOWN.", {
        connectors: [parseAndConnector],
        segments: [
          syntheticInstructionSegmentParser([
            syntheticInstructionParser({
              text: "A",
              effect: { type: "custom", handler: "synthetic:A" },
              evidence: ["instruction:synthetic:A"],
            }),
          ]),
        ],
      }),
    ).toBeUndefined();
  });

  it("integrates with expression parsing without owning instruction text", () => {
    const effectA: Effect = { type: "custom", handler: "synthetic:A" };
    const effectB: Effect = { type: "custom", handler: "synthetic:B" };

    expect(
      parseExpression("A and B.", {
        connectors: [parseAndConnector],
        segments: [
          syntheticInstructionSegmentParser([
            syntheticInstructionParser({
              text: "A",
              effect: effectA,
              evidence: ["instruction:synthetic:A"],
            }),
            syntheticInstructionParser({
              text: "B.",
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
        "connector:andOrdered",
        "instruction:synthetic:B",
      ],
      rest: "",
    });
  });
});
