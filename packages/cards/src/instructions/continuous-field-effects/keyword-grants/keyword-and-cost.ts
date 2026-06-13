import type { Target } from "@optcg/types";

import { parseKeyword } from "../../../keywords/index.js";
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

export const parseKeywordAndPositiveCostGrant = ({
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
    /^(?<keyword>\[[^\]]+\])\s+and\s+\+(?<cost>[1-9]\d*)\s+cost\b(?<rest>.*)$/iu.exec(
      text,
    );
  const keywordText = match?.groups?.["keyword"];
  const costText = match?.groups?.["cost"];
  const restText = match?.groups?.["rest"]?.trim() ?? "";
  if (keywordText === undefined || costText === undefined) {
    return undefined;
  }

  const keyword = parseKeyword({ text: keywordText });
  if (keyword === undefined || keyword.rest.length > 0) {
    return undefined;
  }

  const explicitDuration =
    restText.length === 0 || restText === "."
      ? undefined
      : parseFieldEffectDuration({ text: restText });
  if (
    restText.length > 0 &&
    restText !== "." &&
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
            type: "modifyCost",
            player: "self",
            target,
            value: Number.parseInt(costText, 10),
            duration,
          },
        },
      ],
    },
    evidence: [
      "instruction:giveKeyword",
      "instruction:modifyCost",
      ...targetEvidence,
      ...keyword.evidence,
      "modifier:positiveCost",
      ...durationEvidence,
    ],
    rest: "",
  };
};
