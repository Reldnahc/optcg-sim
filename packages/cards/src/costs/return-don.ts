import type { EffectBlockCost, EffectTextSpan } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";
import { sourceSpan, trimSource, type SourceSlice } from "../source-slices.js";
import type { CostParseResult as SequenceCostParseResult } from "./rest-don.js";

type ReturnDonCost = Extract<EffectBlockCost, { type: "returnDon" }>;

export interface CostParseResult {
  readonly cost: ReturnDonCost;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
  readonly restSource?: SourceSlice;
  readonly presentationSpans?: readonly EffectTextSpan[];
}

export const returnDonCostPrimitive = {
  primitiveId: "cost:returnDon",
  matches: [
    { id: "don-minus-n" },
    { id: "return-active-don" },
    { id: "return-one-or-more-field-don" },
  ],
} as const;

export function parseReturnDonCost(
  input: ParseInput,
): CostParseResult | undefined {
  const match =
    /^DON!!\s*[-\u2212](?<count>[1-9]\d*)(?:\s*\([^)]*\))?:\s*(?<rest>[\s\S]*)$/iu.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  const restText = match?.groups?.["rest"];
  if (countText === undefined) {
    return undefined;
  }
  const evidence = ["cost:returnDon", "count:positiveInteger"] as const;
  const rest = restText?.trim() ?? "";
  const costSource =
    input.source === undefined
      ? undefined
      : trimSource({
          text: input.text.slice(0, input.text.indexOf(":") + 1),
          rawText: input.text.slice(0, input.text.indexOf(":") + 1),
          start: input.source.start,
          end: input.source.start + input.text.indexOf(":") + 1,
        });
  const restSource = sourceForRest(input.source, input.text, rest);

  return {
    cost: { type: "returnDon", count: Number.parseInt(countText, 10) },
    evidence,
    rest,
    ...(restSource === undefined ? {} : { restSource }),
    ...(costSource === undefined
      ? {}
      : {
          presentationSpans: [
            sourceSpan("span:cost:returnDon", "cost", costSource, evidence),
          ],
        }),
  };
}

export function parseReturnDonSequenceCost(
  input: ParseInput,
): SequenceCostParseResult | undefined {
  const variableFieldDon = parseVariableFieldDonReturnCost(input);
  if (variableFieldDon !== undefined) {
    return variableFieldDon;
  }

  const match =
    /^DON!!\s*[-\u2212](?<count>[1-9]\d*)$/iu.exec(input.text) ??
    /^return (?<count>[1-9]\d*) of your active DON!! cards? to your DON!! deck$/iu.exec(
      input.text,
    );
  const countText = match?.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }
  const sourceState = /^return\b/iu.test(input.text) ? "active" : undefined;

  return {
    cost: {
      type: "returnDon",
      count: Number.parseInt(countText, 10),
      ...(sourceState === undefined ? {} : { sourceState }),
      optional: true,
    },
    evidence: [
      "cost:returnDon",
      "count:positiveInteger",
      ...(sourceState === undefined ? [] : (["state:active"] as const)),
    ],
    rest: "",
  };
}

function parseVariableFieldDonReturnCost(
  input: ParseInput,
): SequenceCostParseResult | undefined {
  if (
    !/^return 1 or more DON!! cards from your field to your DON!! deck$/iu.test(
      input.text,
    )
  ) {
    return undefined;
  }

  return {
    cost: {
      type: "returnDon",
      count: 1,
      maxCount: "available",
      optional: true,
    },
    evidence: ["cost:returnDon", "count:atLeastOne"],
    rest: "",
  };
}

function sourceForRest(
  source: SourceSlice | undefined,
  currentText: string,
  restText: string,
): SourceSlice | undefined {
  if (source === undefined) {
    return undefined;
  }
  const restIndex =
    restText.length === 0
      ? currentText.length
      : currentText.lastIndexOf(restText);
  const startOffset =
    restIndex >= 0 ? restIndex : currentText.length - restText.length;
  return {
    text: restText,
    rawText: restText,
    start: source.start + Math.max(0, startOffset),
    end: source.end,
  };
}
