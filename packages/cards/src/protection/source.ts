import type { CardCategory } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface ProtectionSource {
  readonly kind: "battle" | "cardEffect";
  readonly controllerRelation: "eitherController" | "opponentControlled";
  readonly cardCategories?: readonly CardCategory[];
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

export const effectsProtectionSourcePrimitive = {
  primitiveId: "protectionSource:effects",
  matches: [
    {
      id: "by-effects",
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
  const categorySource = parseOpponentCardCategoryEffectsSource(input.text);
  if (categorySource !== undefined) {
    return categorySource;
  }

  if (/^by your opponent's effects\.?$/i.test(input.text)) {
    return {
      source: {
        kind: "cardEffect",
        controllerRelation: "opponentControlled",
      },
      evidence: ["protectionSource:opponentEffects"],
      rest: "",
    };
  }

  if (/^by effects\.?$/i.test(input.text)) {
    return {
      source: {
        kind: "cardEffect",
        controllerRelation: "eitherController",
      },
      evidence: ["protectionSource:effects"],
      rest: "",
    };
  }

  const battleMatch = /^in battle\b\s*(?<rest>.*)$/i.exec(input.text);
  if (battleMatch !== null) {
    return {
      source: {
        kind: "battle",
        controllerRelation: "eitherController",
      },
      evidence: ["protectionSource:battle"],
      rest: trimTrailingPeriod(battleMatch.groups?.["rest"]?.trim() ?? ""),
    };
  }

  return undefined;
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
  const categories = categoriesText
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
    source: {
      kind: "cardEffect",
      controllerRelation: "opponentControlled",
      cardCategories: categories,
    },
    evidence: [
      "protectionSource:opponentCardCategoryEffects",
      ...categories.map((category) => categoryEvidenceByCategory[category]),
    ],
    rest: "",
  };
}

function trimTrailingPeriod(value: string): string {
  return value.endsWith(".") ? value.slice(0, -1) : value;
}
