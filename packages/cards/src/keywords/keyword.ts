import type { Keyword } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface KeywordParseResult {
  readonly keyword: Keyword;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export const keywordPrimitive = {
  primitiveId: "keyword:anySupported",
  matches: [{ id: "bracketed-supported-keyword" }],
} as const;

export function parseKeyword(
  input: ParseInput,
): KeywordParseResult | undefined {
  const match = /^\[(?<keyword>[^\]]+)\]\.?\s*(?<rest>.*)$/i.exec(input.text);
  const keyword = parseSupportedKeyword(match?.groups?.["keyword"]);
  if (keyword === undefined) {
    return undefined;
  }

  return {
    keyword,
    evidence: ["keyword:anySupported"],
    rest: match?.groups?.["rest"]?.trim() ?? "",
  };
}

function parseSupportedKeyword(
  printed: string | undefined,
): Keyword | undefined {
  if (printed === undefined) {
    return undefined;
  }

  switch (printed.trim().toLowerCase()) {
    case "blocker":
      return "blocker";
    case "banish":
      return "banish";
    case "rush":
      return "rush";
    case "rush:character":
    case "rush character":
      return "rushCharacter";
    case "double attack":
      return "doubleAttack";
    case "unblockable":
      return "unblockable";
    default:
      return undefined;
  }
}
