import type {
  CardId,
  Effect,
  SelectedTargetsRequest,
  Target,
} from "@optcg/types";

import {
  buildSequenceEffect,
  findReusableComposedResiduePrefix,
  isSupportedTriggerType,
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

export type OptionalTrashKoVerbPrefixParse = {
  readonly bodyText: string;
  readonly prefix: "K.O. ";
};

export type OptionalTrashKoTargetPrefixParse = {
  readonly cardinality: { readonly max: 1; readonly min: 0 };
  readonly predicateText: string;
  readonly target: "opponentCharactersChoose";
};

export type OptionalTrashKoBaseCostMaximumPredicateParse = {
  readonly baseCostMax: number;
};

export type OptionalTrashCostKoSavedTargetConsumerParse = {
  readonly savedReferenceConsumer: "koSelectedCharacter";
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
  const verb = parseOptionalTrashKoVerbPrefix(sourceText);
  if (verb === undefined) return undefined;

  const target = parseOptionalTrashKoTargetPrefix(verb.bodyText);
  if (target === undefined) return undefined;

  const predicate = parseOptionalTrashKoBaseCostMaximumPredicate(
    target.predicateText,
  );
  if (predicate === undefined) return undefined;

  const consumer = buildOptionalTrashCostKoSavedTargetConsumer();

  return {
    baseCostMax: predicate.baseCostMax,
    cardinality: target.cardinality,
    savedReferenceConsumer: consumer.savedReferenceConsumer,
    target: target.target,
  };
}

export function parseOptionalTrashKoVerbPrefix(
  sourceText: string,
): OptionalTrashKoVerbPrefixParse | undefined {
  const prefix = "K.O. ";
  return sourceText.startsWith(prefix) && sourceText.length > prefix.length
    ? { bodyText: sourceText.slice(prefix.length), prefix }
    : undefined;
}

export function parseOptionalTrashKoTargetPrefix(
  sourceText: string,
): OptionalTrashKoTargetPrefixParse | undefined {
  const match = /^(up to \d+) of your opponent's Characters (.+)$/.exec(
    sourceText,
  );
  if (match === null) return undefined;

  const cardinality = parseUpToCardinality(match[1] ?? "");
  const predicateText = match[2] ?? "";
  return cardinality?.max === 1 && predicateText.length > 0
    ? {
        cardinality: { max: 1, min: 0 },
        predicateText,
        target: "opponentCharactersChoose",
      }
    : undefined;
}

export function parseOptionalTrashKoBaseCostMaximumPredicate(
  sourceText: string,
): OptionalTrashKoBaseCostMaximumPredicateParse | undefined {
  const match = /^with a base cost of (\d+) or less\.$/.exec(sourceText);
  if (match === null) return undefined;

  const baseCostMax = parseExactPositiveSafeInteger(match[1] ?? "");
  return baseCostMax === undefined ? undefined : { baseCostMax };
}

export function buildOptionalTrashCostKoSavedTargetConsumer(): OptionalTrashCostKoSavedTargetConsumerParse {
  return { savedReferenceConsumer: "koSelectedCharacter" };
}

export function buildOptionalTrashCostKoSequenceEffect({
  baseCostMax,
  trashCount,
}: {
  baseCostMax: number;
  trashCount: number;
}): Extract<Effect, { type: "sequence" }> {
  return buildSequenceEffect([
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
        request: opponentCharacterBaseCostSelectedTargetsRequest(baseCostMax),
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
  ]);
}

export function parseOnPlayOptionalTrashCostKoClause(
  cardId: CardId,
  sourceText: string,
): ReusableComposedParserClause | undefined {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (!isSupportedTriggerType(wrapper, "onPlay")) {
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
      effect: buildOptionalTrashCostKoSequenceEffect({
        baseCostMax,
        trashCount,
      }),
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
