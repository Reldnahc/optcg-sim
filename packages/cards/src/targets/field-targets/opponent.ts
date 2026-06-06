import { parseCardFilterPredicates } from "../../filters/index.js";
import type { ParseInput } from "../../types.js";
import { leaderOrCharacterFilterWithPredicates } from "./shared.js";
import type { FieldTargetParseResult } from "./types.js";

export function parseOpponentCharactersTarget(
  input: ParseInput,
): FieldTargetParseResult | undefined {
  const target = parseOpponentFieldTarget(input);
  if (target === undefined || target.filter?.categories?.[0] !== "character") {
    return undefined;
  }

  return target;
}

export function parseOpponentFieldTarget(
  input: ParseInput,
): FieldTargetParseResult | undefined {
  const match = /^of your opponent's\s+(?<rest>.+)$/i.exec(input.text);
  const targetText = match?.groups?.["rest"];
  if (match === null) {
    return undefined;
  }

  const predicates =
    targetText === undefined
      ? undefined
      : parseCardFilterPredicates(
          { text: targetText },
          { powerSemantics: "current" },
        );
  const category = predicates?.filter.categories?.[0];
  if (predicates === undefined || category === undefined) {
    return undefined;
  }

  const targetEvidence =
    category === "stage"
      ? "target:opponentStages"
      : "target:opponentCharacters";

  return {
    filter: predicates.filter,
    evidence: ["player:opponent", targetEvidence, ...predicates.evidence],
    rest: predicates.rest.trim(),
  };
}

export function parseOpponentLeaderOrCharacterCardsTarget(
  input: ParseInput,
): FieldTargetParseResult | undefined {
  const match =
    /^of your opponent's Leader or Character cards?\b\s*(?<rest>.*)$/i.exec(
      input.text,
    );
  if (match === null) {
    return undefined;
  }
  const predicateText = match.groups?.["rest"]?.trim() ?? "";
  const predicates =
    predicateText.length > 0
      ? parseCardFilterPredicates(
          { text: predicateText },
          { powerSemantics: "current" },
        )
      : undefined;

  return {
    target: {
      type: "chooseFromZones",
      request: {
        timing: "onResolution",
        chooser: "self",
        player: "opponent",
        zones: ["leaderArea", "characterArea"],
        min: 0,
        max: 1,
        allowFewerIfUnavailable: true,
        visibility: "public",
        filter: leaderOrCharacterFilterWithPredicates(predicates),
      },
    },
    evidence: [
      "target:opponentLeaderOrCharacters",
      "player:opponent",
      "filter:category:leader",
      "filter:category:character",
      ...(predicates?.evidence ?? []),
    ],
    rest: predicates?.rest.trim() ?? predicateText,
  };
}

export function parseOpponentCharactersOrDonCardsTarget(
  input: ParseInput,
): FieldTargetParseResult | undefined {
  const match =
    /^of your opponent's Characters? or DON!! cards?\b\s*(?<rest>.*)$/i.exec(
      input.text,
    );
  if (match === null) {
    return undefined;
  }

  return {
    target: {
      type: "chooseFromZones",
      request: {
        timing: "onResolution",
        chooser: "self",
        player: "opponent",
        zones: ["characterArea", "costArea"],
        min: 0,
        max: 1,
        allowFewerIfUnavailable: true,
        visibility: "public",
        filter: { categories: ["character", "don"] },
      },
    },
    evidence: [
      "target:opponentCharactersOrDonCards",
      "player:opponent",
      "zone:characterArea",
      "zone:costArea",
      "filter:category:character",
      "filter:category:don",
    ],
    rest: match.groups?.["rest"]?.trim() ?? "",
  };
}
