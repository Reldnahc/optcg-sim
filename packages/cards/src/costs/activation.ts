import type { EffectTextSpan } from "@optcg/types";

import { sourceSpan, trimSource, type SourceSlice } from "../source-slices.js";
import type { ParseInput } from "../types.js";
import {
  parseOptionalChooseOneTrashCost,
  type OptionalChooseOneTrashCostParseResult,
} from "./optional-choose-one-trash.js";
import {
  parseFieldToLifeCost,
  type FieldToLifeCostParseResult,
} from "./field-to-life.js";
import {
  parseReturnDonCost,
  type CostParseResult as ReturnDonCostParseResult,
} from "./return-don.js";
import {
  parseOptionalCostSequence,
  type OptionalCostSequenceParseResult,
} from "./sequence.js";
import type { CostParser } from "./groups.js";

export type OptionalActivationCostParseResult =
  | OptionalChooseOneTrashCostParseResult
  | (OptionalCostSequenceParseResult & {
      readonly presentationSpans?: readonly EffectTextSpan[];
      readonly restSource?: SourceSlice;
    });

export const optionalActivationCostParsers: readonly CostParser<OptionalActivationCostParseResult>[] =
  [parseOptionalCostSequenceFromOptionalText, parseOptionalChooseOneTrashCost];

export type MandatoryActivationCostParseResult =
  | ReturnDonCostParseResult
  | FieldToLifeCostParseResult;

export const mandatoryActivationCostParsers: readonly CostParser<MandatoryActivationCostParseResult>[] =
  [parseReturnDonCost, parseFieldToLifeCost];

function parseOptionalCostSequenceFromOptionalText(
  input: ParseInput,
): OptionalActivationCostParseResult | undefined {
  const sentenceCost = parseOptionalCostSequenceFromIfYouDoSentence(input);
  if (sentenceCost !== undefined) {
    return sentenceCost;
  }

  const separatorIndex = input.text.indexOf(":");
  if (separatorIndex < 0) {
    return undefined;
  }

  const costText = input.text.slice(0, separatorIndex).trim();
  if (!hasOptionalCostMarker(costText)) {
    return undefined;
  }

  const bodyText = input.text.slice(separatorIndex + 1).trim();
  if (costText.length === 0 || bodyText.length === 0) {
    return undefined;
  }

  const cost = parseOptionalCostSequence({ text: costText });
  if (cost === undefined) {
    return undefined;
  }
  const rawBodyText = input.text.slice(separatorIndex + 1);
  const rawCostText = input.text.slice(0, separatorIndex);
  return {
    ...cost,
    rest: bodyText,
    ...(input.source === undefined
      ? {}
      : {
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
              cost.evidence,
            ),
          ],
          restSource: trimSource({
            text: rawBodyText,
            rawText: rawBodyText,
            start: input.source.start + separatorIndex + 1,
            end: input.source.end,
          }),
        }),
  };
}

function parseOptionalCostSequenceFromIfYouDoSentence(
  input: ParseInput,
): OptionalActivationCostParseResult | undefined {
  const match = /^(?<cost>.+?)\.\s+(?:(?:If you do),\s+)?(?<body>.+)$/iu.exec(
    input.text,
  );
  const costText = match?.groups?.["cost"]?.trim();
  const bodyText = match?.groups?.["body"]?.trim();
  if (
    costText === undefined ||
    bodyText === undefined ||
    !hasOptionalCostMarker(costText)
  ) {
    return undefined;
  }

  const cost = parseOptionalCostSequence({ text: costText });
  if (cost === undefined) {
    return undefined;
  }

  return {
    ...cost,
    rest: bodyText,
  };
}

function hasOptionalCostMarker(text: string): boolean {
  return /^(?:[\u2780\u2460\u2781\u2461\u2782\u2462\u2783\u2463\u2784\u2464]|You may\b|.*(?:,|\band\b)\s*You may\b)/iu.test(
    text,
  );
}
