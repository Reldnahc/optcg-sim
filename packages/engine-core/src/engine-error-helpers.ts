import type { EngineError } from "@optcg/types";

export const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];
