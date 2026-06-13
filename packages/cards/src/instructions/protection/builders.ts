import type {
  CardCategory,
  CardFilter,
  Effect,
  EffectDslFieldRemovalProtection,
  EffectDslRestProtection,
} from "@optcg/types";

import type { ContinuousInstructionContext } from "../continuous-field-effects.js";

export function buildProtectionEffect(options: {
  readonly context: ContinuousInstructionContext;
  readonly process: "fieldRemoval" | "ko" | "rest";
  readonly sourceCardCategories: readonly CardCategory[] | undefined;
  readonly sourceCardFilter: CardFilter | undefined;
  readonly sourceKind: "battle" | "cardEffect";
  readonly sourceControllerRelation:
    | "eitherController"
    | "opponentControlled"
    | "selfControlled";
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
    sourceCardFilter: options.sourceCardFilter,
    sourceKind: options.sourceKind,
    sourceControllerRelation: options.sourceControllerRelation,
    target: { type: "self" },
  });
}

export function buildProtectionEffectWithTarget(options: {
  readonly duration: Extract<Effect, { type: "protectFromKO" }>["duration"];
  readonly process: "fieldRemoval" | "ko" | "rest";
  readonly sourceCardCategories: readonly CardCategory[] | undefined;
  readonly sourceCardFilter: CardFilter | undefined;
  readonly sourceKind: "battle" | "cardEffect";
  readonly sourceControllerRelation:
    | "eitherController"
    | "opponentControlled"
    | "selfControlled";
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
      ...(options.sourceCardFilter === undefined
        ? {}
        : { sourceCardFilter: options.sourceCardFilter }),
    };
  }
  if (options.process === "rest") {
    return {
      type: "giveProtection",
      target: options.target,
      protection: restProtection({
        sourceCardCategories: options.sourceCardCategories,
        sourceCardFilter: options.sourceCardFilter,
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
      sourceCardFilter: options.sourceCardFilter,
      target: options.target,
    }),
    duration: options.duration,
  };
}

function restProtection(options: {
  readonly sourceCardCategories: readonly CardCategory[] | undefined;
  readonly sourceCardFilter: CardFilter | undefined;
  readonly sourceKind: "battle" | "cardEffect";
  readonly sourceControllerRelation:
    | "eitherController"
    | "opponentControlled"
    | "selfControlled";
}): EffectDslRestProtection {
  return {
    process: "rest",
    sourceKind: options.sourceKind,
    sourceControllerRelation: options.sourceControllerRelation,
    ...(options.sourceCardCategories === undefined
      ? {}
      : { sourceCardCategories: [...options.sourceCardCategories] }),
    ...(options.sourceCardFilter === undefined
      ? {}
      : { sourceCardFilter: options.sourceCardFilter }),
  };
}

function fieldRemovalProtection(options: {
  readonly sourceKind: "battle" | "cardEffect";
  readonly sourceControllerRelation:
    | "eitherController"
    | "opponentControlled"
    | "selfControlled";
  readonly sourceCardFilter: CardFilter | undefined;
  readonly target: Extract<Effect, { type: "protectFromKO" }>["target"];
}): EffectDslFieldRemovalProtection {
  return {
    process: "fieldRemoval",
    ...(options.sourceCardFilter === undefined
      ? {}
      : { sourceCardFilter: options.sourceCardFilter }),
    fieldRemoval: {
      processFamily: "fieldRemoval",
      classification: "moveFromFieldToOtherZone",
      sourceKind: options.sourceKind,
      sourceControllerRelation: options.sourceControllerRelation,
      targetScope: options.target.type === "self" ? "thisCard" : "anyFieldCard",
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
