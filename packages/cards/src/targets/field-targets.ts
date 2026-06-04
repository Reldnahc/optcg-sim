import type { CardFilter, Target } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface FieldTargetParseResult {
  readonly target?: Target;
  readonly filter?: CardFilter;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

const leaderOrCharacterFilterWithPredicates = (
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

export const opponentCharactersTargetPrimitive = {
  primitiveId: "target:opponentCharacters",
  matches: [{ id: "of-your-opponents-characters" }],
} as const;

export const opponentStagesTargetPrimitive = {
  primitiveId: "target:opponentStages",
  matches: [{ id: "of-your-opponents-stages" }],
} as const;

export const opponentLeaderOrCharactersTargetPrimitive = {
  primitiveId: "target:opponentLeaderOrCharacters",
  matches: [{ id: "of-your-opponents-leader-or-character-cards" }],
} as const;

export const opponentCharactersOrDonCardsTargetPrimitive = {
  primitiveId: "target:opponentCharactersOrDonCards",
  matches: [{ id: "of-your-opponents-characters-or-don-cards" }],
} as const;

export const yourLeaderTargetPrimitive = {
  primitiveId: "target:yourLeader",
  matches: [{ id: "your-leader" }],
} as const;

export const yourLeaderOrCharactersTargetPrimitive = {
  primitiveId: "target:yourLeaderOrCharacters",
  matches: [{ id: "of-your-leader-or-character-cards" }],
} as const;

export const yourNamedCardsTargetPrimitive = {
  primitiveId: "target:yourNamedCards",
  matches: [{ id: "of-your-bracketed-name-cards" }],
} as const;

export const yourCharactersTargetPrimitive = {
  primitiveId: "target:yourCharacters",
  matches: [{ id: "of-your-characters" }],
} as const;

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

export function parseYourLeaderTarget(
  input: ParseInput,
): FieldTargetParseResult | undefined {
  const namedMatch = /^your \[(?<name>[^\]]+)\] Leader\b\s*(?<rest>.*)$/i.exec(
    input.text,
  );
  const name = namedMatch?.groups?.["name"]?.trim();
  if (name !== undefined && name.length > 0) {
    return {
      target: {
        type: "all",
        zone: "leaderArea",
        player: "self",
        filter: { categories: ["leader"], names: [name] },
      },
      evidence: ["target:yourLeader", "filter:name", "filter:category:leader"],
      rest: namedMatch?.groups?.["rest"]?.trim() ?? "",
    };
  }

  const match = /^your Leader\b\s*(?<rest>.*)$/i.exec(input.text);
  if (match === null) {
    return undefined;
  }

  return {
    target: { type: "myLeader" },
    evidence: ["target:yourLeader"],
    rest: match.groups?.["rest"]?.trim() ?? "",
  };
}

export function parseYourLeaderOrCharacterCardsTarget(
  input: ParseInput,
): FieldTargetParseResult | undefined {
  const match = /^of your Leader or Character cards?\b\s*(?<rest>.*)$/i.exec(
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
        player: "self",
        zones: ["leaderArea", "characterArea"],
        min: 0,
        max: 1,
        allowFewerIfUnavailable: true,
        visibility: "public",
        filter: leaderOrCharacterFilterWithPredicates(predicates),
      },
    },
    evidence: [
      "target:yourLeaderOrCharacters",
      "player:self",
      "filter:category:leader",
      "filter:category:character",
      ...(predicates?.evidence ?? []),
    ],
    rest: predicates?.rest.trim() ?? predicateText,
  };
}

export function parseYourNamedCardsTarget(
  input: ParseInput,
): FieldTargetParseResult | undefined {
  const match = /^of your \[(?<name>[^\]]+)\] cards?\b\s*(?<rest>.*)$/i.exec(
    input.text,
  );
  const nameText = match?.groups?.["name"]?.trim();
  if (nameText === undefined || nameText.length === 0) {
    return undefined;
  }

  return {
    target: {
      type: "chooseFromZones",
      request: {
        timing: "onResolution",
        chooser: "self",
        player: "self",
        zones: ["leaderArea", "characterArea"],
        min: 0,
        max: 1,
        allowFewerIfUnavailable: true,
        visibility: "public",
        filter: { names: [nameText] },
      },
    },
    evidence: ["target:yourNamedCards", "player:self", "filter:name"],
    rest: match?.groups?.["rest"]?.trim() ?? "",
  };
}

export function parseYourCharactersTarget(
  input: ParseInput,
): FieldTargetParseResult | undefined {
  const match = /^of your Characters?\b\s*(?<rest>.*)$/i.exec(input.text);
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
      type: "choose",
      request: {
        timing: "onResolution",
        chooser: "self",
        player: "self",
        zone: "characterArea",
        min: 0,
        max: 1,
        allowFewerIfUnavailable: true,
        visibility: "public",
        filter: { categories: ["character"], ...(predicates?.filter ?? {}) },
      },
    },
    evidence: [
      "target:yourCharacters",
      "player:self",
      "filter:category:character",
      ...(predicates?.evidence ?? []),
    ],
    rest: predicates?.rest.trim() ?? predicateText,
  };
}
