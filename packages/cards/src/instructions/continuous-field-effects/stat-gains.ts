import type {
  CardFilter,
  Duration,
  DynamicNumberValue,
  Effect,
} from "@optcg/types";

import { parseCardFilterPredicates } from "../../filters/index.js";
import {
  allPowerModifierParsers,
  parseModifierFromSet,
  parsePositivePowerModifier,
} from "../../modifiers/index.js";
import {
  parseAllFieldTarget,
  parseThisCharacterTarget,
  parseYourLeaderTarget,
} from "../../targets/index.js";
import type { InstructionParser, PrimitiveEvidence } from "../../types.js";
import {
  continuousDuration,
  continuousDurationEvidence,
  parseFieldEffectDuration,
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

export const parseExplicitDurationAllFieldStatGainInstruction: InstructionParser =
  (input) => {
    const parsed = parseAllFieldStatGainInstruction(input, {
      condition: undefined,
    });
    if (
      parsed === undefined ||
      !parsed.evidence.includes("duration:thisTurn")
    ) {
      return undefined;
    }
    return parsed;
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

  const modifier = parseModifierFromSet(
    { text: modifierText },
    allPowerModifierParsers,
  );
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
  const leaderAndAllCharactersGain =
    parseYourLeaderAndAllCharactersStatGainInstruction(input, context);
  if (leaderAndAllCharactersGain !== undefined) {
    return leaderAndAllCharactersGain;
  }

  const leaderAndCharacterGain = parseAllLeaderAndCharacterStatGainInstruction(
    input,
    context,
  );
  if (leaderAndCharacterGain !== undefined) {
    return leaderAndCharacterGain;
  }

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

  const modifier = parseModifierFromSet(
    { text: modifierText ?? target.rest },
    allPowerModifierParsers,
  );
  if (modifier === undefined) {
    return undefined;
  }
  const duration = parseStatGainDuration(modifier.rest, context);
  if (duration === undefined) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyPower",
      target: target.target,
      value: modifier.value,
      duration: duration.duration,
    },
    evidence: [
      "instruction:modifyPower",
      ...target.evidence,
      ...modifier.evidence,
      duration.evidence,
    ],
    rest: "",
  };
};

const parseYourLeaderAndAllCharactersStatGainInstruction: ContinuousInstructionParser =
  (input, context) => {
    const match =
      /^Your Leader and all of your Characters gain (?<modifier>.+)$/iu.exec(
        input.text,
      );
    const modifierText = match?.groups?.["modifier"];
    if (modifierText === undefined) {
      return undefined;
    }

    const modifier = parseModifierFromSet(
      { text: modifierText },
      allPowerModifierParsers,
    );
    if (modifier === undefined) {
      return undefined;
    }
    const duration = parseStatGainDuration(modifier.rest, context);
    if (duration === undefined) {
      return undefined;
    }

    return {
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "modifyPower",
              target: { type: "myLeader" },
              value: modifier.value,
              duration: duration.duration,
            },
          },
          {
            connector: "always",
            effect: {
              type: "modifyPower",
              target: {
                type: "all",
                player: "self",
                zone: "characterArea",
                filter: { categories: ["character"] },
              },
              value: modifier.value,
              duration: duration.duration,
            },
          },
        ],
      },
      evidence: [
        "instruction:modifyPower",
        "target:yourLeader",
        "cardinality:all",
        "player:self",
        "zone:characterArea",
        "filter:category:character",
        ...modifier.evidence,
        duration.evidence,
      ],
      rest: "",
    };
  };

const parseAllLeaderAndCharacterStatGainInstruction: ContinuousInstructionParser =
  (input, context) => {
    const match =
      /^All of your (?<predicate>.+ Leader and Character cards?) gain (?<modifier>.+)$/iu.exec(
        input.text,
      );
    const predicateText = match?.groups?.["predicate"];
    const modifierText = match?.groups?.["modifier"];
    if (predicateText === undefined || modifierText === undefined) {
      return undefined;
    }

    const predicates = parseCardFilterPredicates({ text: predicateText });
    if (predicates === undefined || predicates.rest.length > 0) {
      return undefined;
    }
    const modifier = parseModifierFromSet(
      { text: modifierText },
      allPowerModifierParsers,
    );
    if (modifier === undefined) {
      return undefined;
    }
    const duration = parseStatGainDuration(modifier.rest, context);
    if (duration === undefined) {
      return undefined;
    }

    const leaderFilter = withCategory(predicates.filter, "leader");
    const characterFilter = withCategory(predicates.filter, "character");
    const effects: Effect[] = [
      {
        type: "modifyPower",
        target: {
          type: "all",
          player: "self",
          zone: "leaderArea",
          filter: leaderFilter,
        },
        value: modifier.value,
        duration: duration.duration,
      },
      {
        type: "modifyPower",
        target: {
          type: "all",
          player: "self",
          zone: "characterArea",
          filter: characterFilter,
        },
        value: modifier.value,
        duration: duration.duration,
      },
    ];

    return {
      effect: {
        type: "sequence",
        effects: effects.map((effect) => ({ connector: "always", effect })),
      },
      evidence: [
        "instruction:modifyPower",
        "cardinality:all",
        "player:self",
        "zone:leaderArea",
        "zone:characterArea",
        ...predicates.evidence,
        "filter:category:leader",
        "filter:category:character",
        ...modifier.evidence,
        duration.evidence,
      ],
      rest: "",
    };
  };

