import type { DynamicNumberValue, Effect } from "@optcg/types";

import { parseCardFilterPredicates } from "../../filters/index.js";
import {
  parseNegativePowerModifier,
  parsePositivePowerModifier,
} from "../../modifiers/index.js";
import {
  parseAllFieldTarget,
  parseThisCharacterTarget,
  parseYourLeaderTarget,
} from "../../targets/index.js";
import type { PrimitiveEvidence } from "../../types.js";
import {
  continuousDuration,
  continuousDurationEvidence,
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
    const allFieldStatGain = parseAllFieldStatGainInstruction(input, context);
    if (allFieldStatGain !== undefined) {
      return allFieldStatGain;
    }

    const leaderStatGain = parseLeaderStatGainInstruction(input, context);
    if (leaderStatGain !== undefined) {
      return leaderStatGain;
    }

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
        continuousDurationEvidence(context.condition),
      ],
      rest: "",
    };
  };

const parseLeaderStatGainInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const match =
    /^give\s+(?<target>this Leader|your Leader)\s+(?<modifier>.+)$/iu.exec(
      input.text,
    );
  const targetText = match?.groups?.["target"];
  const modifierText = match?.groups?.["modifier"];
  if (targetText === undefined || modifierText === undefined) {
    return undefined;
  }

  const target = parseYourLeaderTarget({ text: targetText });
  if (target?.target === undefined) {
    return undefined;
  }

  const modifier =
    parsePositivePowerModifier({ text: modifierText }) ??
    parseNegativePowerModifier({ text: modifierText });
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
      continuousDurationEvidence(context.condition),
    ],
    rest: "",
  };
};

const parseAllFieldStatGainInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const directGain = /^(?<target>All of .+?) gains?\s+(?<modifier>.+)$/iu.exec(
    input.text,
  );
  const giveTargetText = /^give\s+(?<target>.+)$/iu.exec(input.text)?.groups?.[
    "target"
  ];
  const targetText = directGain?.groups?.["target"] ?? giveTargetText;
  const modifierText = directGain?.groups?.["modifier"];
  if (targetText === undefined) {
    return undefined;
  }

  const target = parseAllFieldTarget({ text: targetText });
  if (target === undefined) {
    return undefined;
  }

  const modifier =
    parsePositivePowerModifier({ text: modifierText ?? target.rest }) ??
    parseNegativePowerModifier({ text: modifierText ?? target.rest });
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
      continuousDurationEvidence(context.condition),
    ],
    rest: "",
  };
};

const parseThisCharacterStatGainInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const distinctNamePower = parseThisCharacterDistinctNamePowerInstruction(
    input,
    context,
  );
  if (distinctNamePower !== undefined) {
    return distinctNamePower;
  }

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

  const dynamicValue = parseTrashBatchDynamicValue(modifierText);
  const statText = dynamicValue?.statText ?? modifierText;
  const parts = statText
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
        value:
          dynamicValue === undefined
            ? power.value
            : { ...dynamicValue.value, multiplier: power.value },
        duration,
      });
      instructionEvidence.push("instruction:modifyPower");
      modifierEvidence.push(...power.evidence);
      if (dynamicValue !== undefined) {
        modifierEvidence.push(...dynamicValue.evidence);
      }
      continue;
    }

    const cost = /^\+(?<value>[1-9]\d*) cost$/iu.exec(part);
    const costValueText = cost?.groups?.["value"];
    if (costValueText !== undefined) {
      effects.push({
        type: "modifyCost",
        player: "self",
        target: { type: "self" },
        value:
          dynamicValue === undefined
            ? Number.parseInt(costValueText, 10)
            : {
                ...dynamicValue.value,
                multiplier: Number.parseInt(costValueText, 10),
              },
        duration,
      });
      instructionEvidence.push("instruction:modifyCost");
      modifierEvidence.push("modifier:positiveCost");
      if (dynamicValue !== undefined) {
        modifierEvidence.push(...dynamicValue.evidence);
      }
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

const parseTrashBatchDynamicValue = (
  text: string,
):
  | {
      readonly statText: string;
      readonly value: Extract<
        DynamicNumberValue,
        { type: "countMatchingZoneCards" }
      >;
      readonly evidence: readonly PrimitiveEvidence[];
    }
  | undefined => {
  const match =
    /^(?<statText>.+?)\s+for every (?<per>[1-9]\d*) (?<filter>cards?|.+?) in your trash\.?$/iu.exec(
      text,
    );
  const statText = match?.groups?.["statText"]?.trim();
  const perText = match?.groups?.["per"];
  const filterText = match?.groups?.["filter"]?.trim();
  if (
    statText === undefined ||
    statText.length === 0 ||
    perText === undefined ||
    filterText === undefined
  ) {
    return undefined;
  }

  const evidence: PrimitiveEvidence[] = [
    "value:dynamic:matchingZoneCards",
    "zone:trash",
  ];
  const filter =
    /^cards?$/iu.test(filterText) || filterText.length === 0
      ? undefined
      : parseCardFilterPredicates({ text: filterText });
  if (filter === undefined && !/^cards?$/iu.test(filterText)) {
    return undefined;
  }
  if (filter !== undefined) {
    if (filter.rest.trim().length > 0) {
      return undefined;
    }
    evidence.push(...filter.evidence);
  }

  return {
    statText,
    value: {
      type: "countMatchingZoneCards",
      player: "self",
      zone: "trash",
      ...(filter === undefined ? {} : { filter: filter.filter }),
      per: Number.parseInt(perText, 10),
      multiplier: 1,
    },
    evidence,
  };
};

const parseThisCharacterDistinctNamePowerInstruction: ContinuousInstructionParser =
  (input, context) => {
    const match =
      /^This Character gains \+(?<value>[1-9]\d*) power for each of your (?<filter>.+?) with a different card name\.?$/iu.exec(
        input.text,
      );
    const valueText = match?.groups?.["value"];
    const filterText = match?.groups?.["filter"];
    if (valueText === undefined || filterText === undefined) {
      return undefined;
    }

    const filter = parseCardFilterPredicates(
      { text: filterText },
      { powerSemantics: "printed" },
    );
    if (filter === undefined || filter.rest.trim().length > 0) {
      return undefined;
    }

    return {
      effect: {
        type: "modifyPower",
        target: { type: "self" },
        value: {
          type: "countDistinctMatchingFieldNames",
          player: "self",
          zone: "characterArea",
          filter: { ...filter.filter, custom: "differentNames" },
          multiplier: Number.parseInt(valueText, 10),
        },
        duration: continuousDuration(context.condition),
      },
      evidence: [
        "instruction:modifyPower",
        "target:thisCharacter",
        "value:dynamic:distinctFieldNames",
        ...filter.evidence,
        "filter:differentNames",
        context.condition === undefined
          ? "duration:whileSourceOnField"
          : "duration:whileConditionTrue",
      ],
      rest: "",
    };
  };
