import type { Condition } from "@optcg/types";

import { parseFieldCardCountCondition } from "../../conditions/index.js";
import { parseCardFilterPredicates } from "../../filters/index.js";
import type { PrimitiveEvidence } from "../../types.js";
import {
  continuousDuration,
  continuousDurationEvidence,
  type ContinuousInstructionParser,
} from "./shared.js";

export const selfCannotAttackPrimitive = {
  primitiveId: "instruction:preventActivation",
  childPrimitiveIds: [
    "target:thisCard",
    "target:thisCharacter",
    "duration:whileSourceOnField",
    "duration:whileConditionTrue",
  ],
} as const;

export const parseSelfCannotAttackInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const unless = parseSelfCannotAttackUnlessInstruction(input, context);
  if (unless !== undefined) {
    return unless;
  }

  const match = /^This (?<subject>Leader|Character) cannot attack\.?$/i.exec(
    input.text,
  );
  const subject = match?.groups?.["subject"]?.toLowerCase();
  if (subject !== "leader" && subject !== "character") {
    return undefined;
  }

  return {
    effect: {
      type: "cannotAttack",
      target: { type: "self" },
      duration: continuousDuration(context.condition),
    },
    evidence: [
      "instruction:preventActivation",
      subject === "character" ? "target:thisCharacter" : "target:thisCard",
      continuousDurationEvidence(context.condition),
    ],
    rest: "",
  };
};

const combineConditions = (
  ...conditions: readonly (Condition | undefined)[]
): Condition | undefined => {
  const present = conditions.filter(
    (condition): condition is Condition => condition !== undefined,
  );
  if (present.length === 0) {
    return undefined;
  }
  if (present.length === 1) {
    return present[0];
  }
  return { type: "and", conditions: present };
};

const parseAnyPlayerFieldPresenceCondition = (
  text: string,
):
  | {
      readonly condition: Condition;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined => {
  const match = /^there (?:is|are)\s+(?<predicate>.+)$/iu.exec(text);
  const predicateText = match?.groups?.["predicate"]?.trim();
  if (predicateText === undefined) {
    return undefined;
  }

  const predicates = parseCardFilterPredicates(
    { text: predicateText.replace(/^(?:a|an)\s+/iu, "") },
    { powerSemantics: "current" },
  );
  if (predicates === undefined || predicates.rest.trim().length > 0) {
    return undefined;
  }

  return {
    condition: {
      type: "or",
      conditions: [
        {
          type: "fieldCount",
          player: "self",
          filter: predicates.filter,
          op: "gte",
          value: 1,
        },
        {
          type: "fieldCount",
          player: "opponent",
          filter: predicates.filter,
          op: "gte",
          value: 1,
        },
      ],
    },
    evidence: [
      "composition:conditionOr",
      "condition:fieldCount",
      "condition:opponentFieldCount",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "player:self",
      "player:opponent",
      ...predicates.evidence,
    ],
  };
};

const parseUnlessCondition = (
  text: string,
):
  | {
      readonly condition: Condition;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined => {
  const fieldCount = parseFieldCardCountCondition({ text });
  if (fieldCount !== undefined && fieldCount.rest.length === 0) {
    return { condition: fieldCount.condition, evidence: fieldCount.evidence };
  }
  return parseAnyPlayerFieldPresenceCondition(text);
};

const parseSelfCannotAttackUnlessInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const match =
    /^This (?<subject>Leader|Character) cannot attack unless (?<condition>.+?)\.?$/iu.exec(
      input.text,
    );
  const subject = match?.groups?.["subject"]?.toLowerCase();
  const conditionText = match?.groups?.["condition"]?.trim();
  if (
    (subject !== "leader" && subject !== "character") ||
    conditionText === undefined
  ) {
    return undefined;
  }

  const unlessCondition = parseUnlessCondition(conditionText);
  if (unlessCondition === undefined) {
    return undefined;
  }

  const activeCondition = combineConditions(context.condition, {
    type: "not",
    condition: unlessCondition.condition,
  });

  return {
    effect: {
      type: "cannotAttack",
      target: { type: "self" },
      duration: continuousDuration(activeCondition),
    },
    evidence: [
      "instruction:preventActivation",
      subject === "character" ? "target:thisCharacter" : "target:thisCard",
      ...unlessCondition.evidence,
      "composition:conditionNot",
      ...(context.condition === undefined
        ? []
        : (["composition:conditionAnd"] as const)),
      continuousDurationEvidence(activeCondition),
    ],
    rest: "",
  };
};
