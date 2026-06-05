import type { Condition, Effect, Target } from "@optcg/types";

import {
  parseOpponentNextEndPhaseDuration,
  parseOpponentNextRefreshPhaseDuration,
  parseThisBattleDuration,
  parseThisTurnDuration,
} from "../durations/index.js";
import { parseUpToCardinality } from "../cardinality/index.js";
import { parseCardFilterPredicates } from "../filters/index.js";
import { parseKeyword } from "../keywords/index.js";
import { parsePositivePowerModifier } from "../modifiers/index.js";
import {
  parseAllFieldTarget,
  parseCompoundYourCharactersTarget,
  parseThisCharacterTarget,
  parseYourCharactersTarget,
  parseYourLeaderTarget,
} from "../targets/index.js";
import type {
  InstructionParseResult,
  InstructionParser,
  ParseInput,
  PrimitiveEvidence,
} from "../types.js";

export interface ContinuousInstructionContext {
  readonly condition: Condition | undefined;
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
    "duration:opponentNextEndPhase",
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

export const selfCannotAttackPrimitive = {
  primitiveId: "instruction:preventActivation",
  childPrimitiveIds: [
    "target:thisCard",
    "target:thisCharacter",
    "duration:whileSourceOnField",
    "duration:whileConditionTrue",
  ],
} as const;

type BasePowerTargetSubject = {
  readonly target: Target;
  readonly evidence: readonly PrimitiveEvidence[];
};

const setBasePowerEffect = (
  target: Target,
  value: number,
  duration: Extract<Effect, { type: "setBasePower" }>["duration"],
): Extract<Effect, { type: "setBasePower" }> => ({
  type: "setBasePower",
  target,
  value,
  duration,
});

const continuousDuration = (
  condition: Condition | undefined,
): Extract<
  Effect,
  { type: "modifyPower" | "giveKeyword" | "setBasePower" }
>["duration"] =>
  condition === undefined
    ? { type: "whileSourceOnField" }
    : { type: "whileConditionTrue", condition };

const continuousDurationEvidence = (
  condition: Condition | undefined,
): PrimitiveEvidence =>
  condition === undefined
    ? "duration:whileSourceOnField"
    : "duration:whileConditionTrue";

const parseExplicitFieldEffectDuration = (input: ParseInput) =>
  parseOpponentNextEndPhaseDuration(input) ??
  parseOpponentNextRefreshPhaseDuration(input) ??
  parseThisTurnDuration(input) ??
  parseThisBattleDuration(input);

const parseBasePowerSubject = (
  text: string,
): BasePowerTargetSubject | undefined => {
  const normalizedText = text.trim();
  if (/^your Leader(?:'s base power)?$/i.test(normalizedText)) {
    return {
      target: { type: "myLeader" },
      evidence: ["target:yourLeader"],
    };
  }

  const namedCardsMatch =
    /^All of your \[(?<name>[^\]]+)\] cards' base power$/i.exec(normalizedText);
  const name = namedCardsMatch?.groups?.["name"]?.trim();
  if (name !== undefined && name.length > 0) {
    return {
      target: {
        type: "all",
        zone: "characterArea",
        player: "self",
        filter: { categories: ["character"], names: [name] },
      },
      evidence: [
        "cardinality:all",
        "player:self",
        "zone:characterArea",
        "filter:name",
        "filter:category:character",
      ],
    };
  }

  if (/^this Character(?:'s base power)?$/i.test(normalizedText)) {
    return {
      target: { type: "self" },
      evidence: ["target:thisCharacter"],
    };
  }

  return undefined;
};

export const parseBasePowerBecomeInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const match =
    /^(?<targets>.+?) becomes? (?<value>[1-9]\d*)(?<durationText>.*)$/i.exec(
      input.text,
    );
  const targetsText = match?.groups?.["targets"];
  const valueText = match?.groups?.["value"];
  const durationText = match?.groups?.["durationText"]?.trim() ?? "";
  if (targetsText === undefined || valueText === undefined) {
    return undefined;
  }

  const value = Number.parseInt(valueText, 10);
  const subjects = targetsText
    .split(/\s+and\s+/i)
    .map((subject) => parseBasePowerSubject(subject));
  if (
    subjects.length === 0 ||
    subjects.some((subject) => subject === undefined)
  ) {
    return undefined;
  }

  const explicitDuration =
    durationText.length === 0 || durationText === "."
      ? undefined
      : parseExplicitFieldEffectDuration({ text: durationText });
  if (durationText.length > 0 && durationText !== ".") {
    if (explicitDuration === undefined || explicitDuration.rest.length > 0) {
      return undefined;
    }
  }
  const duration =
    explicitDuration?.duration ?? continuousDuration(context.condition);
  const durationEvidence = explicitDuration?.evidence ?? [
    continuousDurationEvidence(context.condition),
  ];

  const parsedSubjects = subjects as BasePowerTargetSubject[];
  const effects = parsedSubjects.map((subject) =>
    setBasePowerEffect(subject.target, value, duration),
  );
  const singleEffect = effects[0];
  if (singleEffect === undefined) {
    return undefined;
  }
  const effect: Effect =
    effects.length === 1
      ? singleEffect
      : {
          type: "sequence",
          effects: effects.map((sequenceEffect) => ({
            connector: "always" as const,
            effect: sequenceEffect,
          })),
        };

  return {
    effect,
    evidence: [
      "instruction:setBasePower",
      ...parsedSubjects.flatMap((subject) => subject.evidence),
      "value:basePower:positiveInteger",
      ...durationEvidence,
    ],
    rest: "",
  };
};

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
      duration: continuousDuration(context.condition),
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

export const parseHandCounterSetInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const match =
    /^The counter of all of your (?<filter>.+?) in your hand becomes \+(?<value>[1-9]\d*)\.?$/i.exec(
      input.text,
    );
  const filterText = match?.groups?.["filter"];
  const valueText = match?.groups?.["value"];
  if (filterText === undefined || valueText === undefined) {
    return undefined;
  }
  const parsedFilter = parseCardFilterPredicates({
    text: filterText.replace(/\s+cards?$/i, ""),
  });
  if (parsedFilter === undefined || parsedFilter.rest.length > 0) {
    return undefined;
  }

