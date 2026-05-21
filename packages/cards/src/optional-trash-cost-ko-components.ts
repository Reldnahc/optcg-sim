import type { CardId, SelectedTargetsRequest, Target } from "@optcg/types";

import {
  buildSequenceEffect,
  findReusableComposedResiduePrefix,
  parseExactPositiveSafeInteger,
  parseSupportedTriggerWrapper,
  parseUpToCardinality,
  toEffectId,
  type ReusableComposedParserClause,
  type ReusableComposedParserResidueClause,
} from "./composed-parser-builder.js";
import { optionalTrashCostKoParserRuleId } from "./optional-trash-cost-ko-evidence.js";

export type OptionalTrashFromHandCostWrapperParse = {
  readonly bodyText: string;
  readonly count: number;
  readonly prefix: string;
};

export type OptionalTrashFromHandCostKoBodyParse = {
  readonly baseCostMax: number;
  readonly cardinality: { readonly max: 1; readonly min: 0 };
  readonly savedReferenceConsumer: "koSelectedCharacter";
  readonly target: "opponentCharactersChoose";
};

export function parseOptionalTrashFromHandCostWrapper(
  sourceText: string,
): OptionalTrashFromHandCostWrapperParse | undefined {
  const match = /^You may trash (\d+) (card|cards) from your hand: (.+)$/.exec(
    sourceText,
  );
  if (match === null) return undefined;

  const count = parsePositiveCardCount(match[1] ?? "", match[2]);
  const bodyText = match[3] ?? "";
  return count === undefined || bodyText.length === 0
    ? undefined
    : { bodyText, count, prefix: sourceText.slice(0, -bodyText.length) };
}

export function parseOptionalTrashFromHandCostKoBody(
  sourceText: string,
): OptionalTrashFromHandCostKoBodyParse | undefined {
  const match =
    /^K\.O\. (up to \d+) of (your opponent's Characters) with a base cost of (\d+) or less\.$/.exec(
      sourceText,
    );
  if (match === null) return undefined;

  const cardinality = parseUpToCardinality(match[1] ?? "");
  const target = match[2] === "your opponent's Characters";
  const baseCostMax = parseExactPositiveSafeInteger(match[3] ?? "");
  if (cardinality?.max !== 1 || !target || baseCostMax === undefined) {
    return undefined;
  }

  return {
    baseCostMax,
    cardinality: { max: 1, min: 0 },
    savedReferenceConsumer: "koSelectedCharacter",
    target: "opponentCharactersChoose",
  };
}

export function parseOnPlayOptionalTrashCostKoClause(
  cardId: CardId,
  sourceText: string,
): ReusableComposedParserClause | undefined {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (wrapper === undefined || wrapper.prefix !== "[On Play] ") {
    return undefined;
  }

  const costWrapper = parseOptionalTrashFromHandCostWrapper(wrapper.bodyText);
  const koBody =
    costWrapper === undefined
      ? undefined
      : parseOptionalTrashFromHandCostKoBody(costWrapper.bodyText);
  return costWrapper === undefined || koBody === undefined
    ? undefined
    : createOptionalTrashCostKoClause({
        baseCostMax: koBody.baseCostMax,
        cardId,
        trashCount: costWrapper.count,
      });
}

export function parseOptionalTrashCostKoResidueClause(
  cardId: CardId,
  sourceText: string,
):
  | ReusableComposedParserResidueClause<ReusableComposedParserClause>
  | undefined {
  return findReusableComposedResiduePrefix(sourceText, (prefix) =>
    parseOnPlayOptionalTrashCostKoClause(cardId, prefix),
  );
}

function createOptionalTrashCostKoClause({
  baseCostMax,
  cardId,
  trashCount,
}: {
  baseCostMax: number;
  cardId: CardId;
  trashCount: number;
}): ReusableComposedParserClause {
  return {
    effectBlock: {
      category: "auto",
      effect: buildSequenceEffect([
        {
          connector: "always",
          effect: {
            cost: {
              chooser: "self",
              count: trashCount,
              optional: true,
              type: "trashFromHand",
            },
            type: "payCost",
          },
          id: "optionalTrashFromHandCost",
          saveResultAs: "paidOptionalTrashFromHandCost",
        },
        {
          connector: "ifYouDo",
          effect: {
            request:
              opponentCharacterBaseCostSelectedTargetsRequest(baseCostMax),
            type: "selectTargets",
          },
          id: "selectOpponentCharacterByBaseCost",
          saveResultAs: "selectedTarget",
        },
        {
          connector: "ifPreviousSucceeded",
          effect: {
            target: savedOpponentCharacterTargetByBaseCost(),
            type: "ko",
          },
          id: "koSelectedTarget",
        },
      ]),
      id: toEffectId(
        `${String(cardId)}:auto-on-play-optional-trash-${String(trashCount)}-from-hand-ko-base-cost-${String(baseCostMax)}-or-less`,
      ),
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "onPlay" },
    },
    parserRuleId: optionalTrashCostKoParserRuleId,
  };
}

function opponentCharacterBaseCostSelectedTargetsRequest(
  baseCostMax: number,
): SelectedTargetsRequest {
  return {
    allowFewerIfUnavailable: false,
    chooser: "self",
    filter: { categories: ["character"], cost: { max: baseCostMax } },
    max: 1,
    min: 0,
    player: "opponent",
    timing: "onResolution",
    visibility: "public",
    zone: "characterArea",
  };
}

function savedOpponentCharacterTargetByBaseCost(): Extract<
  Target,
  { type: "savedFieldObject" }
> {
  return {
    binding: {
      family: "selectedTargets",
      objectIndex: 0,
      saveResultAs: "selectedTarget",
      sourceSegmentId: "selectOpponentCharacterByBaseCost",
    },
    onFailure: "failClosed",
    player: "opponent",
    type: "savedFieldObject",
    visibility: "publicOnly",
    zone: "characterArea",
  };
}

function parsePositiveCardCount(
  countText: string,
  noun: string | undefined,
): number | undefined {
  const count = parseExactPositiveSafeInteger(countText);
  if (count === undefined) return undefined;
  return (count === 1 && noun === "card") || (count !== 1 && noun === "cards")
    ? count
    : undefined;
}
