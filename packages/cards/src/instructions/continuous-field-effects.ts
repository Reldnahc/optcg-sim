import type { Condition } from "@optcg/types";

import { parseKeyword } from "../keywords/index.js";
import { parsePositivePowerModifier } from "../modifiers/index.js";
import {
  parseThisCharacterTarget,
  parseYourLeaderTarget,
} from "../targets/index.js";
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

export const yourLeaderConditionalPowerPrimitive = {
  primitiveId: "instruction:modifyPower",
  childPrimitiveIds: [
    "target:yourLeader",
    "modifier:positivePower",
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

export const parseYourLeaderConditionalPowerInstruction: ContinuousInstructionParser =
  (input, context) => {
    const target = parseYourLeaderTarget(input);
    if (target?.target === undefined) {
      return undefined;
    }

    const actionMatch = /^gains\s+(?<rest>.*)$/i.exec(target.rest);
    const modifierText = actionMatch?.groups?.["rest"];
    if (modifierText === undefined) {
      return undefined;
    }

    const modifier = parsePositivePowerModifier({ text: modifierText });
    if (
      modifier === undefined ||
      (modifier.rest.length > 0 && modifier.rest !== ".")
    ) {
      return undefined;
    }

    return {
      effect: {
        type: "modifyPower",
        target: target.target,
        value: modifier.value,
        duration: {
          type: "whileConditionTrue",
          condition: context.condition,
        },
      },
      evidence: [
        "instruction:modifyPower",
        ...target.evidence,
        ...modifier.evidence,
        "duration:whileConditionTrue",
      ],
      rest: "",
    };
  };
