import type { CardFilter } from "@optcg/types";

import type {
  EntryPointParseResult,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";
import { parseCardFilterPredicates } from "../filters/index.js";

export function parseRulesStartOfGameEntryPoint(
  input: ParseInput,
): EntryPointParseResult | undefined {
  const match =
    /^Under the rules of this game, you cannot include (?<restriction>.+) in your deck and at the start of the game,\s+(?<rest>.+)$/i.exec(
      input.text,
    );
  const restrictionText = match?.groups?.["restriction"];
  const rest = match?.groups?.["rest"];
  if (restrictionText === undefined || rest === undefined) {
    return undefined;
  }

  const restriction = parseDeckRestriction(restrictionText);
  if (restriction === undefined) {
    return undefined;
  }

  return {
    node: {
      type: "entryPoint",
      trigger: { type: "startOfGame" },
      category: "auto",
    },
    evidence: [
      "entry:startOfGame",
      "sourcePresence:noSourceRequired",
      "deckRestriction:ignored",
      "deckRestriction:eventCostGte",
      ...restriction.evidence,
    ],
    rest: rest.trim(),
  };
}

function parseDeckRestriction(
  text: string,
): { readonly evidence: readonly PrimitiveEvidence[] } | undefined {
  const eventMatch = /^Events?\s+(?<predicates>.+)$/i.exec(text);
  const predicateText = eventMatch?.groups?.["predicates"];
  if (predicateText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates({
    text: `Event ${predicateText}`,
  });
  if (
    predicates === undefined ||
    predicates.rest.length > 0 ||
    predicates.filter.categories?.[0] !== "event" ||
    !isGteCostPredicate(predicates.filter.cost)
  ) {
    return undefined;
  }

  return {
    evidence: predicates.evidence,
  };
}

function isGteCostPredicate(cost: CardFilter["cost"]): boolean {
  return cost !== undefined && "op" in cost && cost.op === "gte";
}
