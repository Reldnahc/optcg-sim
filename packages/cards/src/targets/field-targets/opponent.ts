import type { CardFilter } from "@optcg/types";

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

export function parseOpponentCardsTarget(
  input: ParseInput,
): FieldTargetParseResult | undefined {
  const match = /^of your opponent's cards?\b\s*(?<rest>.*)$/i.exec(input.text);
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
        zones: ["leaderArea", "characterArea", "stageArea", "costArea"],
        min: 0,
        max: 1,
        allowFewerIfUnavailable: true,
        visibility: "public",
        filter: { categories: ["leader", "character", "stage", "don"] },
      },
    },
    evidence: [
      "target:opponentCards",
      "player:opponent",
      "zone:leaderArea",
      "zone:characterArea",
      "zone:stageArea",
      "zone:costArea",
      "filter:category:leader",
      "filter:category:character",
      "filter:category:stage",
      "filter:category:don",
    ],
    rest: match.groups?.["rest"]?.trim() ?? "",
  };
}

export function parseOpponentDonCardsTarget(
  input: ParseInput,
): FieldTargetParseResult | undefined {
  const match =
    /^of your opponent's (?:(?<state>active|rested) )?DON!! cards?\b\s*(?<rest>.*)$/i.exec(
      input.text,
    );
  if (match === null) {
    return undefined;
  }
  const state = match.groups?.["state"]?.toLowerCase();
  const filter: CardFilter =
    state === "active" || state === "rested"
      ? { categories: ["don"], state }
      : { categories: ["don"] };

  return {
    target: {
      type: "chooseFromZones",
      request: {
        timing: "onResolution",
        chooser: "self",
        player: "opponent",
        zones: ["costArea"],
        min: 0,
        max: 1,
        allowFewerIfUnavailable: true,
        visibility: "public",
        filter,
      },
    },
    evidence: [
      "target:opponentDonCards",
      "player:opponent",
      "zone:costArea",
      "filter:category:don",
      ...(state === "active"
        ? (["filter:state:active"] as const)
        : state === "rested"
          ? (["filter:state:rested"] as const)
          : []),
    ],
    rest: match.groups?.["rest"]?.trim() ?? "",
  };
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
  const match = /^of your opponent's (?<targetText>.+)$/i.exec(input.text);
  if (match === null) {
    return undefined;
  }
  const targetText = match.groups?.["targetText"]?.trim() ?? "";
  const characterAlternative = parseCharacterAlternative(targetText);
  if (characterAlternative === undefined) {
    return undefined;
  }
  const { predicateText } = characterAlternative;
  const predicates =
    predicateText.length > 0
      ? parseCardFilterPredicates(
          { text: predicateText },
          { powerSemantics: "current" },
        )
      : undefined;
  const predicateRest = predicates?.rest.trim() ?? predicateText;
  const hasCharacterPredicates =
    predicates !== undefined &&
    (predicateRest.length === 0 || predicateRest === ".");

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
        filter: hasCharacterPredicates
          ? {
              anyOf: [
                { categories: ["don"] },
                { ...predicates.filter, categories: ["character"] },
              ],
            }
          : { categories: ["character", "don"] },
      },
    },
    evidence: [
      "target:opponentCharactersOrDonCards",
      "player:opponent",
      "zone:characterArea",
      "zone:costArea",
      ...(hasCharacterPredicates
        ? ([
            "filter:anyOf",
            "filter:category:don",
            "filter:category:character",
            ...predicates.evidence,
          ] as const)
        : (["filter:category:character", "filter:category:don"] as const)),
    ],
    rest: predicateRest === "." ? "" : predicateRest,
  };
}

const parseCharacterAlternative = (
  text: string,
): { readonly predicateText: string } | undefined => {
  const charactersFirst =
    /^Characters? or DON!! cards?\b\s*(?<rest>.*)$/iu.exec(text);
  if (charactersFirst !== null) {
    return { predicateText: charactersFirst.groups?.["rest"]?.trim() ?? "" };
  }

  const donFirst = /^DON!! cards? or (?<characters>.+)$/iu.exec(text);
  const characterText = donFirst?.groups?.["characters"]?.trim();
  if (characterText === undefined) {
    return undefined;
  }
  return { predicateText: characterText };
};
