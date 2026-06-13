import type { CardFilter, Target } from "@optcg/types";

import { parseAllCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface AllFieldTargetParseResult {
  readonly target: Target;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export function parseAllFieldTarget(
  input: ParseInput,
): AllFieldTargetParseResult | undefined {
  const cardinality = parseAllCardinality(input);
  if (cardinality === undefined) {
    return undefined;
  }

  const ownership = parseFieldTargetOwnership(cardinality.rest);
  if (ownership === undefined) {
    return undefined;
  }

  const namedCards = parseNamedCardsFilter(ownership.rest);
  if (namedCards !== undefined) {
    return {
      target: {
        type: "all",
        zone: "characterArea",
        player: ownership.player,
        filter: namedCards.filter,
      },
      evidence: [
        ...cardinality.evidence,
        ...ownership.evidence,
        "zone:characterArea",
        ...namedCards.evidence,
      ],
      rest: namedCards.rest,
    };
  }

  const mixedNameAndType = parseNamedOrTypeCharactersFilter(ownership.rest);
  if (mixedNameAndType !== undefined) {
    return {
      target: {
        type: "all",
        zone: "characterArea",
        player: ownership.player,
        filter: mixedNameAndType.filter,
      },
      evidence: [
        ...cardinality.evidence,
        ...ownership.evidence,
        "zone:characterArea",
        ...mixedNameAndType.evidence,
      ],
      rest: mixedNameAndType.rest,
    };
  }

  const predicates = parseCardFilterPredicates(
    { text: ownership.rest },
    { powerSemantics: "current" },
  );
  if (predicates === undefined) {
    return undefined;
  }

  return {
    target: {
      type: "all",
      zone: "characterArea",
      player: ownership.player,
      filter: predicates.filter,
    },
    evidence: [
      ...cardinality.evidence,
      ...ownership.evidence,
      "zone:characterArea",
      ...predicates.evidence,
    ],
    rest: predicates.rest,
  };
}

function parseNamedOrTypeCharactersFilter(text: string):
  | {
      readonly filter: CardFilter;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: string;
    }
  | undefined {
  const match =
    /^\[(?<name>[^\]]+)\]\s+(?:and|or)\s+\{(?<type>[^}]+)\}\s+type\s+Characters?\b\s*(?<rest>.*)$/iu.exec(
      text,
    );
  const name = match?.groups?.["name"]?.trim();
  const type = match?.groups?.["type"]?.trim();
  if (
    name === undefined ||
    name.length === 0 ||
    type === undefined ||
    type.length === 0
  ) {
    return undefined;
  }

  return {
    filter: {
      categories: ["character"],
      anyOf: [{ names: [name] }, { typesAny: [type] }],
    },
    evidence: [
      "filter:category:character",
      "filter:anyOf",
      "filter:name",
      "filter:type",
    ],
    rest: match?.groups?.["rest"]?.trim() ?? "",
  };
}

function parseNamedCardsFilter(text: string):
  | {
      readonly filter: CardFilter;
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: string;
    }
  | undefined {
  const match =
    /^(?<names>\[[^\]]+\](?:\s+and\s+\[[^\]]+\])+)\s+cards?\b\s*(?<rest>.*)$/iu.exec(
      text,
    );
  if (match === null) {
    return undefined;
  }
  const namesText = match.groups?.["names"];
  if (namesText === undefined) {
    return undefined;
  }

  const names = [...namesText.matchAll(/\[(?<name>[^\]]+)\]/giu)]
    .map((nameMatch) => nameMatch.groups?.["name"]?.trim())
    .filter((name): name is string => name !== undefined && name.length > 0);
  if (names.length < 2) {
    return undefined;
  }

  return {
    filter: { anyOf: names.map((name) => ({ names: [name] })) },
    evidence: ["filter:anyOf", ...names.map(() => "filter:name" as const)],
    rest: match.groups?.["rest"]?.trim() ?? "",
  };
}

function parseFieldTargetOwnership(text: string):
  | {
      readonly player: "self" | "opponent";
      readonly evidence: readonly PrimitiveEvidence[];
      readonly rest: string;
    }
  | undefined {
  const opponentMatch = /^of your opponent's\s+(?<rest>.+)$/i.exec(text);
  const opponentRest = opponentMatch?.groups?.["rest"];
  if (opponentRest !== undefined) {
    return {
      player: "opponent",
      evidence: ["player:opponent"],
      rest: opponentRest.trim(),
    };
  }

  const match = /^of your\s+(?<rest>.+)$/i.exec(text);
  const rest = match?.groups?.["rest"];
  if (rest === undefined) {
    return undefined;
  }

  return {
    player: "self",
    evidence: ["player:self"],
    rest: rest.trim(),
  };
}
