import type { Cardinality, CardFilter, Target } from "@optcg/types";

import { parseUpToCardinality } from "../../cardinality/index.js";
import { parseCardFilterPredicates } from "../../filters/index.js";
import type { ParseInput, PrimitiveEvidence } from "../../types.js";
import {
  leaderOrCharacterFilterWithPredicates,
  normalizeTargetRest,
} from "./shared.js";
import type { FieldTargetParseResult } from "./types.js";

export function parseYourLeaderTarget(
  input: ParseInput,
): FieldTargetParseResult | undefined {
  const typedMatch =
    /^your \{(?<type>[^}]+)\} type Leader\b\s*(?<rest>.*)$/i.exec(input.text);
  const type = typedMatch?.groups?.["type"]?.trim();
  if (type !== undefined && type.length > 0) {
    return {
      target: {
        type: "all",
        zone: "leaderArea",
        player: "self",
        filter: { categories: ["leader"], typesAny: [type] },
      },
      evidence: ["target:yourLeader", "filter:type", "filter:category:leader"],
      rest: typedMatch?.groups?.["rest"]?.trim() ?? "",
    };
  }

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

  const match = /^(?:your|this) Leader\b\s*(?<rest>.*)$/i.exec(input.text);
  if (match === null) {
    return undefined;
  }

  return {
    target: { type: "myLeader" },
    evidence: ["target:yourLeader"],
    rest: match.groups?.["rest"]?.trim() ?? "",
  };
}

export function parseYourSelectedLeaderTarget(
  input: ParseInput,
): FieldTargetParseResult | undefined {
  const match =
    /^of your\s+(?<targetText>.+?)\s+(?<rest>gains?\b[\s\S]*)$/iu.exec(
      input.text,
    );
  const targetText = match?.groups?.["targetText"]?.trim();
  if (targetText === undefined || targetText.length === 0) {
    return undefined;
  }

  const parsed = parseSelectedLeaderFilter(targetText);
  if (parsed === undefined) {
    return undefined;
  }

  return {
    target: {
      type: "chooseFromZones",
      request: {
        timing: "onResolution",
        chooser: "self",
        player: "self",
        zones: ["leaderArea"],
        min: 0,
        max: 1,
        allowFewerIfUnavailable: true,
        visibility: "public",
        filter: parsed.filter,
      },
    },
    evidence: [
      "target:yourLeader",
      "player:self",
      "filter:category:leader",
      ...parsed.evidence,
    ],
    rest: normalizeTargetRest(match?.groups?.["rest"] ?? ""),
  };
}

function parseSelectedLeaderFilter(text: string):
  | {
      readonly filter: CardFilter;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  const namedMatch =
    /^\[(?<name>[^\]]+)\]\s+Leader\b\s*(?<predicates>.*)$/iu.exec(text);
  const name = namedMatch?.groups?.["name"]?.trim();
  if (name !== undefined && name.length > 0) {
    return withSelectedLeaderPredicates(
      { categories: ["leader"], names: [name] },
      ["filter:name"],
      namedMatch?.groups?.["predicates"] ?? "",
    );
  }

  const typedMatch =
    /^\{(?<type>[^}]+)\}\s+type\s+Leader\b\s*(?<predicates>.*)$/iu.exec(text);
  const type = typedMatch?.groups?.["type"]?.trim();
  if (type !== undefined && type.length > 0) {
    return withSelectedLeaderPredicates(
      { categories: ["leader"], typesAny: [type] },
      ["filter:type"],
      typedMatch?.groups?.["predicates"] ?? "",
    );
  }

  const leaderMatch = /^Leader\b\s*(?<predicates>.*)$/iu.exec(text);
  if (leaderMatch === null) {
    return undefined;
  }
  const predicateText = leaderMatch.groups?.["predicates"] ?? "";
  if (predicateText.trim().length === 0) {
    return undefined;
  }

  return withSelectedLeaderPredicates(
    { categories: ["leader"] },
    [],
    predicateText,
  );
}

function withSelectedLeaderPredicates(
  baseFilter: CardFilter,
  baseEvidence: readonly PrimitiveEvidence[],
  predicateText: string,
):
  | {
      readonly filter: CardFilter;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined {
  const trimmed = predicateText.trim();
  if (trimmed.length === 0) {
    return { filter: baseFilter, evidence: baseEvidence };
  }

  const predicates = parseCardFilterPredicates(
    { text: trimmed },
    { powerSemantics: "current" },
  );
  if (predicates === undefined || predicates.rest.trim().length > 0) {
    return undefined;
  }

  return {
    filter: { ...baseFilter, ...predicates.filter },
    evidence: [...baseEvidence, ...predicates.evidence],
  };
}

export function parseYourLeaderOrCharacterCardsTarget(
  input: ParseInput,
): FieldTargetParseResult | undefined {
  const typedMatch =
    /^of your\s+(?<predicateText>.+?Leader or Character cards?\b.*)$/i.exec(
      input.text,
    );
  const typedPredicateText = typedMatch?.groups?.["predicateText"]?.trim();
  if (typedPredicateText !== undefined && typedPredicateText.length > 0) {
    const predicates = parseCardFilterPredicates(
      { text: typedPredicateText },
      { powerSemantics: "current" },
    );
    if (predicates !== undefined) {
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
            filter: predicates.filter,
          },
        },
        evidence: [
          "target:yourLeaderOrCharacters",
          "player:self",
          ...predicates.evidence,
        ],
        rest: predicates.rest.trim(),
      };
    }
  }

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
  const match =
    /^of your \[(?<name>[^\]]+)\](?:\s+cards?\b)?\s*(?<rest>.*)$/i.exec(
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

export function parseYourCharactersOrNamedCardsTarget(
  input: ParseInput,
): FieldTargetParseResult | undefined {
  const match =
    /^of your Characters?(?: cards?)?\s+or\s+\[(?<name>[^\]]+)\](?:\s+cards?)?\s*(?<rest>.*)$/iu.exec(
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
        filter: {
          anyOf: [{ categories: ["character"] }, { names: [nameText] }],
        },
      },
    },
    evidence: [
      "target:yourCharacters",
      "target:yourNamedCards",
      "player:self",
      "filter:anyOf",
      "filter:category:character",
      "filter:name",
    ],
    rest: normalizeTargetRest(match?.groups?.["rest"] ?? ""),
  };
}

