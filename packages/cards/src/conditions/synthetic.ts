import type { Condition } from "@optcg/types";

import type {
  ConditionParser,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";

export function syntheticConditionParser(options: {
  readonly text: string;
  readonly condition: Condition;
  readonly evidence: readonly PrimitiveEvidence[];
}): ConditionParser {
  return (input: ParseInput) => {
    if (input.text !== options.text) {
      return undefined;
    }

    return {
      condition: options.condition,
      evidence: options.evidence,
      rest: "",
    };
  };
}
