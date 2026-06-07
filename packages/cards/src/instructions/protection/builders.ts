import type {
  CardCategory,
  Effect,
  EffectDslFieldRemovalProtection,
  EffectDslRestProtection,
} from "@optcg/types";

import type { ContinuousInstructionContext } from "../continuous-field-effects.js";

export function buildProtectionEffect(options: {
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

  return buildProtectionEffectWithTarget({
    duration,
    process: options.process,
    sourceCardCategories: options.sourceCardCategories,
    sourceKind: options.sourceKind,
    sourceControllerRelation: options.sourceControllerRelation,
    target: { type: "self" },
  });
}

export function buildProtectionEffectWithTarget(options: {
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
