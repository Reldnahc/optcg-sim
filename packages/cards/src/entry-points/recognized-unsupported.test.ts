import type { Effect } from "@optcg/types";
import { describe, expect, it } from "vitest";

import { parseExpression } from "../expression-parser.js";
import { syntheticInstructionParser } from "../instructions/index.js";
import { parseEffectLine } from "../orchestrator.js";
import {
  entryPointDefinitions,
  recognizedUnsupportedEntryPoints,
  supportedEntryPoints,
} from "../entry-point-definitions.js";
import { syntheticInstructionSegmentParser } from "../segments/index.js";
import { parseRecognizedUnsupportedEntryPoint } from "./recognized-unsupported.js";
import { parseSupportedEntryPoint } from "./supported.js";

const recognizedUnsupportedEntryPointCases = [
  {
    text: "[On Block]",
    trigger: { type: "onBlock" },
    evidence: ["entry:onBlock", "entrySupport:unsupported"],
  },
] as const;

describe("recognized unsupported entry-point parser", () => {
  it("derives recognized unsupported entries from the shared entry-point registry", () => {
    expect(entryPointDefinitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          supportStatus: "recognizedUnsupported",
          text: "[On Block]",
        }),
      ]),
    );
    expect(recognizedUnsupportedEntryPoints.map((entry) => entry.text)).toEqual(
      ["[On Block]"],
    );
    expect(supportedEntryPoints.map((entry) => entry.text)).not.toContain(
      "[On Block]",
    );
  });

  it.each(recognizedUnsupportedEntryPointCases)(
    "recognizes $text without marking it supported",
    ({ text, trigger, evidence }) => {
      expect(parseRecognizedUnsupportedEntryPoint({ text })).toEqual({
        node: { type: "entryPoint", trigger },
        evidence,
        rest: "",
      });
      expect(parseSupportedEntryPoint({ text })).toBeUndefined();
    },
  );

  it.each(recognizedUnsupportedEntryPointCases)(
    "integrates $text through orchestration as recognized unsupported",
    ({ text, trigger, evidence }) => {
      const effect: Effect = { type: "custom", handler: "synthetic:A" };

      const result = parseEffectLine(`${text} A.`, {
        entryPoints: [parseRecognizedUnsupportedEntryPoint],
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
          category: "auto",
          trigger,
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
});
