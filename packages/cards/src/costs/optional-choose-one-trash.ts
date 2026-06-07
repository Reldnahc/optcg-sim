import type { EffectTextSpan, OptionalCost } from "@optcg/types";

import { parseExactCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import { sourceSpan, trimSource, type SourceSlice } from "../source-slices.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";

type ChooseOneTrashCost = Extract<OptionalCost, { type: "chooseOne" }>;
type TrashCostOptionParseResult = {
  readonly cost: ChooseOneTrashCost["options"][number];
  readonly evidence: readonly PrimitiveEvidence[];
};

export interface OptionalChooseOneTrashCostParseResult {
  readonly cost: ChooseOneTrashCost;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly presentationSpans?: readonly EffectTextSpan[];
  readonly rest: string;
  readonly restSource?: SourceSlice;
}

const self = "self";

export function parseOptionalChooseOneTrashCost(
  input: ParseInput,
): OptionalChooseOneTrashCostParseResult | undefined {
  const prefixMatch = /^You may\s+(?<rest>.+)$/i.exec(input.text);
  const afterOptional = prefixMatch?.groups?.["rest"];
  if (afterOptional === undefined) {
    return undefined;
  }

  const split = splitCostAndBody(afterOptional);
  if (split === undefined) {
    return undefined;
  }

  const options = splitTrashCostOptions(split.costText);
  if (options.length < 2) {
    return undefined;
  }

  const parsedOptions: TrashCostOptionParseResult[] = [];
  for (const [index, optionText] of options.entries()) {
    const option = parseTrashCostOption(
      index === 0 ? optionText : `trash ${optionText}`,
    );
    if (option === undefined) {
      return undefined;
    }
    parsedOptions.push(option);
  }

  const evidence = [
    "cost:chooseOne",
    ...parsedOptions.flatMap((option) => option.evidence),
  ] satisfies readonly PrimitiveEvidence[];

  return {
    cost: {
      type: "chooseOne",
      optional: true,
      options: parsedOptions.map(
        (option) => option.cost,
      ) as ChooseOneTrashCost["options"],
    },
    evidence,
    rest: split.bodyText,
    ...sourceMetadata(input, evidence),
  };
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

function splitTrashCostOptions(costText: string): readonly string[] {
  const split = costText.split(/\s+or\s+/i);
  const options: string[] = [];
  for (const part of split) {
    const trimmed = part.trim();
    if (/^field$/i.test(trimmed) && options.length > 0) {
      const previous = options.at(-1);
      if (previous !== undefined && /\bfrom your hand$/i.test(previous)) {
        options.push(previous.replace(/\bfrom your hand$/i, "from your field"));
        continue;
      }
    }
    options.push(trimmed);
  }
  return options;
}

function splitCostAndBody(
  text: string,
): { readonly costText: string; readonly bodyText: string } | undefined {
  const separatorIndex = text.indexOf(":");
  if (separatorIndex < 0) {
    return undefined;
  }

  const costText = text.slice(0, separatorIndex).trim();
  const bodyText = text.slice(separatorIndex + 1).trim();
  if (costText.length === 0 || bodyText.length === 0) {
    return undefined;
  }

  return { costText, bodyText };
}

function parseTrashCostOption(
  text: string,
): TrashCostOptionParseResult | undefined {
  const actionMatch = /^trash\s+(?<rest>.+)$/i.exec(text);
  const afterAction = actionMatch?.groups?.["rest"];
  if (afterAction === undefined) {
    return undefined;
  }

  const cardinality = parseExactCardinality({ text: afterAction });
  if (cardinality === undefined) {
    return undefined;
  }

  const source = parseTrashCostSource(cardinality.rest);
  if (source === undefined) {
    return undefined;
  }

  const parsedFilter = parseTrashCostFilter(source.predicateText);
  if (parsedFilter === undefined) {
    return undefined;
  }

  if (source.zone === "hand") {
    return {
      cost: {
        type: "trashFromHand",
        count: cardinality.count,
        chooser: self,
        optional: true,
        ...(parsedFilter.filter === undefined
          ? {}
          : { filter: parsedFilter.filter }),
      },
      evidence: [
        "cost:trashFromHand",
        ...cardinality.evidence,
        ...parsedFilter.evidence,
        "zone:hand",
        "chooser:self",
      ],
    };
  }

  return {
    cost: {
      type: "trashFromField",
      count: cardinality.count,
      chooser: self,
      optional: true,
      filter: parsedFilter.filter ?? {},
    },
    evidence: [
      "cost:trashFromField",
      ...cardinality.evidence,
      ...parsedFilter.evidence,
      "zone:characterArea",
      "zone:stageArea",
      "chooser:self",
    ],
  };
}

function parseTrashCostSource(text: string):
  | {
      readonly predicateText: string;
      readonly zone: "field" | "hand";
    }
  | undefined {
  const explicitZoneMatch =
    /^(?<predicates>.+?)\s+from your\s+(?<zone>hand|field)$/i.exec(text);
  const explicitPredicateText = explicitZoneMatch?.groups?.["predicates"];
  const explicitZone = explicitZoneMatch?.groups?.["zone"]?.toLowerCase();
  if (
    explicitPredicateText !== undefined &&
    (explicitZone === "hand" || explicitZone === "field")
  ) {
    return {
      predicateText: explicitPredicateText,
      zone: explicitZone,
    };
  }

  const impliedFieldMatch = /^of your\s+(?<predicates>.+)$/i.exec(text);
  const impliedFieldPredicateText = impliedFieldMatch?.groups?.["predicates"];
  if (impliedFieldPredicateText !== undefined) {
    return {
      predicateText: impliedFieldPredicateText,
      zone: "field",
    };
  }

  return undefined;
}

function parseTrashCostFilter(text: string):
  | {
      readonly filter: ChooseOneTrashCost["options"][number]["filter"];
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  if (/^cards?$/i.test(text.trim())) {
    return { filter: undefined, evidence: [] };
  }

  const predicates = parseCardFilterPredicates(
    { text },
    { powerSemantics: "current" },
  );
  if (predicates === undefined || predicates.rest.length > 0) {
    return undefined;
  }

  return {
    filter: predicates.filter,
    evidence: predicates.evidence,
  };
}