const withCategory = (
  filter: CardFilter,
  category: "leader" | "character",
): CardFilter => ({
  ...filter,
  categories: [category],
  ...(filter.anyOf === undefined
    ? {}
    : {
        anyOf: filter.anyOf.map((branch) => ({
          ...branch,
          categories: branch.categories ?? [category],
        })),
      }),
});

const parseStatGainDuration = (
  rest: string,
  context: {
    readonly condition: Parameters<ContinuousInstructionParser>[1]["condition"];
  },
):
  | {
      readonly duration: Duration;
      readonly evidence: PrimitiveEvidence;
    }
  | undefined => {
  const normalized = rest.replace(/\.$/u, "").trim();
  if (normalized.length === 0) {
    return {
      duration: continuousDuration(context.condition),
      evidence: continuousDurationEvidence(context.condition),
    };
  }
  const explicit = parseFieldEffectDuration({ text: normalized });
  const evidence = explicit?.evidence[0];
  return explicit?.duration !== undefined &&
    explicit.rest.length === 0 &&
    evidence !== undefined
    ? { duration: explicit.duration, evidence }
    : undefined;
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

  const effects: Effect[] = [];
  const instructionEvidence: PrimitiveEvidence[] = [];
  const modifierEvidence: PrimitiveEvidence[] = [];
  const durationEvidence: PrimitiveEvidence[] = [];

  for (const part of parts) {
    const power = parseModifierFromSet({ text: part }, allPowerModifierParsers);
    if (power !== undefined) {
      const parsedDuration = parseStatGainDuration(power.rest, context);
      if (parsedDuration === undefined) {
        return undefined;
      }
      effects.push({
        type: "modifyPower",
        target: { type: "self" },
        value:
          dynamicValue === undefined
            ? power.value
            : { ...dynamicValue.value, multiplier: power.value },
        duration: parsedDuration.duration,
      });
      instructionEvidence.push("instruction:modifyPower");
      modifierEvidence.push(...power.evidence);
      durationEvidence.push(parsedDuration.evidence);
      if (dynamicValue !== undefined) {
        modifierEvidence.push(...dynamicValue.evidence);
      }
      continue;
    }

    const cost = /^\+(?<value>[1-9]\d*) cost\b(?<rest>.*)$/iu.exec(part);
    const costValueText = cost?.groups?.["value"];
    const costRestText = cost?.groups?.["rest"]?.trim() ?? "";
    if (costValueText !== undefined) {
      const parsedDuration = parseStatGainDuration(costRestText, context);
      if (parsedDuration === undefined) {
        return undefined;
      }
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
        duration: parsedDuration.duration,
      });
      instructionEvidence.push("instruction:modifyCost");
      modifierEvidence.push("modifier:positiveCost");
      durationEvidence.push(parsedDuration.evidence);
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
  const evidence = [
    ...new Set<PrimitiveEvidence>([
      ...instructionEvidence,
      ...target.evidence,
      ...modifierEvidence,
      ...durationEvidence,
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
  const restedDonMatch =
    /^(?<statText>.+?)\s+for every (?<per>[1-9]\d*) of your rested DON!! cards\.?$/iu.exec(
      text,
    );
  const restedDonStatText = restedDonMatch?.groups?.["statText"]?.trim();
  const restedDonPerText = restedDonMatch?.groups?.["per"];
  if (
    restedDonStatText !== undefined &&
    restedDonStatText.length > 0 &&
    restedDonPerText !== undefined
  ) {
    return {
      statText: restedDonStatText,
      value: {
        type: "countMatchingZoneCards",
        player: "self",
        zone: "costArea",
        filter: { categories: ["don"], state: "rested" },
        per: Number.parseInt(restedDonPerText, 10),
        multiplier: 1,
      },
      evidence: [
        "value:dynamic:matchingZoneCards",
        "zone:costArea",
        "filter:category:don",
        "filter:state:rested",
      ],
    };
  }

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
