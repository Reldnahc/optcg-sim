import type { Condition } from "@optcg/types";

import { parseKeyword } from "../keywords/index.js";
import { parsePositivePowerModifier } from "../modifiers/index.js";
import {
  parseAllFieldTarget,
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

export const setBasePowerPrimitive = {
  primitiveId: "instruction:setBasePower",
  childPrimitiveIds: [
    "cardinality:all",
    "filter:type",
    "filter:category:character",
    "value:basePower:positiveInteger",
    "duration:whileConditionTrue",
  ],
} as const;

export const parseSetBasePowerInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const match =
    /^set the base power of (?<target>.+) to (?<value>[1-9]\d*)\.?$/i.exec(
      input.text,
    );
  const targetText = match?.groups?.["target"];
  const valueText = match?.groups?.["value"];
  if (targetText === undefined || valueText === undefined) {
    return undefined;
  }

  const target = parseAllFieldTarget({ text: targetText });
  if (target === undefined || target.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "setBasePower",
      target: target.target,
      value: Number.parseInt(valueText, 10),
      duration: {
        type: "whileConditionTrue",
        condition: context.condition,
      },
    },
    evidence: [
      "instruction:setBasePower",
      ...target.evidence,
      "value:basePower:positiveInteger",
      "duration:whileConditionTrue",
    ],
    rest: "",
  };
};

export const parseThisCharacterKeywordGrantInstruction: ContinuousInstructionParser =
  (input, context) => {
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
        duration: {
          type: "whileConditionTrue",
          condition: context.condition,
        },
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
