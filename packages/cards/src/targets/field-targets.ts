import type { Target } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface FieldTargetParseResult {
  readonly target?: Target;
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
  const match = /^of your opponent's Characters?\b\s*(?<rest>.*)$/i.exec(
    input.text,
  );
  if (match === null) {
    return undefined;
  }

  return {
    evidence: ["player:opponent", "target:opponentCharacters"],
    rest: match.groups?.["rest"]?.trim() ?? "",
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
