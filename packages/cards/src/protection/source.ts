import type { CardCategory, CardFilter } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface ProtectionSource {
  readonly kind: "battle" | "cardEffect";
  readonly controllerRelation:
    | "eitherController"
    | "opponentControlled"
    | "selfControlled";
  readonly cardCategories?: readonly CardCategory[];
  readonly cardFilter?: CardFilter;
}

export interface ProtectionSourceParseResult {
  readonly source: ProtectionSource;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export const opponentEffectsProtectionSourcePrimitive = {
  primitiveId: "protectionSource:opponentEffects",
  matches: [
    {
      id: "by-your-opponents-effects",
    },
  ],
} as const;

export const opponentCardCategoryEffectsProtectionSourcePrimitive = {
  primitiveId: "protectionSource:opponentCardCategoryEffects",
  matches: [
    {
      id: "by-your-opponents-card-category-effects",
    },
  ],
} as const;

export const opponentCardFilterEffectsProtectionSourcePrimitive = {
  primitiveId: "protectionSource:opponentCardFilterEffects",
  matches: [
    {
      id: "by-effects-of-your-opponents-filtered-cards",
    },
  ],
} as const;

export const cardFilterEffectsProtectionSourcePrimitive = {
  primitiveId: "protectionSource:cardFilterEffects",
  matches: [
    {
      id: "by-effects-of-filtered-cards",
    },
  ],
} as const;

export const effectsProtectionSourcePrimitive = {
  primitiveId: "protectionSource:effects",
  matches: [
    {
      id: "by-effects",
    },
  ],
} as const;

export const selfEffectsProtectionSourcePrimitive = {
  primitiveId: "protectionSource:selfEffects",
  matches: [
    {
      id: "by-your-effects",
    },
  ],
} as const;

export const battleProtectionSourcePrimitive = {
  primitiveId: "protectionSource:battle",
  matches: [
    {
      id: "in-battle",
    },
  ],
} as const;

export function parseProtectionSource(
  input: ParseInput,
): ProtectionSourceParseResult | undefined {
  const filteredSource = parseOpponentCardFilterEffectsSource(input.text);
  if (filteredSource !== undefined) {
    return filteredSource;
  }

  const genericFilteredSource = parseCardFilterEffectsSource(input.text);
  if (genericFilteredSource !== undefined) {
    return genericFilteredSource;
  }

  const categorySource = parseOpponentCardCategoryEffectsSource(input.text);
  if (categorySource !== undefined) {
    return categorySource;
  }

  const opponentEffectsMatch =
    /^by your opponent's effects\b\s*(?<rest>.*)$/i.exec(input.text);
  if (opponentEffectsMatch !== null) {
    return {
      source: {
        kind: "cardEffect",
        controllerRelation: "opponentControlled",
      },
      evidence: ["protectionSource:opponentEffects"],
      rest: trimTrailingPeriod(opponentEffectsMatch.groups?.["rest"] ?? ""),
    };
  }

  const selfEffectsMatch = /^by your effects\b\s*(?<rest>.*)$/i.exec(
    input.text,
  );
  if (selfEffectsMatch !== null) {
    return {
      source: {
        kind: "cardEffect",
        controllerRelation: "selfControlled",
      },
      evidence: ["protectionSource:selfEffects"],
      rest: trimTrailingPeriod(selfEffectsMatch.groups?.["rest"] ?? ""),
    };
  }

  const effectsMatch = /^by effects\b\s*(?<rest>.*)$/i.exec(input.text);
  if (effectsMatch !== null) {
    return {
      source: {
        kind: "cardEffect",
        controllerRelation: "eitherController",
      },
      evidence: ["protectionSource:effects"],
      rest: trimTrailingPeriod(effectsMatch.groups?.["rest"] ?? ""),
    };
  }

  const battleMatch = /^in battle\b\s*(?<rest>.*)$/i.exec(input.text);
  if (battleMatch !== null) {
    const rest = trimTrailingPeriod(battleMatch.groups?.["rest"]?.trim() ?? "");
    const categories = parseBattleSourceCategories(rest);
    if (categories === undefined) {
      const filter = parseBattleSourceFilter(rest);
      if (filter !== undefined) {
        return {
          source: buildProtectionSourceWithFilter({
            kind: "battle",
            controllerRelation: "eitherController",
            cardFilter: filter.filter,
          }),
          evidence: ["protectionSource:battle", ...filter.evidence],
          rest: "",
        };
      }
      return {
        source: {
          kind: "battle",
          controllerRelation: "eitherController",
        },
        evidence: ["protectionSource:battle"],
        rest,
      };
    }
    return {
      source: {
        kind: "battle",
        controllerRelation: "eitherController",
        cardCategories: categories.categories,
      },
      evidence: ["protectionSource:battle", ...categories.evidence],
      rest: "",
    };
  }

  return undefined;
}

function parseBattleSourceFilter(text: string):
  | {
      readonly filter: CardFilter;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  const match = /^by (?<filter>.+)$/iu.exec(text);
  const filterText = match?.groups?.["filter"];
  if (filterText === undefined) {
    return undefined;
  }
  const filter = parseCardFilterPredicates({ text: filterText });
  if (filter === undefined || filter.rest.length > 0) {
    return undefined;
  }
  return { filter: filter.filter, evidence: filter.evidence };
}

function parseOpponentCardFilterEffectsSource(
  text: string,
): ProtectionSourceParseResult | undefined {
  return parseCardFilterEffectsSourceWithPattern(text, {
    pattern: /^by effects of your opponent's (?<filter>.+?)\.?$/i,
    controllerRelation: "opponentControlled",
    evidence: ["protectionSource:opponentCardFilterEffects", "player:opponent"],
  });
}

function parseCardFilterEffectsSource(
  text: string,
): ProtectionSourceParseResult | undefined {
  return parseCardFilterEffectsSourceWithPattern(text, {
    pattern: /^by effects of (?<filter>.+?)\.?$/i,
    controllerRelation: "eitherController",
    evidence: ["protectionSource:cardFilterEffects"],
  });
}

function parseBattleSourceCategories(text: string):
  | {
      readonly categories: readonly ProtectionSourceCardCategory[];
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  const match = /^by (?<categories>.+)$/i.exec(text);
  const categoriesText = match?.groups?.["categories"];
  if (categoriesText === undefined) {
    return undefined;
  }
  return parseProtectionSourceCategoryList(categoriesText);
}

const categoryByText = new Map<string, CardCategory>([
  ["leader", "leader"],
  ["leaders", "leader"],
  ["character", "character"],
  ["characters", "character"],
  ["event", "event"],
  ["events", "event"],
  ["stage", "stage"],
  ["stages", "stage"],
]);

type ProtectionSourceCardCategory = Exclude<CardCategory, "don">;

const categoryEvidenceByCategory: Record<
  ProtectionSourceCardCategory,
  PrimitiveEvidence
> = {
  character: "sourceCategory:character",
  event: "sourceCategory:event",
  leader: "sourceCategory:leader",
  stage: "sourceCategory:stage",
};

function parseOpponentCardCategoryEffectsSource(
  text: string,
): ProtectionSourceParseResult | undefined {
  const match = /^by your opponent's (?<categories>.+?) effects\.?$/i.exec(
    text,
  );
  const categoriesText = match?.groups?.["categories"];
  if (categoriesText === undefined) {
    return undefined;
  }
  const categories = parseProtectionSourceCategoryList(categoriesText);
  if (categories === undefined) {
    return undefined;
  }