  return {
    effect: {
      type: "modifyCounter",
      player: "self",
      sourceZone: "hand",
      filter: parsedFilter.filter,
      value: Number.parseInt(valueText, 10),
      duration: continuousDuration(context.condition),
    },
    evidence: [
      "instruction:modifyCounter",
      "player:self",
      "zone:hand",
      ...parsedFilter.evidence,
      "modifier:positiveCounter",
      continuousDurationEvidence(context.condition),
    ],
    rest: "",
  };
};

export const parseThisCharacterKeywordGrantInstruction: ContinuousInstructionParser =
  (input, context) => {
    const leaderTarget = parseYourLeaderTarget(input);
    if (leaderTarget?.target !== undefined) {
      const leaderActionMatch = /^gains\s+(?<rest>.*)$/i.exec(
        leaderTarget.rest,
      );
      const leaderKeywordText = leaderActionMatch?.groups?.["rest"];
      if (leaderKeywordText === undefined) {
        return undefined;
      }
      const keywordAndPower = parseKeywordAndPositivePowerGrant({
        target: leaderTarget.target,
        targetEvidence: leaderTarget.evidence,
        text: leaderKeywordText,
        context,
      });
      if (keywordAndPower !== undefined) {
        return keywordAndPower;
      }
      const keyword = parseKeyword({ text: leaderKeywordText });
      if (keyword !== undefined) {
        const explicitDuration =
          keyword.rest.length === 0
            ? undefined
            : parseExplicitFieldEffectDuration({ text: keyword.rest });
        if (keyword.rest.length > 0 && explicitDuration === undefined) {
          return undefined;
        }
        if (
          explicitDuration !== undefined &&
          explicitDuration.rest.length > 0
        ) {
          return undefined;
        }

        return {
          effect: {
            type: "giveKeyword",
            target: leaderTarget.target,
            keyword: keyword.keyword,
            duration:
              explicitDuration?.duration ??
              continuousDuration(context.condition),
          },
          evidence: [
            "instruction:giveKeyword",
            ...leaderTarget.evidence,
            ...keyword.evidence,
            ...(explicitDuration?.evidence ?? [
              continuousDurationEvidence(context.condition),
            ]),
          ],
          rest: "",
        };
      }
    }

    const namedAndSelfMatch =
      /^All of your \[(?<name>[^\]]+)\] cards and this Character gain (?<keyword>\[[^\]]+\])\.?$/i.exec(
        input.text,
      );
    const name = namedAndSelfMatch?.groups?.["name"]?.trim();
    const namedKeywordText = namedAndSelfMatch?.groups?.["keyword"];
    if (
      name !== undefined &&
      name.length > 0 &&
      namedKeywordText !== undefined
    ) {
      const keyword = parseKeyword({ text: namedKeywordText });
      if (keyword !== undefined && keyword.rest.length === 0) {
        const duration = continuousDuration(context.condition);
        return {
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: {
                  type: "giveKeyword",
                  target: {
                    type: "all",
                    zone: "characterArea",
                    player: "self",
                    filter: { categories: ["character"], names: [name] },
                  },
                  keyword: keyword.keyword,
                  duration,
                },
              },
              {
                connector: "always",
                effect: {
                  type: "giveKeyword",
                  target: { type: "self" },
                  keyword: keyword.keyword,
                  duration,
                },
              },
            ],
          },
          evidence: [
            "instruction:giveKeyword",
            "cardinality:all",
            "player:self",
            "zone:characterArea",
            "filter:name",
            "filter:category:character",
            "target:thisCharacter",
            ...keyword.evidence,
            context.condition === undefined
              ? "duration:whileSourceOnField"
              : "duration:whileConditionTrue",
          ],
          rest: "",
        };
      }
    }

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
    if (keyword === undefined) {
      return undefined;
    }
    const explicitDuration =
      keyword.rest.length === 0
        ? undefined
        : parseExplicitFieldEffectDuration({ text: keyword.rest });
    if (keyword.rest.length > 0 && explicitDuration === undefined) {
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
        type: "giveKeyword",
        target: { type: "self" },
        keyword: keyword.keyword,
        duration,
      },
      evidence: [
        "instruction:giveKeyword",
        ...target.evidence,
        ...keyword.evidence,
        ...durationEvidence,
      ],
      rest: "",
    };
  };

