import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import type { InstructionParseResult, InstructionParser } from "../types.js";

export const drawPrimitive: PrimitivePatternDefinition<InstructionParseResult> =
  {
    primitiveId: "instruction:draw",
    matches: [
      {
        id: "draw-n-cards",
        pattern: /^Draw (?<count>[1-9]\d*) cards?\.?$/i,
        build: (groups) => ({
          effect: {
            type: "draw",
            count: Number.parseInt(groups["count"] ?? "", 10),
            player: "self",
          },
          evidence: [
            "instruction:draw",
            "count:positiveInteger",
            "player:self",
          ],
          rest: "",
        }),
      },
    ],
  };

export const parseDrawInstruction: InstructionParser = (input) =>
  parsePrimitivePattern(input, drawPrimitive);
