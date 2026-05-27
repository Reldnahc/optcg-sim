import type { Effect } from "@optcg/types";
import { describe, expect, it } from "vitest";

import { parseSupportedEntryPoint } from "../entry-points/index.js";
import { parseExpression } from "../expression-parser.js";
import { syntheticInstructionParser } from "../instructions/index.js";
import { parseEffectLine } from "../orchestrator.js";
import { syntheticInstructionSegmentParser } from "../segments/index.js";
import type { ParsedRuntimeEffectLine } from "../types.js";
import { parseOncePerTurnMarker } from "./once-per-turn.js";

function expectRuntimeLine(
  result: ReturnType<typeof parseEffectLine>,
): ParsedRuntimeEffectLine {
  expect(result).toBeDefined();
  if (result === undefined || result.kind === "metadata") {
    throw new Error("Expected runtime effect line parse result.");
  }
  return result;
}

describe("once-per-turn marker parser", () => {
  it("parses the marker independently and returns an effect-block patch", () => {
    expect(parseOncePerTurnMarker({ text: "[Once Per Turn]" })).toEqual({
      patch: { oncePerTurn: true },
      evidence: ["marker:oncePerTurn"],
      rest: "",
    });
  });

  it("consumes only the marker and leaves the rest for later parsers", () => {
    expect(parseOncePerTurnMarker({ text: "[Once Per Turn] A." })).toEqual({
      patch: { oncePerTurn: true },
      evidence: ["marker:oncePerTurn"],
      rest: "A.",
    });
  });

  it.each(["[When Attacking]", "[Activate: Main]"])(
    "integrates with %s without entry/body pair registration",
    (entryPoint) => {
      const effect: Effect = { type: "custom", handler: "synthetic:A" };

      const result = parseEffectLine(`${entryPoint} [Once Per Turn] A.`, {
        entryPoints: [parseSupportedEntryPoint],
        markers: [parseOncePerTurnMarker],
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

      const runtimeLine = expectRuntimeLine(result);
      expect(runtimeLine.block.oncePerTurn).toBe(true);
      expect(runtimeLine.block.effect).toEqual(effect);
      expect(runtimeLine.evidence).toContain("marker:oncePerTurn");
      expect(runtimeLine.evidence).toContain("composition:entryExpression");
    },
  );
});
