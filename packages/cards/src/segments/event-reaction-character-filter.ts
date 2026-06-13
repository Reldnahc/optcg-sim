import type { CardFilter } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import type { ExpressionParseResult } from "../types.js";

export const parseCharacterFilter = (
  text: string,
):
  | { filter: CardFilter; evidence: ExpressionParseResult["evidence"] }
  | undefined => {
  const normalized = normalizeCharacterFilterText(text);
  const parsed = parseCardFilterPredicates(
    { text: normalized },
    { powerSemantics: "printed" },
  );
  if (parsed === undefined) {
    if (!/^Character(?: card)?$/iu.test(normalized)) {
      return undefined;
    }
    return {
      filter: { categories: ["character"] },
      evidence: ["filter:category:character"],
    };
  }
  if (
    parsed.rest.length > 0 ||
    parsed.filter.categories?.includes("character") !== true
  ) {
    return undefined;
  }
  return { filter: parsed.filter, evidence: parsed.evidence };
};

export const containsCharacterCategoryText = (text: string): boolean =>
  /\bCharacters?\b|\bCharacter cards?\b/iu.test(text);

const normalizeCharacterFilterText = (text: string): string =>
  text.trim().replace(/^(?:a|an)\s+(?=Character(?: card)?\b)/iu, "");
