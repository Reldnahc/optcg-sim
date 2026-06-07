import type { Effect, Target } from "@optcg/types";

import { parseKeyword } from "../../../keywords/index.js";
import type {
  InstructionParseResult,
  PrimitiveEvidence,
} from "../../../types.js";
import {
  continuousDuration,
  continuousDurationEvidence,
  parseExplicitFieldEffectDuration,
  type ContinuousInstructionContext,
} from "../shared.js";

export const parseKeywordGrantForTarget = ({
  target,
  targetEvidence,
  text,
  context,
}: {
  readonly target: Target;
  readonly targetEvidence: readonly PrimitiveEvidence[];
  readonly text: string;
  readonly context: ContinuousInstructionContext;
}): InstructionParseResult | undefined => {
  const keyword = parseKeyword({ text });
  if (keyword === undefined) {
    return undefined;
  }
  const explicitDuration =
    keyword.rest.length === 0
      ? undefined
      : parseExplicitFieldEffectDuration({ text: keyword.rest });
  if (keyword.rest.length > 0 && explicitDuration === undefined) {
    return undefined;
  }
  if (explicitDuration !== undefined && explicitDuration.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "giveKeyword",
      target,
      keyword: keyword.keyword,
      duration:
        explicitDuration?.duration ?? continuousDuration(context.condition),
    },
    evidence: [
      "instruction:giveKeyword",
      ...targetEvidence,
      ...keyword.evidence,
      ...(explicitDuration?.evidence ?? [
        continuousDurationEvidence(context.condition),
      ]),
    ],
    rest: "",
  };
};

export const keywordSequence = (
  effects: readonly Effect[],
): Effect | undefined => {
  const first = effects[0];
  return effects.length === 0
    ? undefined
    : effects.length === 1
      ? first
      : {
          type: "sequence",
          effects: effects.map((effect) => ({
            connector: "always" as const,
            effect,
          })),
        };
};
