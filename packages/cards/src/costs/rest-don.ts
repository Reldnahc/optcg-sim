import type { ParseInput, PrimitiveEvidence } from "../types.js";
import type { OptionalCost } from "@optcg/types";
import { parseExactCardinality } from "../cardinality/index.js";
import { parseYourDonCardsCostTarget } from "../targets/index.js";

export type SequenceCostPrimitive =
  | Extract<OptionalCost, { type: "restDon" }>
  | Extract<OptionalCost, { type: "returnDon" }>
  | Extract<OptionalCost, { type: "restSelf" }>
  | Extract<OptionalCost, { type: "turnLifeFaceUp" }>
  | Extract<OptionalCost, { type: "trashFromHand" }>
  | Extract<OptionalCost, { type: "moveCards" }>;

export interface CostParseResult {
  readonly cost: SequenceCostPrimitive;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export const parseRestDonCost = (
  input: ParseInput,
): CostParseResult | undefined => {
  const circled = parseCircledRestDonCost(input);
  if (circled !== undefined) {
    return circled;
  }

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

const circledDonCounts = new Map<string, number>([
  ["➀", 1],
  ["①", 1],
  ["➁", 2],
  ["②", 2],
  ["➂", 3],
  ["③", 3],
  ["➃", 4],
  ["④", 4],
  ["➄", 5],
  ["⑤", 5],
]);

function parseCircledRestDonCost(
  input: ParseInput,
): CostParseResult | undefined {
  const marker = input.text.trim().slice(0, 1);
  const count = circledDonCounts.get(marker);
  if (count === undefined) {
    return undefined;
  }

  const rest = input.text.trim().slice(marker.length).trim();
  const reminderMatch =
    /^\(You may rest the specified number of DON!! cards in your cost area\.\)\s*$/iu.exec(
      rest,
    );
  if (reminderMatch === null) {
    return undefined;
  }

  return {
    cost: {
      type: "restDon",
      count,
      chooser: "self",
      optional: true,
    },
    evidence: [
      "cost:restDon",
      "cardinality:exact",
      "count:positiveInteger",
      "target:yourDonCards",
      "player:self",
      "chooser:self",
    ],
    rest: "",
  };
}
