import type { CardFilter, Target } from "@optcg/types";

import type { PrimitiveEvidence } from "../../types.js";

export interface FieldTargetParseResult {
  readonly target?: Target;
  readonly filter?: CardFilter;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}
