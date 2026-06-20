import type { EffectBlock, Trigger } from "@optcg/types";

import { collectEffectBlockPrimitiveTypes } from "./engine-primitive-inventory.js";

export type SupportedScenario =
  | { readonly kind: "playCard"; readonly category: "character" | "event" }
  | { readonly kind: "activateEffect"; readonly category: "character" }
  | { readonly kind: "counter"; readonly category: "event" }
  | { readonly kind: "cardPlayed"; readonly category: "character" }
  | { readonly kind: "declareAttack"; readonly category: "character" }
  | { readonly kind: "endOfYourTurn"; readonly category: "character" }
  | { readonly kind: "fieldRemoved"; readonly category: "character" }
  | { readonly kind: "opponentAttack"; readonly category: "leader" }
  | { readonly kind: "lifeTrigger"; readonly category: "character" }
  | { readonly kind: "lifeRemoved"; readonly category: "character" }
  | { readonly kind: "onKO"; readonly category: "character" }
  | { readonly kind: "permanent"; readonly category: "character" }
  | { readonly kind: "replacement"; readonly category: "character" }
  | { readonly kind: "skipped"; readonly reason: string };

export type RunnableScenario = Exclude<
  SupportedScenario,
  { readonly kind: "skipped" }
>;

export interface ScenarioPlan {
  readonly scenario: SupportedScenario;
  readonly effects: readonly EffectBlock[];
  readonly primitiveTypes: readonly string[];
}

export const scenarioPlansForEffects = (
  effects: readonly EffectBlock[],
): readonly ScenarioPlan[] => {
  if (effects.length === 0) {
    return [
      {
        effects,
        primitiveTypes: [],
        scenario: scenarioForDefinition(effects),
      },
    ];
  }
  if (
    effects.some((effect) => effect.trigger.type === "trigger") &&
    !effects.every((effect) => effect.trigger.type === "trigger")
  ) {
    return [
      {
        effects,
        primitiveTypes: collectEffectBlockPrimitiveTypes(effects),
        scenario: scenarioForDefinition(effects),
      },
    ];
  }
  return groupEffectsByScenarioFamily(effects).map((group) => ({
    effects: group.effects,
    primitiveTypes: collectEffectBlockPrimitiveTypes(group.effects),
    scenario: scenarioForDefinition(group.effects),
  }));
};

const groupEffectsByScenarioFamily = (
  effects: readonly EffectBlock[],
): Array<{
  readonly key: string;
  readonly effects: readonly EffectBlock[];
}> => {
  const groups: Array<{ key: string; effects: EffectBlock[] }> = [];
  for (const effect of effects) {
    const key = scenarioFamilyKey(effect);
    const existing = groups.find((group) => group.key === key);
    if (existing === undefined) {
      groups.push({ key, effects: [effect] });
      continue;
    }
    existing.effects.push(effect);
  }
  return groups;
};

const scenarioFamilyKey = (effect: EffectBlock): string => {
  if (effect.trigger.type === "onPlay") return "playCard:character";
  if (effect.trigger.type === "main") return "playCard:event";
  if (
    effect.trigger.type === "activateMain" ||
    effect.trigger.type === "counter" ||
    effect.trigger.type === "whenAttacking" ||
    effect.trigger.type === "onOpponentAttack" ||
    effect.trigger.type === "trigger" ||
    effect.trigger.type === "lifeRemoved" ||
    effect.trigger.type === "onKO" ||
    effect.trigger.type === "permanent" ||
    effect.trigger.type === "endOfYourTurn" ||
    effect.trigger.type === "replacement"
  ) {
    return effect.trigger.type;
  }
  if (effectHasTrigger(effect, "cardPlayed")) return "cardPlayed";
  if (effectHasTrigger(effect, "fieldRemoved")) return "fieldRemoved";
  if (effectHasTrigger(effect, "trigger")) return "trigger";
  return `unsupported:${effect.trigger.type}`;
};

const scenarioForDefinition = (
  effects: readonly EffectBlock[],
): SupportedScenario => {
  const firstTrigger = effects[0]?.trigger.type;
  if (firstTrigger === undefined) {
    return { kind: "skipped", reason: "no runtime effect blocks" };
  }
  if (effects.every((effect) => effect.trigger.type === "onPlay")) {
    return { kind: "playCard", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "main")) {
    return { kind: "playCard", category: "event" };
  }
  if (effects.every((effect) => effect.trigger.type === "activateMain")) {
    return { kind: "activateEffect", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "counter")) {
    return { kind: "counter", category: "event" };
  }
  if (effects.every((effect) => effectHasTrigger(effect, "cardPlayed"))) {
    return { kind: "cardPlayed", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "whenAttacking")) {
    return { kind: "declareAttack", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "endOfYourTurn")) {
    return { kind: "endOfYourTurn", category: "character" };
  }
  if (effects.every((effect) => effectHasTrigger(effect, "fieldRemoved"))) {
    return { kind: "fieldRemoved", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "onOpponentAttack")) {
    return { kind: "opponentAttack", category: "leader" };
  }
  if (effects.every((effect) => effect.trigger.type === "trigger")) {
    return { kind: "lifeTrigger", category: "character" };
  }
  if (effects.some((effect) => effect.trigger.type === "trigger")) {
    return { kind: "lifeTrigger", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "lifeRemoved")) {
    return { kind: "lifeRemoved", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "onKO")) {
    return { kind: "onKO", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "permanent")) {
    return { kind: "permanent", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "replacement")) {
    return { kind: "replacement", category: "character" };
  }
  return {
    kind: "skipped",
    reason: `no generated scenario for trigger ${firstTrigger}`,
  };
};

const effectHasTrigger = (
  effect: EffectBlock,
  triggerType: Trigger["type"],
): boolean => triggerContainsType(effect.trigger, triggerType);

const triggerContainsType = (
  trigger: Trigger,
  triggerType: Trigger["type"],
): boolean => {
  if (trigger.type === triggerType) {
    return true;
  }
  if (trigger.type === "anyOf") {
    return trigger.triggers.some((child) =>
      triggerContainsType(child, triggerType),
    );
  }
  if (trigger.type === "eventCount") {
    return triggerContainsType(trigger.trigger, triggerType);
  }
  return false;
};
