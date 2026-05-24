import type { CardFilter } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface TypeCardFilterParseResult {
  readonly filter: CardFilter;
  readonly rest: string;
  readonly evidence: readonly PrimitiveEvidence[];
}

export function parseTypeCardFilter(
  input: ParseInput,
): TypeCardFilterParseResult | undefined {
  const match = /^(?<type>\{[^}]+\} type card)(?<rest>.*)$/i.exec(input.text);
  const typeText = match?.groups?.["type"];
  const rest = match?.groups?.["rest"];
  if (typeText === undefined || rest === undefined) {
    return undefined;
  }

  const typeName = /^\{(?<name>[^}]+)\} type card$/i.exec(typeText)?.groups?.[
    "name"
  ];
  if (typeName === undefined || typeName.trim().length === 0) {
    return undefined;
  }

  return {
    filter: { typesAny: [typeName.trim()] },
    rest,
    evidence: ["filter:type"],
  };
}
