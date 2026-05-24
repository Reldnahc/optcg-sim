import type { CardFilter } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface StageTypeCardFilterParseResult {
  readonly filter: CardFilter;
  readonly rest: string;
  readonly evidence: readonly PrimitiveEvidence[];
}

export function parseStageTypeCardFilter(
  input: ParseInput,
): StageTypeCardFilterParseResult | undefined {
  const match = /^(?<type>\{[^}]+\} type Stage card)(?<rest>.*)$/i.exec(
    input.text,
  );
  const typeText = match?.groups?.["type"];
  const rest = match?.groups?.["rest"];
  if (typeText === undefined || rest === undefined) {
    return undefined;
  }

  const typeName = /^\{(?<name>[^}]+)\} type Stage card$/i.exec(typeText)
    ?.groups?.["name"];
  if (typeName === undefined || typeName.trim().length === 0) {
    return undefined;
  }

  return {
    filter: { categories: ["stage"], typesAny: [typeName.trim()] },
    rest,
    evidence: ["filter:type", "filter:category:stage"],
  };
}