  return {
    source: {
      kind: "cardEffect",
      controllerRelation: "opponentControlled",
      cardCategories: categories.categories,
    },
    evidence: [
      "protectionSource:opponentCardCategoryEffects",
      ...categories.evidence,
    ],
    rest: "",
  };
}

function buildProtectionSourceWithFilter(options: {
  readonly kind: ProtectionSource["kind"];
  readonly controllerRelation: ProtectionSource["controllerRelation"];
  readonly cardFilter: CardFilter;
}): ProtectionSource {
  return {
    kind: options.kind,
    controllerRelation: options.controllerRelation,
    cardFilter: options.cardFilter,
    ...(options.cardFilter.categories === undefined
      ? {}
      : { cardCategories: options.cardFilter.categories }),
  };
}

function parseCardFilterEffectsSourceWithPattern(
  text: string,
  options: {
    readonly pattern: RegExp;
    readonly controllerRelation: ProtectionSource["controllerRelation"];
    readonly evidence: readonly PrimitiveEvidence[];
  },
): ProtectionSourceParseResult | undefined {
  const match = options.pattern.exec(text);
  const filterText = match?.groups?.["filter"];
  if (filterText === undefined) {
    return undefined;
  }

  const parsedFilter = parseCardFilterPredicates({ text: filterText });
  if (parsedFilter === undefined || parsedFilter.rest.length > 0) {
    return undefined;
  }

  return {
    source: buildProtectionSourceWithFilter({
      kind: "cardEffect",
      controllerRelation: options.controllerRelation,
      cardFilter: parsedFilter.filter,
    }),
    evidence: [...options.evidence, ...parsedFilter.evidence],
    rest: "",
  };
}

function parseProtectionSourceCategoryList(text: string):
  | {
      readonly categories: readonly ProtectionSourceCardCategory[];
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  const categories = text
    .split(/\s*(?:,|and)\s*/iu)
    .map((category) => categoryByText.get(category.trim().toLowerCase()))
    .filter(
      (category): category is ProtectionSourceCardCategory =>
        category !== undefined && category !== "don",
    );
  if (
    categories.length === 0 ||
    new Set(categories).size !== categories.length
  ) {
    return undefined;
  }

  return {
    categories,
    evidence: categories.map(
      (category) => categoryEvidenceByCategory[category],
    ),
  };
}

function trimTrailingPeriod(value: string): string {
  return value.endsWith(".") ? value.slice(0, -1) : value;
}