export function parseCompoundYourCharactersTarget(
  input: ParseInput,
  cardinality: Cardinality,
): FieldTargetParseResult | undefined {
  const first = parseYourCharactersTarget(input);
  const rightMatch = /^or\s+(?<right>.+)$/i.exec(first?.rest ?? "");
  const rightText = rightMatch?.groups?.["right"];
  if (first === undefined || rightText === undefined) {
    return undefined;
  }

  const secondCardinality = parseUpToCardinality({ text: rightText });
  if (
    secondCardinality === undefined ||
    !isSameCardinality(cardinality, secondCardinality.cardinality)
  ) {
    return undefined;
  }

  const second = parseYourCharactersTarget({ text: secondCardinality.rest });
  const firstFilter = extractYourCharacterChooseFilter(first.target);
  const secondFilter = extractYourCharacterChooseFilter(second?.target);
  if (
    first.target?.type !== "choose" ||
    firstFilter === undefined ||
    second === undefined ||
    secondFilter === undefined
  ) {
    return undefined;
  }

  return {
    target: {
      ...first.target,
      request: {
        ...first.target.request,
        filter: {
          categories: ["character"],
          anyOf: [
            withoutCharacterCategory(firstFilter),
            withoutCharacterCategory(secondFilter),
          ],
        },
      },
    },
    evidence: [
      ...first.evidence,
      "filter:anyOf",
      ...secondCardinality.evidence,
      ...second.evidence,
    ],
    rest: normalizeTargetRest(second.rest),
  };
}

export function parseYourCharactersTarget(
  input: ParseInput,
): FieldTargetParseResult | undefined {
  const namedCharacterMatch =
    /^of your \[(?<name>[^\]]+)\] Characters?\b\s*(?<rest>.*)$/i.exec(
      input.text,
    );
  const nameText = namedCharacterMatch?.groups?.["name"]?.trim();
  const restText = namedCharacterMatch?.groups?.["rest"];
  if (nameText !== undefined && nameText.length > 0) {
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
          filter: { categories: ["character"], names: [nameText] },
        },
      },
      evidence: [
        "target:yourCharacters",
        "player:self",
        "filter:category:character",
        "filter:name",
      ],
      rest: normalizeTargetRest(restText ?? ""),
    };
  }

  const bareMatch = /^of your Characters?\b\s*(?<rest>.*)$/i.exec(input.text);
  if (bareMatch !== null) {
    const predicateText = bareMatch.groups?.["rest"]?.trim() ?? "";
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
      rest: normalizeTargetRest(predicates?.rest ?? predicateText),
    };
  }

  const typedMatch =
    /^of your\s+(?<predicates>.+?)\s+Characters?\b\s*(?<rest>.*)$/i.exec(
      input.text,
    );
  if (typedMatch !== null) {
    const predicateText = typedMatch.groups?.["predicates"]?.trim();
    if (predicateText === undefined || predicateText.length === 0) {
      return undefined;
    }
    const restText = typedMatch.groups?.["rest"]?.trim() ?? "";
    const predicates = parseCardFilterPredicates(
      { text: `${predicateText} Characters ${restText}`.trim() },
      { powerSemantics: "current" },
    );
    if (predicates === undefined) {
      return undefined;
    }
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
          filter: { categories: ["character"], ...predicates.filter },
        },
      },
      evidence: [
        "target:yourCharacters",
        "player:self",
        "filter:category:character",
        ...predicates.evidence,
      ],
      rest: normalizeTargetRest(predicates.rest),
    };
  }

  return undefined;
}

const isSameCardinality = (left: Cardinality, right: Cardinality): boolean =>
  left.mode === right.mode && left.min === right.min && left.max === right.max;

const extractYourCharacterChooseFilter = (
  target: Target | undefined,
): CardFilter | undefined => {
  if (
    target?.type !== "choose" ||
    target.request.player !== "self" ||
    target.request.zone !== "characterArea"
  ) {
    return undefined;
  }

  return target.request.filter;
};

const withoutCharacterCategory = (filter: CardFilter): CardFilter => {
  const { categories, ...rest } = filter;
  void categories;
  return rest;
};
