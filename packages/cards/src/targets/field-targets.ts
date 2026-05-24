import type { CardFilter, Target } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface FieldTargetParseResult {
  readonly target?: Target;
  readonly filter?: CardFilter;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export const opponentCharactersTargetPrimitive = {
  primitiveId: "target:opponentCharacters",
  matches: [{ id: "of-your-opponents-characters" }],
} as const;

export const yourLeaderTargetPrimitive = {
  primitiveId: "target:yourLeader",
  matches: [{ id: "your-leader" }],
} as const;

export function parseOpponentCharactersTarget(
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
      : parseCardFilterPredicates({ text: targetText });
  if (
    predicates === undefined ||
    predicates.filter.categories?.[0] !== "character"
  ) {
    return undefined;
  }

  return {
    filter: predicates.filter,
    evidence: [
      "player:opponent",
      "target:opponentCharacters",
      ...predicates.evidence,
    ],
    rest: predicates.rest.trim(),
  };
}

export function parseYourLeaderTarget(
  input: ParseInput,
): FieldTargetParseResult | undefined {
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
