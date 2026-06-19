import type { CardFilter, Duration, Effect } from "@optcg/types";

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
import { parseContinuousModifierListForTarget } from "./modifier-list.js";
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
    if (parsed === undefined || !hasExplicitDurationEvidence(parsed.evidence)) {
      return undefined;
    }
    return parsed;
  };

const hasExplicitDurationEvidence = (
  evidence: readonly PrimitiveEvidence[],
): boolean =>
  evidence.some(
    (primitive) =>
      primitive.startsWith("duration:") &&
      primitive !== "duration:whileSourceOnField" &&
      primitive !== "duration:whileConditionTrue",
  );

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
  const namedAndFilteredCharactersGain =
    parseNamedCardAndAllCharactersStatGainInstruction(input, context);
  if (namedAndFilteredCharactersGain !== undefined) {
    return namedAndFilteredCharactersGain;
  }

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

const parseNamedCardAndAllCharactersStatGainInstruction: ContinuousInstructionParser =
  (input, context) => {
    const match =
      /^your \[(?<name>[^\]]+)\] and all (?:of )?your (?<predicate>Characters?\b.+?) gain (?<modifier>.+)$/iu.exec(
        input.text,
      );
    const name = match?.groups?.["name"]?.trim();
    const predicateText = match?.groups?.["predicate"];
    const modifierText = match?.groups?.["modifier"];
    if (
      name === undefined ||
      name.length === 0 ||
      predicateText === undefined ||
      modifierText === undefined
    ) {
      return undefined;
    }

    const predicates = parseCardFilterPredicates(
      { text: predicateText },
      { powerSemantics: "current" },
    );
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

    const namedFilter: CardFilter = { names: [name] };
    const characterFilter = withCategory(predicates.filter, "character");
    const effects: Effect[] = [
      {
        type: "modifyPower",
        target: {
          type: "all",
          player: "self",
          zone: "leaderArea",
          filter: withCategory(namedFilter, "leader"),
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
          filter: {
            categories: ["character"],
            anyOf: [withCategory(namedFilter, "character"), characterFilter],
          },
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
        "filter:name",
        "filter:anyOf",
        "filter:category:leader",
        "filter:category:character",
        ...predicates.evidence,
        ...modifier.evidence,
        duration.evidence,
      ],
      rest: "",
    };
  };

const parseAllLeaderAndCharacterStatGainInstruction: ContinuousInstructionParser =
  (input, context) => {
    const match =
      /^(?:All of )?your (?<predicate>.+ (?:Leader and Character cards?|Leaders and Characters)) gain (?<modifier>.+)$/iu.exec(
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

  return parseContinuousModifierListForTarget({
    target: { type: "self" },
    targetEvidence: target.evidence,
    text: modifierText,
    context,
  });
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
