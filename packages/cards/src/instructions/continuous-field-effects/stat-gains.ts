import type { Effect } from "@optcg/types";

import {
  parseNegativePowerModifier,
  parsePositivePowerModifier,
} from "../../modifiers/index.js";
import {
  parseThisCharacterTarget,
  parseYourLeaderTarget,
} from "../../targets/index.js";
import type { PrimitiveEvidence } from "../../types.js";
import {
  continuousDuration,
  type ContinuousInstructionParser,
} from "./shared.js";

export const yourLeaderConditionalPowerPrimitive = {
  primitiveId: "instruction:modifyPower",
  childPrimitiveIds: [
    "target:yourLeader",
    "modifier:positivePower",
    "duration:whileConditionTrue",
  ],
} as const;

export const parseYourLeaderConditionalPowerInstruction: ContinuousInstructionParser =
  (input, context) => {
    const selfStatGain = parseThisCharacterStatGainInstruction(input, context);
    if (selfStatGain !== undefined) {
      return selfStatGain;
    }

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
        duration: continuousDuration(context.condition),
      },
      evidence: [
        "instruction:modifyPower",
        ...target.evidence,
        ...modifier.evidence,
        context.condition === undefined
          ? "duration:whileSourceOnField"
          : "duration:whileConditionTrue",
      ],
      rest: "",
    };
  };

const parseThisCharacterStatGainInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const text = input.text.replace(
    /^give this Character\b/i,
    "this Character gains",
  );
  const target = parseThisCharacterTarget({
    text,
    allowImplicit: true,
  });
  if (target === undefined) {
    return undefined;
  }

  const actionMatch = /^gains\s+(?<rest>.*)$/i.exec(target.rest);
  const modifierText = actionMatch?.groups?.["rest"];
  if (modifierText === undefined) {
    return undefined;
  }

  const parts = modifierText
    .replace(/\.$/u, "")
    .split(/\s+and\s+/iu)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return undefined;
  }

  const duration = continuousDuration(context.condition);
  const effects: Effect[] = [];
  const instructionEvidence: PrimitiveEvidence[] = [];
  const modifierEvidence: PrimitiveEvidence[] = [];

  for (const part of parts) {
    const power =
      parsePositivePowerModifier({ text: part }) ??
      parseNegativePowerModifier({ text: part });
    if (power !== undefined && power.rest.length === 0) {
      effects.push({
        type: "modifyPower",
        target: { type: "self" },
        value: power.value,
        duration,
      });
      instructionEvidence.push("instruction:modifyPower");
      modifierEvidence.push(...power.evidence);
      continue;
    }

    const cost = /^\+(?<value>[1-9]\d*) cost$/iu.exec(part);
    const costValueText = cost?.groups?.["value"];
    if (costValueText !== undefined) {
      effects.push({
        type: "modifyCost",
        player: "self",
        target: { type: "self" },
        value: Number.parseInt(costValueText, 10),
        duration,
      });
      instructionEvidence.push("instruction:modifyCost");
      modifierEvidence.push("modifier:positiveCost");
      continue;
    }

    return undefined;
  }

  const effect =
    effects.length === 1
      ? effects[0]
      : {
          type: "sequence" as const,
          effects: effects.map((part) => ({
            connector: "always" as const,
            effect: part,
          })),
        };
  if (effect === undefined) {
    return undefined;
  }
  const durationEvidence: PrimitiveEvidence =
    context.condition === undefined
      ? "duration:whileSourceOnField"
      : "duration:whileConditionTrue";
  const evidence = [
    ...new Set<PrimitiveEvidence>([
      ...instructionEvidence,
      ...target.evidence,
      ...modifierEvidence,
      durationEvidence,
    ]),
  ];

  return {
    effect,
    evidence,
    rest: "",
  };
};
