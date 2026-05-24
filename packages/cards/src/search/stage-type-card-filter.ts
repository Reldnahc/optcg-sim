import type { CardFilter } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface StageTypeCardFilterParseResult {
  readonly filter: CardFilter;
  readonly rest: string;
  readonly evidence: readonly PrimitiveEvidence[];
}

export function parseStageTypeCardFilter(
  input: ParseInput,
): StageTypeCardFilterParseResult | undefined {
  return parseCardFilterPredicates(input);
}
