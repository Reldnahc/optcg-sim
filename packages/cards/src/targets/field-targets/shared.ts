import type { CardFilter } from "@optcg/types";

import type { parseCardFilterPredicates } from "../../filters/index.js";

export const leaderOrCharacterFilterWithPredicates = (
  predicates: ReturnType<typeof parseCardFilterPredicates> | undefined,
): CardFilter => {
  if (predicates === undefined) {
    return { categories: ["leader", "character"] };
  }
  return {
    anyOf: [
      { categories: ["leader"] },
      {
        ...predicates.filter,
        categories: ["character"],
      },
    ],
  };
};

export const normalizeTargetRest = (rest: string): string =>
  rest.replace(/^,\s*/u, "").trim();