const parseKeywordAndPositivePowerGrant = ({
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
      : parseExplicitFieldEffectDuration({ text: modifier.rest });
  if (modifier.rest.length > 0 && explicitDuration === undefined) {
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

export const parseSelfCannotAttackInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
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

export const parseTargetedKeywordGrantInstruction: InstructionParser = (
  input,
) => {
  const cardinality = parseUpToCardinality(input);
  if (cardinality === undefined) {
    return undefined;
  }

  const target =
    parseCompoundYourCharactersTarget(
      { text: cardinality.rest },
      cardinality.cardinality,
    ) ?? parseYourCharactersTarget({ text: cardinality.rest });
  if (target?.target === undefined) {
    return undefined;
  }

  const actionMatch = /^gains\s+(?<rest>.*)$/i.exec(target.rest);
  const keywordText = actionMatch?.groups?.["rest"];
  if (keywordText === undefined) {
    return undefined;
  }

  const keyword = parseKeyword({ text: keywordText });
  if (keyword === undefined) {
    return undefined;
  }
  const duration = parseExplicitFieldEffectDuration({ text: keyword.rest });
  if (
    duration === undefined ||
    duration.duration === undefined ||
    duration.rest.length > 0
  ) {
    return undefined;
  }

  return {
    effect: {
      type: "giveKeyword",
      target: target.target,
      keyword: keyword.keyword,
      duration: duration.duration,
    },
    evidence: [
      "instruction:giveKeyword",
      ...cardinality.evidence,
      "chooser:self:upTo",
      ...target.evidence,
      ...keyword.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
};

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
  const target = parseThisCharacterTarget({
    text: input.text,
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
    const power = parsePositivePowerModifier({ text: part });
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
