import type { CardFilter } from "@optcg/types";

import { parseCardFilterPredicates } from "../filters/index.js";
import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface TypeCardFilterParseResult {
  readonly filter: CardFilter;
  readonly rest: string;
  readonly evidence: readonly PrimitiveEvidence[];
}

export function parseTypeCardFilter(
  input: ParseInput,
): TypeCardFilterParseResult | undefined {
  return parseCardFilterPredicates(input);
}
