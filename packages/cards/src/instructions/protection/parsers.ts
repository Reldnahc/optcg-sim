import {
  parseDurationFromSet,
  selfNextTurnStartOnlyDurationParsers,
} from "../../durations/index.js";
import { parseProtectionProcess } from "../../protection/process.js";
import { parseProtectionSource } from "../../protection/source.js";
import {
  parseAllFieldTarget,
  parseThisCharacterTarget,
} from "../../targets/index.js";
import type { InstructionParser } from "../../types.js";
import type { ContinuousInstructionParser } from "../continuous-field-effects.js";
import {
  buildProtectionEffect,
  buildProtectionEffectWithTarget,
} from "./builders.js";

export const protectionInstructionPrimitive = {
  primitiveId: "instruction:giveProtection",
  childPrimitiveIds: [
    "target:thisCharacter",
    "protectionProcess:fieldRemoval",
    "protectionProcess:ko",
    "protectionProcess:rest",
    "protectionSource:opponentCardCategoryEffects",
    "protectionSource:opponentEffects",
    "protectionSource:effects",
    "protectionSource:battle",
  ],
} as const;

export const parseProtectionInstruction: ContinuousInstructionParser = (
  input,
  context,
) => {
  const target =
    parseAllProtectionTarget(input.text) ??
    parseThisCharacterTarget({
      text: input.text,
      allowImplicit: true,
    });
  if (target === undefined) {
    return undefined;
  }

  const process = parseProtectionProcess({ text: target.rest });
  if (process === undefined) {
    return undefined;
  }

  const source = parseProtectionSource({ text: process.rest });
  if (source === undefined || source.rest.length > 0) {
    return undefined;
  }

  const duration =
    context.condition === undefined
      ? { type: "whileSourceOnField" as const }
      : {
          type: "whileConditionTrue" as const,
          condition: context.condition,
        };

  const effect =
    target.target.type === "self"
      ? buildProtectionEffect({
          context,
          process: process.process.type,
          sourceCardCategories: source.source.cardCategories,
          sourceKind: source.source.kind,
          sourceControllerRelation: source.source.controllerRelation,
        })
      : buildProtectionEffectWithTarget({
          duration,
          process: process.process.type,
          sourceCardCategories: source.source.cardCategories,
          sourceKind: source.source.kind,
          sourceControllerRelation: source.source.controllerRelation,
          target: target.target,
        });

  return {
    effect,
    evidence: [
      "instruction:giveProtection",
      ...target.evidence,
      ...process.evidence,
      ...source.evidence,
      context.condition === undefined
        ? "duration:whileSourceOnField"
        : "duration:whileConditionTrue",
    ],
    rest: "",
  };
};

const parseAllProtectionTarget = (
  text: string,
): ReturnType<typeof parseAllFieldTarget> => {
  const match = /^(?<target>All of .+?)\s+(?<process>cannot be .+)$/iu.exec(
    text,
  );
  const targetText = match?.groups?.["target"];
  const processText = match?.groups?.["process"];
  if (targetText === undefined || processText === undefined) {
    return undefined;
  }
  const target = parseAllFieldTarget({ text: targetText });
  if (target === undefined || target.rest.length > 0) {
    return undefined;
  }
  return { ...target, rest: processText };
};

export const parseOpponentEffectFieldRemovalProtectionInstruction =
  parseProtectionInstruction;

export const parseExplicitProtectionInstruction: InstructionParser = (
  input,
) => {
  const noneMatch =
    /^None of your\s+(?<target>.+?)\s+can be\s+(?<process>.+)$/i.exec(
      input.text,
    );
  const targetText = noneMatch?.groups?.["target"];
  const processText = noneMatch?.groups?.["process"];
  if (targetText === undefined || processText === undefined) {
    return undefined;
  }

  const target = parseAllFieldTarget({ text: `All of your ${targetText}` });
  if (target === undefined) {
    return undefined;
  }
  const process = parseProtectionProcess({ text: `cannot be ${processText}` });
  if (process === undefined) {
    return undefined;
  }
  const source = parseProtectionSource({ text: process.rest });
  if (source === undefined) {
    return undefined;
  }
  const duration = parseDurationFromSet(
    { text: source.rest },
    selfNextTurnStartOnlyDurationParsers,
  );
  if (duration?.duration === undefined || duration.rest.length > 0) {
    return undefined;
  }

  return {
    effect: buildProtectionEffectWithTarget({
      duration: duration.duration,
      process: process.process.type,
      sourceCardCategories: source.source.cardCategories,
      sourceKind: source.source.kind,
      sourceControllerRelation: source.source.controllerRelation,
      target: target.target,
    }),
    evidence: [
      "instruction:giveProtection",
      ...target.evidence,
      ...process.evidence,
      ...source.evidence,
      ...duration.evidence,
    ],
    rest: "",
  };
};
