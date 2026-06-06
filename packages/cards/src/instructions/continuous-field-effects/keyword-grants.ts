import type { Effect, Target } from "@optcg/types";

import { parseUpToCardinality } from "../../cardinality/index.js";
import { parseKeyword } from "../../keywords/index.js";
import { parsePositivePowerModifier } from "../../modifiers/index.js";
import {
  parseCompoundYourCharactersTarget,
  parseThisCharacterTarget,
  parseYourCharactersTarget,
  parseYourLeaderTarget,
} from "../../targets/index.js";
import type {
  InstructionParseResult,
  InstructionParser,
  PrimitiveEvidence,
} from "../../types.js";
import {
  continuousDuration,
  continuousDurationEvidence,
  parseExplicitFieldEffectDuration,
  type ContinuousInstructionContext,
  type ContinuousInstructionParser,
} from "./shared.js";

export const thisCharacterKeywordGrantPrimitive = {
  primitiveId: "instruction:giveKeyword",
  childPrimitiveIds: [
    "target:thisCharacter",
    "keyword:anySupported",
    "duration:whileConditionTrue",
    "duration:opponentNextEndPhase",
  ],
} as const;

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
  if (
    modifier.rest.length > 0 &&
    modifier.rest !== "." &&
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

export const keywordSequence = (
  effects: readonly Effect[],
): Effect | undefined => {
  const first = effects[0];
  return effects.length === 0
    ? undefined
    : effects.length === 1
      ? first
      : {
          type: "sequence",
          effects: effects.map((effect) => ({
            connector: "always" as const,
            effect,
          })),
        };
};
