import type { Condition, Effect, EffectCategory, Trigger } from "@optcg/types";
import { describe, expect, it } from "vitest";

import { syntheticInstructionParser } from "../instructions/index.js";
import { parseEffectLine } from "../orchestrator.js";
import { syntheticInstructionSegmentParser } from "../segments/index.js";
import { parseExpression } from "../expression-parser.js";
import { parseSupportedEntryPoint } from "./supported.js";

const supportedEntryPointCases: readonly {
  readonly text: string;
  readonly trigger: Trigger;
  readonly category?: EffectCategory;
  readonly condition?: Condition;
  readonly evidence: readonly string[];
}[] = [
  {
    text: "[On Play]",
    trigger: { type: "onPlay" },
    evidence: ["entry:onPlay", "sourcePresence:mustRemain"],
  },
  {
    text: "[When Attacking]",
    trigger: { type: "whenAttacking" },
    evidence: ["entry:whenAttacking", "sourcePresence:mustRemain"],
  },
  {
    text: "[On K.O.]",
    trigger: { type: "onKO" },
    evidence: ["entry:onKO", "sourcePresence:resolveFromDestination"],
  },
  {
    text: "[Trigger]",
    trigger: { type: "trigger" },
    evidence: ["entry:lifeTrigger", "sourcePresence:noSourceRequired"],
  },
  {
    text: "[Main]",
    trigger: { type: "main" },
    evidence: ["entry:eventMain", "sourcePresence:resolveFromDestination"],
  },
  {
    text: "[Counter]",
    trigger: { type: "counter" },
    evidence: ["entry:eventCounter", "sourcePresence:resolveFromDestination"],
  },
  {
    text: "[Activate: Main]",
    trigger: { type: "activateMain" },
    category: "activate",
    evidence: ["entry:activateMain", "sourcePresence:mustRemain"],
  },
  {
    text: "[Your Turn]",
    trigger: { type: "permanent" },
    category: "permanent",
    condition: { type: "yourTurn" },
    evidence: [
      "entry:yourTurn",
      "condition:yourTurn",
      "sourcePresence:mustRemain",
    ],
  },
  {
    text: "[Opponent's Turn]",
    trigger: { type: "permanent" },
    category: "permanent",
    condition: { type: "opponentTurn" },
    evidence: [
      "entry:opponentTurn",
      "condition:opponentTurn",
      "sourcePresence:mustRemain",
    ],
  },
] as const;

describe("supported entry-point parser", () => {
  it.each(supportedEntryPointCases)(
    "parses $text as an isolated entry point",
    ({ text, trigger, category, condition, evidence }) => {
      expect(parseSupportedEntryPoint({ text })).toEqual({
        node: {
          type: "entryPoint",
          trigger,
          ...(category === undefined ? {} : { category }),
          ...(condition === undefined ? {} : { condition }),
        },
        evidence,
        rest: "",
      });
    },
  );

  it.each(supportedEntryPointCases)(
    "integrates $text with expression orchestration without parsing the expression",
    ({ text, trigger, category, condition, evidence }) => {
      const effect: Effect = { type: "custom", handler: "synthetic:A" };

      const result = parseEffectLine(`${text} A.`, {
        entryPoints: [parseSupportedEntryPoint],
        expressions: [
          (input) =>
            parseExpression(input.text, {
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
        ],
      });

      expect(result).toMatchObject({
        block: {
          category: category ?? "auto",
          trigger,
          ...(condition === undefined ? {} : { condition }),
          effect,
        },
        evidence: [
          ...evidence,
          "instruction:synthetic:A",
          "composition:entryExpression",
        ],
      });
    },
  );

  it("fails closed for unknown entry-point labels", () => {
    expect(parseSupportedEntryPoint({ text: "[Unknown]" })).toBeUndefined();
  });

  it.each([
    "[On Opponent's Attack] Draw 1 card.",
    "[On Opponent\u2019s Attack] Draw 1 card.",
  ])("fails closed for non-canonical opponent attack entry label %s", (text) => {
    expect(
      parseSupportedEntryPoint({ text }),
    ).toBeUndefined();
  });
});
