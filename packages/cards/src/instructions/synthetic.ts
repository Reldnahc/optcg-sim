import type { Effect } from "@optcg/types";

import type {
  InstructionParser,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";

export function syntheticInstructionParser(options: {
  readonly text: string;
  readonly effect: Effect;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly seen?: string[];
}): InstructionParser {
  return (input: ParseInput) => {
    options.seen?.push(input.text);
    if (input.text !== options.text) {
      return undefined;
    }

    return {
      effect: options.effect,
      evidence: options.evidence,
      rest: "",
    };
  };
}
