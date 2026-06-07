import { parseSelfNextTurnStartDuration } from "../../durations/index.js";
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
  const target = parseThisCharacterTarget({
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

  const effect = buildProtectionEffect({
    context,
    process: process.process.type,
    sourceCardCategories: source.source.cardCategories,
    sourceKind: source.source.kind,
    sourceControllerRelation: source.source.controllerRelation,
  });

  return {
    effect,
    evidence: [
      "instruction:giveProtection",
      ...target.evidence,
      ...process.evidence,
      ...source.evidence,
      "duration:whileConditionTrue",
    ],
    rest: "",
  };
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
  const duration = parseSelfNextTurnStartDuration({ text: source.rest });
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
