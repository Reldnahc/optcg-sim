import type { Effect } from "@optcg/types";
import { describe, expect, it } from "vitest";

import { parseExpression } from "../expression-parser.js";
import { syntheticInstructionParser } from "../instructions/index.js";
import { syntheticInstructionSegmentParser } from "../segments/index.js";
import { parseThenConnector } from "./then.js";

describe("Then connector parser", () => {
  it("splits Then-composed expression text into ordered segments", () => {
    expect(parseThenConnector({ text: "A. Then, B." })).toEqual({
      segments: ["A.", "B."],
      connectors: ["always", "then"],
      evidence: ["connector:then"],
    });
  });

  it("does not parse text without a Then connector", () => {
    expect(parseThenConnector({ text: "A." })).toBeUndefined();
  });

  it("integrates with expression parsing without owning instruction text", () => {
    const effectA: Effect = { type: "custom", handler: "synthetic:A" };
    const effectB: Effect = { type: "custom", handler: "synthetic:B" };

    expect(
      parseExpression("A. Then, B.", {
        connectors: [parseThenConnector],
        segments: [
          syntheticInstructionSegmentParser([
            syntheticInstructionParser({
              text: "A.",
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
        "connector:then",
        "instruction:synthetic:B",
      ],
      rest: "",
    });
  });
});
