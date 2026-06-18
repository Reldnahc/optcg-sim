import type { Effect } from "@optcg/types";

import type { ExpressionParseResult } from "../../types.js";

export const replacementOwnerDeckBottomSelectionId =
  "selected:owner-deck-bottom" as const;

export interface ReplacementTriggerParseResult {
  readonly when: Extract<Effect, { type: "replacement" }>["when"];
  readonly instead: Effect;
  readonly optional: boolean;
  readonly evidence: ExpressionParseResult["evidence"];
}

export interface ReplacementInsteadParseResult {
  readonly effect: Effect;
  readonly optional?: boolean;
  readonly evidence: ExpressionParseResult["evidence"];
}
