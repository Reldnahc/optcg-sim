import type { CardColor, CardId, CardFilter, Effect } from "@optcg/types";

import {
  buildSequenceEffect,
  parseExactPositiveSafeInteger,
  parseSupportedTriggerWrapper,
  toEffectId,
  type ReusableComposedParserClause,
} from "./composed-parser-builder.js";
import {
  parseReturnDonCostWrapper,
  returnDonCostWrapperParserRuleId,
} from "./return-don-cost-wrapper-components.js";

export const topNFilteredSearchParserRuleId =
  "exact:on-play:top-n-search:filtered:reveal-up-to-1:hand:bottom-owner-choice";
export const topNAnyCardSearchParserRuleId =
  "exact:on-play:top-n-search:any-card:up-to-1:hand:bottom-owner-choice";
export const returnDonTopNAnyCardSearchTrashParserRuleId =
  "exact:on-play:return-don-top-n-search:any-card:hand:bottom-owner-choice:trash-hand";

type FilteredSearchParse = {
  readonly color: CardColor;
  readonly excludedName: string;
  readonly lookCount: number;
  readonly typeName: string;
};

type AnyCardSearchTrashParse = {
  readonly donCount: number;
  readonly lookCount: number;
  readonly trashCount: number;
};

type AnyCardSearchParse = {
  readonly lookCount: number;
};

export function parseOnPlayTopNFilteredSearchClause(
  cardId: CardId,
  sourceText: string,
): ReusableComposedParserClause | undefined {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (wrapper === undefined || wrapper.prefix !== "[On Play] ") {
    return undefined;
  }

  const parsed = parseTopNFilteredSearchBody(wrapper.bodyText);
  if (parsed === undefined) {
    return undefined;
  }

  return {
    effectBlock: {
      category: "auto",
      effect: createSearchEffect({
        filter: {
          colorsAny: [parsed.color],
          nameNot: [parsed.excludedName],
          typesAny: [parsed.typeName],
        },
        lookCount: parsed.lookCount,
        revealTo: "bothPlayers",
      }),
      id: toEffectId(
        `${String(cardId)}:auto-on-play-top-${String(
          parsed.lookCount,
        )}-filtered-search-reveal-1`,
      ),
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "onPlay" },
    },
    parserRuleId: topNFilteredSearchParserRuleId,
  };
}

export function parseOnPlayReturnDonTopNAnyCardSearchTrashClause(
  cardId: CardId,
  sourceText: string,
): ReusableComposedParserClause | undefined {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (wrapper === undefined || wrapper.prefix !== "[On Play] ") {
    return undefined;
  }

  const parsed = parseReturnDonTopNAnyCardSearchTrashBody(wrapper.bodyText);
  if (parsed === undefined) {
    return undefined;
  }

  return {
    effectBlock: {
      category: "auto",
      cost: {
        chooser: "self",
        count: parsed.donCount,
        type: "returnDon",
      },
      effect: buildSequenceEffect([
        {
          connector: "always",
          effect: createSearchEffect({
            filter: {},
            lookCount: parsed.lookCount,
            revealTo: "chooserOnly",
          }),
        },
        {
          connector: "then",
          effect: {
            chooser: "self",
            count: parsed.trashCount,
            player: "self",
            type: "trashFromHand",
          },
        },
      ]),
      id: toEffectId(
        `${String(cardId)}:auto-on-play-return-don-${String(
          parsed.donCount,
        )}-top-${String(parsed.lookCount)}-any-card-search-trash-${String(
          parsed.trashCount,
        )}`,
      ),
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "onPlay" },
    },
    parserRuleId: returnDonTopNAnyCardSearchTrashParserRuleId,
    parserRuleIds: [
      returnDonCostWrapperParserRuleId,
      topNAnyCardSearchParserRuleId,
      returnDonTopNAnyCardSearchTrashParserRuleId,
    ],
  };
}

export const parseFilteredTopNSearchClause =
  parseOnPlayTopNFilteredSearchClause;
export const parseAnyCardTopNSearchClause = parseOnPlayTopNAnyCardSearchClause;
export const parseCostedTopNSearchClause =
  parseOnPlayReturnDonTopNAnyCardSearchTrashClause;

export function parseTopNSearchClause(
  cardId: CardId,
  sourceText: string,
): ReusableComposedParserClause | undefined {
  return (
    parseOnPlayTopNFilteredSearchClause(cardId, sourceText) ??
    parseOnPlayTopNAnyCardSearchClause(cardId, sourceText) ??
    parseOnPlayReturnDonTopNAnyCardSearchTrashClause(cardId, sourceText)
  );
}

