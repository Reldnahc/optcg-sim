import type { Condition } from "@optcg/types";

import { parseKeyword } from "../keywords/index.js";
import { parseThisCharacterTarget } from "../targets/index.js";
import type { InstructionParseResult, ParseInput } from "../types.js";

export interface ContinuousInstructionContext {
  readonly condition: Condition;
}

export type ContinuousInstructionParser = (
  input: ParseInput,
  context: ContinuousInstructionContext,
) => InstructionParseResult | undefined;

export const thisCharacterKeywordGrantPrimitive = {
  primitiveId: "instruction:giveKeyword",
  childPrimitiveIds: [
    "target:thisCharacter",
    "keyword:anySupported",
    "duration:whileConditionTrue",
  ],
} as const;

export const parseThisCharacterKeywordGrantInstruction: ContinuousInstructionParser =
  (input) => {
    const target = parseThisCharacterTarget({
      text: input.text,
      allowImplicit: true,
    });
    if (target === undefined) {
      return undefined;
    }

    const actionMatch = /^gains\s+(?<rest>.*)$/i.exec(target.rest);
    const keywordText = actionMatch?.groups?.["rest"];
    if (keywordText === undefined) {
      return undefined;
    }

    const keyword = parseKeyword({ text: keywordText });
    if (keyword === undefined || keyword.rest.length > 0) {
      return undefined;
    }

    return {
      effect: {
        type: "giveKeyword",
        target: { type: "self" },
        keyword: keyword.keyword,
        duration: { type: "permanent" },
      },
      evidence: [
        "instruction:giveKeyword",
        ...target.evidence,
        ...keyword.evidence,
        "duration:whileConditionTrue",
      ],
      rest: "",
    };
  };
