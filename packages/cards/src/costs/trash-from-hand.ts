import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import type { CostParseResult } from "./rest-don.js";

export const trashFromHandCostPrimitive: PrimitivePatternDefinition<CostParseResult> =
  {
    primitiveId: "cost:trashFromHand",
    matches: [
      {
        id: "trash-n-cards-from-your-hand",
        pattern: /^trash (?<count>[1-9]\d*) cards? from your hand$/i,
        build: (groups) => ({
          cost: {
            type: "trashFromHand",
            count: Number.parseInt(groups["count"] ?? "", 10),
            chooser: "self",
            optional: true,
          },
          evidence: [
            "cost:trashFromHand",
            "count:positiveInteger",
            "chooser:self",
          ],
          rest: "",
        }),
      },
    ],
  };

export const parseTrashFromHandCost = (
  input: Parameters<typeof parsePrimitivePattern<CostParseResult>>[0],
): CostParseResult | undefined =>
  parsePrimitivePattern(input, trashFromHandCostPrimitive);