export function parseOnPlayTopNAnyCardSearchClause(
  cardId: CardId,
  sourceText: string,
): ReusableComposedParserClause | undefined {
  const wrapper = parseSupportedTriggerWrapper(sourceText);
  if (wrapper === undefined || wrapper.prefix !== "[On Play] ") {
    return undefined;
  }

  const parsed = parseTopNAnyCardSearchBody(wrapper.bodyText);
  if (parsed === undefined) {
    return undefined;
  }

  return {
    effectBlock: {
      category: "auto",
      effect: createSearchEffect({
        filter: {},
        lookCount: parsed.lookCount,
        revealTo: "chooserOnly",
      }),
      id: toEffectId(
        `${String(cardId)}:auto-on-play-top-${String(
          parsed.lookCount,
        )}-any-card-search-add-up-to-1`,
      ),
      sourcePresencePolicy: "mustRemainInSameZone",
      trigger: { type: "onPlay" },
    },
    parserRuleId: topNAnyCardSearchParserRuleId,
  };
}

function parseTopNFilteredSearchBody(
  bodyText: string,
): FilteredSearchParse | undefined {
  const match =
    /^Look at (\d+) (card|cards) from the top of your deck; reveal up to 1 (red|green|blue|purple|black|yellow) \{([^{}]+)\} type card other than \[([^\]]+)\] and add it to your hand\. Then, place the rest at the bottom of your deck in any order\.$/.exec(
      bodyText,
    );
  if (match === null) {
    return undefined;
  }

  const lookCount = parsePositiveCardCount(match[1] ?? "", match[2]);
  const color = parseCardColor(match[3] ?? "");
  const typeName = match[4]?.trim() ?? "";
  const excludedName = match[5]?.trim() ?? "";
  if (
    lookCount === undefined ||
    color === undefined ||
    typeName.length === 0 ||
    excludedName.length === 0
  ) {
    return undefined;
  }

  return { color, excludedName, lookCount, typeName };
}

function parseReturnDonTopNAnyCardSearchTrashBody(
  bodyText: string,
): AnyCardSearchTrashParse | undefined {
  const costWrapper = parseReturnDonCostWrapper(bodyText);
  if (costWrapper === undefined) {
    return undefined;
  }

  const match = /^(.*), and trash (\d+) (card|cards) from your hand\.$/.exec(
    costWrapper.bodyText,
  );
  if (match === null) {
    return undefined;
  }

  const searchBodyText = match[1] ?? "";
  const searchParse = parseTopNAnyCardSearchBody(searchBodyText);
  const trashCount = parsePositiveCardCount(match[2] ?? "", match[3]);
  if (searchParse === undefined || trashCount === undefined) {
    return undefined;
  }

  return {
    donCount: costWrapper.count,
    lookCount: searchParse.lookCount,
    trashCount,
  };
}

function parseTopNAnyCardSearchBody(
  bodyText: string,
): AnyCardSearchParse | undefined {
  const match =
    /^Look at (\d+) (card|cards) from the top of your deck and add up to 1 card to your hand\. Then, place the rest at the bottom of your deck in any order\.?$/.exec(
      bodyText,
    );
  if (match === null) {
    return undefined;
  }

  const lookCount = parsePositiveCardCount(match[1] ?? "", match[2]);
  if (lookCount === undefined) {
    return undefined;
  }

  return { lookCount };
}

function createSearchEffect({
  filter,
  lookCount,
  revealTo,
}: {
  readonly filter: CardFilter;
  readonly lookCount: number;
  readonly revealTo: "bothPlayers" | "chooserOnly";
}): Effect {
  return {
    request: {
      destination: "hand",
      filter,
      lookCount,
      max: 1,
      min: 0,
      player: "self",
      remainingCards: {
        destination: "deck",
        order: "ownerChoice",
        position: "bottom",
      },
      revealTo,
      shuffleAfter: false,
      zone: "deck",
    },
    type: "search",
  };
}

function parsePositiveCardCount(
  countText: string,
  noun: string | undefined,
): number | undefined {
  const count = parseExactPositiveSafeInteger(countText);
  if (count === undefined) {
    return undefined;
  }

  if ((count === 1 && noun !== "card") || (count !== 1 && noun !== "cards")) {
    return undefined;
  }

  return count;
}

function parseCardColor(sourceText: string): CardColor | undefined {
  switch (sourceText) {
    case "black":
    case "blue":
    case "green":
    case "purple":
    case "red":
    case "yellow":
      return sourceText;
    default:
      return undefined;
  }
}
