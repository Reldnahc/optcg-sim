import type { EffectTextSpan, OptionalCost } from "@optcg/types";

import { parseExactCardinality } from "../cardinality/index.js";
import { sourceSpan, trimSource, type SourceSlice } from "../source-slices.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";
import { parseFieldCostFilter } from "./field-cost-filter.js";

type ChooseOneCost = Extract<OptionalCost, { type: "chooseOne" }>;
type RestCostOption = ChooseOneCost["options"][number];

export interface OptionalChooseOneRestCostParseResult {
  readonly cost: ChooseOneCost;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly presentationSpans?: readonly EffectTextSpan[];
  readonly rest: string;
  readonly restSource?: SourceSlice;
}

export function parseOptionalChooseOneRestCost(
  input: ParseInput,
): OptionalChooseOneRestCostParseResult | undefined {
  const prefixMatch = /^You may\s+(?<rest>.+)$/iu.exec(input.text);
  const afterOptional = prefixMatch?.groups?.["rest"];
  if (afterOptional === undefined) {
    return undefined;
  }
  const separatorIndex = afterOptional.indexOf(":");
  if (separatorIndex < 0) {
    return undefined;
  }
  const costText = afterOptional.slice(0, separatorIndex).trim();
  const bodyText = afterOptional.slice(separatorIndex + 1).trim();
  if (costText.length === 0 || bodyText.length === 0) {
    return undefined;
  }

  const parsed = parseRestFieldOrDonOptions(costText);
  if (parsed === undefined) {
    return undefined;
  }
  const evidence = [
    "cost:chooseOne",
    ...parsed.flatMap((option) => option.evidence),
  ] satisfies readonly PrimitiveEvidence[];

  return {
    cost: {
      type: "chooseOne",
      optional: true,
      options: parsed.map((option) => option.cost) as ChooseOneCost["options"],
    },
    evidence,
    rest: bodyText,
    ...sourceMetadata(input, evidence),
  };
}

function parseRestFieldOrDonOptions(
  costText: string,
): readonly {
  readonly cost: RestCostOption;
  readonly evidence: readonly PrimitiveEvidence[];
}[] | undefined {
  const match = /^rest\s+(?<rest>.+)$/iu.exec(costText);
  const afterRest = match?.groups?.["rest"];
  if (afterRest === undefined) {
    return undefined;
  }
  const cardinality = parseExactCardinality({ text: afterRest });
  if (cardinality === undefined) {
    return undefined;
  }
  const split = splitFieldOrDonTarget(cardinality.rest);
  if (split === undefined) {
    return undefined;
  }
  const fieldFilter = parseFieldCostFilter({ text: split.fieldText });
  if (fieldFilter === undefined) {
    return undefined;
  }

  return [
    {
      cost: {
        type: "restFromField",
        count: cardinality.count,
        chooser: "self",
        filter: fieldFilter.filter,
        optional: true,
      },
      evidence: [
        "cost:restFromField",
        ...cardinality.evidence,
        "chooser:self",
        "player:self",
        ...fieldFilter.evidence,
      ],
    },
    {
      cost: {
        type: "restDon",
        count: cardinality.count,
        chooser: "self",
        optional: true,
      },
      evidence: [
        "cost:restDon",
        ...cardinality.evidence,
        "target:yourDonCards",
        "player:self",
        "chooser:self",
      ],
    },
  ];
}

function splitFieldOrDonTarget(
  text: string,
): { readonly fieldText: string } | undefined {
  const match =
    /^of your (?<field>.+?) or DON!! cards?$/iu.exec(text.trim());
  const fieldText = match?.groups?.["field"]?.trim();
  return fieldText === undefined || fieldText.length === 0
    ? undefined
    : { fieldText };
}

function sourceMetadata(
  input: ParseInput,
  evidence: readonly PrimitiveEvidence[],
):
  | {
      readonly presentationSpans: readonly EffectTextSpan[];
      readonly restSource: SourceSlice;
    }
  | Record<string, never> {
  const separatorIndex = input.text.indexOf(":");
  if (input.source === undefined || separatorIndex < 0) {
    return {};
  }

  const rawCostText = input.text.slice(0, separatorIndex);
  const rawBodyText = input.text.slice(separatorIndex + 1);

  return {
    presentationSpans: [
      sourceSpan(
        "span:cost:optional",
        "cost",
        trimSource({
          text: rawCostText,
          rawText: rawCostText,
          start: input.source.start,
          end: input.source.start + separatorIndex,
        }),
        evidence,
      ),
    ],
    restSource: trimSource({
      text: rawBodyText,
      rawText: rawBodyText,
      start: input.source.start + separatorIndex + 1,
      end: input.source.end,
    }),
  };
}
