import type { Target } from "@optcg/types";

import { parseKeyword } from "../../../keywords/index.js";
import { parsePositivePowerModifier } from "../../../modifiers/index.js";
import type {
  InstructionParseResult,
  PrimitiveEvidence,
} from "../../../types.js";
import {
  continuousDuration,
  continuousDurationEvidence,
  parseFieldEffectDuration,
  type ContinuousInstructionContext,
} from "../shared.js";

export const parseKeywordAndPositivePowerGrant = ({
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
  const match =
    /^(?<keyword>\[[^\]]+\])\s+and\s+(?<power>\+\d+\s+power\b.*)$/iu.exec(text);
  const keywordText = match?.groups?.["keyword"];
  const powerText = match?.groups?.["power"];
  if (keywordText === undefined || powerText === undefined) {
    return undefined;
  }

  const keyword = parseKeyword({ text: keywordText });
  const modifier = parsePositivePowerModifier({ text: powerText });
  if (
    keyword === undefined ||
    keyword.rest.length > 0 ||
    modifier === undefined
  ) {
    return undefined;
  }

  const explicitDuration =
    modifier.rest.length === 0
      ? undefined
      : parseFieldEffectDuration({ text: modifier.rest });
  if (
    modifier.rest.length > 0 &&
    modifier.rest !== "." &&
    explicitDuration === undefined
  ) {
    return undefined;
  }
  if (explicitDuration !== undefined && explicitDuration.rest.length > 0) {
    return undefined;
  }

  const duration =
    explicitDuration?.duration ?? continuousDuration(context.condition);
  const durationEvidence = explicitDuration?.evidence ?? [
    continuousDurationEvidence(context.condition),
  ];

  return {
    effect: {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: {
            type: "giveKeyword",
            target,
            keyword: keyword.keyword,
            duration,
          },
        },
        {
          connector: "always",
          effect: {
            type: "modifyPower",
            target,
            value: modifier.value,
            duration,
          },
        },
      ],
    },
    evidence: [
      "instruction:giveKeyword",
      "instruction:modifyPower",
      ...targetEvidence,
      ...keyword.evidence,
      ...modifier.evidence,
      ...durationEvidence,
    ],
    rest: "",
  };
};
