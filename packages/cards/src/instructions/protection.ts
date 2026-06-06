import type {
  CardCategory,
  Effect,
  EffectDslFieldRemovalProtection,
  EffectDslRestProtection,
} from "@optcg/types";

import { parseSelfNextTurnStartDuration } from "../durations/index.js";
import { parseProtectionProcess } from "../protection/process.js";
import { parseProtectionSource } from "../protection/source.js";
import {
  parseAllFieldTarget,
  parseThisCharacterTarget,
} from "../targets/index.js";
import type { InstructionParser } from "../types.js";
import type {
  ContinuousInstructionContext,
  ContinuousInstructionParser,
} from "./continuous-field-effects.js";

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
    effect: buildExplicitProtectionEffect({
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

function buildProtectionEffect(options: {
  readonly context: ContinuousInstructionContext;
  readonly process: "fieldRemoval" | "ko" | "rest";
  readonly sourceCardCategories: readonly CardCategory[] | undefined;
  readonly sourceKind: "battle" | "cardEffect";
  readonly sourceControllerRelation: "eitherController" | "opponentControlled";
}): Effect {
  const duration =
    options.context.condition === undefined
      ? { type: "whileSourceOnField" as const }
      : {
          type: "whileConditionTrue" as const,
          condition: options.context.condition,
        };

  if (options.process === "ko") {
    return {
      type: "protectFromKO",
      target: { type: "self" },
      duration,
      sourceKind: options.sourceKind,
      sourceControllerRelation: options.sourceControllerRelation,
      ...(options.sourceCardCategories === undefined
        ? {}
        : { sourceCardCategories: [...options.sourceCardCategories] }),
    };
  }

  if (options.process === "rest") {
    return {
      type: "giveProtection",
      target: { type: "self" },
      protection: restProtection({
        sourceCardCategories: options.sourceCardCategories,
        sourceKind: options.sourceKind,
        sourceControllerRelation: options.sourceControllerRelation,
      }),
      duration,
    };
  }

  return {
    type: "giveProtection",
    target: { type: "self" },
    protection: fieldRemovalProtection({
      sourceKind: options.sourceKind,
      sourceControllerRelation: options.sourceControllerRelation,
    }),
    duration,
  };
}

function buildExplicitProtectionEffect(options: {
  readonly duration: Extract<Effect, { type: "protectFromKO" }>["duration"];
  readonly process: "fieldRemoval" | "ko" | "rest";
  readonly sourceCardCategories: readonly CardCategory[] | undefined;
  readonly sourceKind: "battle" | "cardEffect";
  readonly sourceControllerRelation: "eitherController" | "opponentControlled";
  readonly target: Extract<Effect, { type: "protectFromKO" }>["target"];
}): Effect {
  if (options.process === "ko") {
    return {
      type: "protectFromKO",
      target: options.target,
      duration: options.duration,
      sourceKind: options.sourceKind,
      sourceControllerRelation: options.sourceControllerRelation,
      ...(options.sourceCardCategories === undefined
        ? {}
        : { sourceCardCategories: [...options.sourceCardCategories] }),
    };
  }
  if (options.process === "rest") {
    return {
      type: "giveProtection",
      target: options.target,
      protection: restProtection({
        sourceCardCategories: options.sourceCardCategories,
        sourceKind: options.sourceKind,
        sourceControllerRelation: options.sourceControllerRelation,
      }),
      duration: options.duration,
    };
  }
  return {
    type: "giveProtection",
    target: options.target,
    protection: fieldRemovalProtection({
      sourceKind: options.sourceKind,
      sourceControllerRelation: options.sourceControllerRelation,
    }),
    duration: options.duration,
  };
}

function restProtection(options: {
  readonly sourceCardCategories: readonly CardCategory[] | undefined;
  readonly sourceKind: "battle" | "cardEffect";
  readonly sourceControllerRelation: "eitherController" | "opponentControlled";
}): EffectDslRestProtection {
  return {
    process: "rest",
    sourceKind: options.sourceKind,
    sourceControllerRelation: options.sourceControllerRelation,
    ...(options.sourceCardCategories === undefined
      ? {}
      : { sourceCardCategories: [...options.sourceCardCategories] }),
  };
}

function fieldRemovalProtection(options: {
  readonly sourceKind: "battle" | "cardEffect";
  readonly sourceControllerRelation: "eitherController" | "opponentControlled";
}): EffectDslFieldRemovalProtection {
  return {
    process: "fieldRemoval",
    fieldRemoval: {
      processFamily: "fieldRemoval",
      classification: "moveFromFieldToOtherZone",
      sourceKind: options.sourceKind,
      sourceControllerRelation: options.sourceControllerRelation,
      targetScope: "thisCard",
      exclusions: {
        battleKO: "excluded",
        ruleProcessTrash: "excluded",
        controllerCost: "excluded",
        controllerOwnedEffect: "excluded",
        ambiguousCustomRemoval: "failClosed",
      },
    },
  };
}
