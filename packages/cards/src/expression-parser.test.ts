import type { Condition, Effect } from "@optcg/types";
import { describe, expect, it } from "vitest";

import { parseSyntheticThenConnector } from "./connectors/index.js";
import { syntheticConditionParser } from "./conditions/index.js";
import { parseExpression } from "./expression-parser.js";
import { syntheticInstructionParser } from "./instructions/index.js";
import {
  syntheticConditionalSegmentParser,
  syntheticInstructionSegmentParser,
} from "./segments/index.js";

describe("expression parser framework", () => {
  it("parses one instruction through instruction parser dispatch", () => {
    const effect: Effect = { type: "custom", handler: "synthetic:A" };

    expect(
      parseExpression("A.", {
        connectors: [],
        segments: [
          syntheticInstructionSegmentParser([
            syntheticInstructionParser({
              text: "A.",
              effect,
              evidence: ["instruction:synthetic:A"],
            }),
          ]),
        ],
      }),
    ).toEqual({
      effect,
      evidence: ["instruction:synthetic:A"],
      rest: "",
    });
  });

  it("parses sequence segments and then-conditional segments into engine DSL", () => {
    const condition: Condition = { type: "custom", check: "synthetic:C" };
    const effectA: Effect = { type: "custom", handler: "synthetic:A" };
    const effectB: Effect = { type: "custom", handler: "synthetic:B" };

    const instructions = [
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
    ];
    const conditions = [
      syntheticConditionParser({
        text: "C",
        condition,
        evidence: ["condition:synthetic:C"],
      }),
    ];

    expect(
      parseExpression("A. Then, if C, B.", {
        connectors: [parseSyntheticThenConnector],
        segments: [
          syntheticConditionalSegmentParser({ conditions, instructions }),
          syntheticInstructionSegmentParser(instructions),
        ],
      }),
    ).toEqual({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: effectA,
          },
          {
            connector: "then",
            effect: {
              type: "conditional",
              if: condition,
              then: effectB,
            },
          },
        ],
      },
      evidence: [
        "expression:sequence",
        "instruction:synthetic:A",
        "connector:then",
        "expression:conditional",
        "condition:synthetic:C",
        "instruction:synthetic:B",
      ],
      rest: "",
    });
  });

  it("fails closed when a segment cannot be parsed", () => {
    expect(
      parseExpression("A. Then, UNKNOWN.", {
        connectors: [parseSyntheticThenConnector],
        segments: [
          syntheticInstructionSegmentParser([
            syntheticInstructionParser({
              text: "A.",
              effect: { type: "custom", handler: "synthetic:A" },
              evidence: ["instruction:synthetic:A"],
            }),
          ]),
        ],
      }),
    ).toBeUndefined();
  });

  it("does not own connector or conditional wording", () => {
    const parserSource = parseExpression.toString();

    expect(parserSource).not.toContain("Then,");
    expect(parserSource).not.toContain("?<condition>");
  });

  it("does not pass previous sequence text into later instruction parsers", () => {
    const seenB: string[] = [];

    parseExpression("A. Then, B.", {
      connectors: [parseSyntheticThenConnector],
      segments: [
        syntheticInstructionSegmentParser([
          syntheticInstructionParser({
            text: "A.",
            effect: { type: "custom", handler: "synthetic:A" },
            evidence: ["instruction:synthetic:A"],
          }),
          syntheticInstructionParser({
            text: "B.",
            effect: { type: "custom", handler: "synthetic:B" },
            evidence: ["instruction:synthetic:B"],
            seen: seenB,
          }),
        ]),
      ],
    });

    expect(seenB).toEqual(["B."]);
  });
});
