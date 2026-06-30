import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import type { ConditionParseResult, ConditionParser } from "../types.js";

export const turnWindowConditionPrimitive: PrimitivePatternDefinition<ConditionParseResult> =
  {
    primitiveId: "condition:turnWindow",
    matches: [
      {
        id: "your-opponents-turn",
        pattern: /^(?:it(?:'s| is) )?(?:during )?your opponent's turn$/iu,
        build: () => ({
          condition: { type: "opponentTurn" },
          evidence: ["condition:opponentTurn"],
          rest: "",
        }),
      },
      {
        id: "your-turn",
        pattern: /^(?:it(?:'s| is) )?(?:during )?your turn$/iu,
        build: () => ({
          condition: { type: "yourTurn" },
          evidence: ["condition:yourTurn"],
          rest: "",
        }),
      },
    ],
  };

export const parseTurnWindowCondition: ConditionParser = (input) =>
  parsePrimitivePattern(input, turnWindowConditionPrimitive);
