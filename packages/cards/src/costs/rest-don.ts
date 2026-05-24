import type { ParseInput, PrimitiveEvidence } from "../types.js";
import type { OptionalCost } from "@optcg/types";
import { parseExactCardinality } from "../cardinality/index.js";
import { parseYourDonCardsCostTarget } from "../targets/index.js";

export type SequenceCostPrimitive =
  | Extract<OptionalCost, { type: "restDon" }>
  | Extract<OptionalCost, { type: "trashFromHand" }>;

export interface CostParseResult {
  readonly cost: SequenceCostPrimitive;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export const parseRestDonCost = (
  input: ParseInput,
): CostParseResult | undefined => {
  const actionMatch = /^rest\s+(?<rest>.+)$/i.exec(input.text);
  const afterAction = actionMatch?.groups?.["rest"];
  if (afterAction !== undefined) {
    const cardinality = parseExactCardinality({ text: afterAction });
    if (cardinality !== undefined) {
      const target = parseYourDonCardsCostTarget({ text: cardinality.rest });
      if (target !== undefined && target.rest.length === 0) {
        return {
          cost: {
            type: "restDon",
            count: cardinality.count,
            chooser: "self",
            optional: true,
          },
          evidence: [
            "cost:restDon",
            ...cardinality.evidence,
            ...target.evidence,
            "chooser:self",
          ],
          rest: "",
        };
      }
    }
  }

  return undefined;
};
