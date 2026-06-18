import type { Target } from "@optcg/types";

import type { ParseInput, PrimitiveEvidence } from "../types.js";

export interface TargetParseInput extends ParseInput {
  readonly allowImplicit?: boolean;
}

export interface TargetParseResult {
  readonly target: Target;
  readonly evidence: readonly PrimitiveEvidence[];
  readonly rest: string;
}

export const thisCharacterTargetPrimitive = {
  primitiveId: "target:thisCharacter",
  matches: [
    {
      id: "this-character",
    },
  ],
} as const;

export function parseThisCharacterTarget(
  input: TargetParseInput,
): TargetParseResult | undefined {
  const explicitMatch = /^this Character\b\s*/i.exec(input.text);
  if (explicitMatch !== null) {
    return {
      target: { type: "self" },
      evidence: ["target:thisCharacter"],
      rest: input.text.slice(explicitMatch[0].length).trim(),
    };
  }

  const thisCardMatch = /^this card\b\s*/iu.exec(input.text);
  if (thisCardMatch !== null) {
    return {
      target: { type: "self" },
      evidence: ["target:thisCard"],
      rest: input.text.slice(thisCardMatch[0].length).trim(),
    };
  }

  if (input.allowImplicit === true) {
    return {
      target: { type: "self" },
      evidence: ["target:thisCharacter"],
      rest: input.text.trim(),
    };
  }

  return undefined;
}
