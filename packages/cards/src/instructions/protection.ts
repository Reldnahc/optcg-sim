import type { Effect, EffectDslFieldRemovalProtection } from "@optcg/types";

import { parseProtectionProcess } from "../protection/process.js";
import { parseProtectionSource } from "../protection/source.js";
import { parseThisCharacterTarget } from "../targets/index.js";
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

function buildProtectionEffect(options: {
  readonly context: ContinuousInstructionContext;
  readonly process: "fieldRemoval" | "ko";
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
