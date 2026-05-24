import type { Condition, Effect, Trigger } from "@optcg/types";
import { describe, expect, it } from "vitest";

import { parseEffectLine } from "./orchestrator.js";
import type {
  ExpressionParseResult,
  EntryPointParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "./types.js";

function entryPointParserFor(
  expectedText: string,
  trigger: Trigger,
  evidence: readonly PrimitiveEvidence[],
  seen: string[],
) {
  return (input: ParseInput): EntryPointParseResult | undefined => {
    seen.push(input.text);
    if (!input.text.startsWith(expectedText)) {
      return undefined;
    }

    return {
      node: { type: "entryPoint", trigger },
      evidence,
      rest: input.text.slice(expectedText.length).trimStart(),
    };
  };
}

function expressionParserFor(
  expectedText: string,
  effect: Effect,
  evidence: readonly PrimitiveEvidence[],
  seen: string[],
) {
  return (input: ParseInput): ExpressionParseResult | undefined => {
    seen.push(input.text);
    if (input.text !== expectedText) {
      return undefined;
    }

    return {
      effect,
      evidence,
      rest: "",
    };
  };
}

describe("engine-shaped expression orchestration contract", () => {
  it("extracts only the entry point before handing the remaining expression to expression parsers", () => {
    const entryInputs: string[] = [];
    const expressionInputs: string[] = [];
    const effect: Effect = {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: { type: "custom", handler: "synthetic:A" },
        },
      ],
    };

    const result = parseEffectLine("[E] A.", {
      entryPoints: [
        entryPointParserFor(
          "[E]",
          { type: "onPlay" },
          ["entry:onPlay", "sourcePresence:mustRemain"],
          entryInputs,
        ),
      ],
      expressions: [
        expressionParserFor(
          "A.",
          effect,
          ["instruction:synthetic:A"],
          expressionInputs,
        ),
      ],
    });

    expect(entryInputs).toEqual(["[E] A."]);
    expect(expressionInputs).toEqual(["A."]);
    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect,
      },
      evidence: [
        "entry:onPlay",
        "sourcePresence:mustRemain",
        "instruction:synthetic:A",
        "composition:entryExpression",
      ],
    });
  });

  it("represents sequence and conditional segments as engine DSL expression nodes", () => {
    const condition: Condition = { type: "custom", check: "synthetic:C" };
    const effect: Effect = {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: { type: "custom", handler: "synthetic:A" },
        },
        {
          connector: "then",
          effect: {
            type: "conditional",
            if: condition,
            then: { type: "custom", handler: "synthetic:B" },
          },
        },
      ],
    };

    const result = parseEffectLine("[E] A. Then, if C, B.", {
      entryPoints: [
        entryPointParserFor(
          "[E]",
          { type: "onPlay" },
          ["entry:onPlay", "sourcePresence:mustRemain"],
          [],
        ),
      ],
      expressions: [
        expressionParserFor(
          "A. Then, if C, B.",
          effect,
          [
            "expression:sequence",
            "instruction:synthetic:A",
            "connector:then",
            "expression:conditional",
            "condition:synthetic:C",
            "instruction:synthetic:B",
          ],
          [],
        ),
      ],
    });

    expect(result?.block.effect).toEqual(effect);
    expect(result?.evidence).toEqual([
      "entry:onPlay",
      "sourcePresence:mustRemain",
      "expression:sequence",
      "instruction:synthetic:A",
      "connector:then",
      "expression:conditional",
      "condition:synthetic:C",
      "instruction:synthetic:B",
      "composition:entryExpression",
    ]);
  });

  it("fails closed when expression parsing leaves residue", () => {
    const result = parseEffectLine("[E] A. trailing", {
      entryPoints: [
        entryPointParserFor(
          "[E]",
          { type: "onPlay" },
          ["entry:onPlay", "sourcePresence:mustRemain"],
          [],
        ),
      ],
      expressions: [
        () => ({
          effect: { type: "custom", handler: "synthetic:A" },
          evidence: ["instruction:synthetic:A"],
          rest: "trailing",
        }),
      ],
    });

    expect(result).toBeUndefined();
  });

  it("recombines entry points and expressions without pair registration", () => {
    const expression: Effect = { type: "custom", handler: "synthetic:A" };
    const entryPoints = [
      entryPointParserFor(
        "[E1]",
        { type: "onPlay" },
        ["entry:onPlay", "sourcePresence:mustRemain"],
        [],
      ),
      entryPointParserFor(
        "[E2]",
        { type: "onKO" },
        ["entry:onKO", "sourcePresence:resolveFromDestination"],
        [],
      ),
    ];
    const expressions = [
      expressionParserFor("A.", expression, ["instruction:synthetic:A"], []),
    ];

    expect(
      parseEffectLine("[E1] A.", { entryPoints, expressions })?.block.trigger,
    ).toEqual({ type: "onPlay" });
    expect(
      parseEffectLine("[E2] A.", { entryPoints, expressions })?.block.trigger,
    ).toEqual({ type: "onKO" });
  });
});
