import {
  allTriggerQueueCapabilities,
  triggerQueueCapabilityForType,
  type BehaviorProbeScenarioDescriptor,
} from "@optcg/engine-core";
import type { EffectBlock, Trigger } from "@optcg/types";

import { collectEffectBlockPrimitiveTypes } from "./engine-primitive-inventory.js";

export type SupportedScenario =
  | { readonly kind: "playCard"; readonly category: "character" | "event" }
  | { readonly kind: "activateEffect"; readonly category: "character" }
  | { readonly kind: "counter"; readonly category: "event" }
  | { readonly kind: "attackDeclared"; readonly category: "leader" }
  | { readonly kind: "cardPlayed"; readonly category: "character" }
  | { readonly kind: "cardDrawn"; readonly category: "character" }
  | { readonly kind: "cardRested"; readonly category: "character" }
  | { readonly kind: "declareAttack"; readonly category: "character" }
  | { readonly kind: "damageDealt"; readonly category: "character" }
  | { readonly kind: "donAttached"; readonly category: "character" }
  | { readonly kind: "donReturned"; readonly category: "character" }
  | { readonly kind: "endOfBattle"; readonly category: "character" }
  | { readonly kind: "endOfYourTurn"; readonly category: "character" }
  | { readonly kind: "effectQueued"; readonly category: "character" }
  | { readonly kind: "fieldRemoved"; readonly category: "character" }
  | { readonly kind: "handTrashedByEffect"; readonly category: "character" }
  | { readonly kind: "opponentAttack"; readonly category: "leader" }
  | { readonly kind: "lifeTrigger"; readonly category: "character" }
  | { readonly kind: "lifeRemoved"; readonly category: "character" }
  | { readonly kind: "onKO"; readonly category: "character" }
  | { readonly kind: "onBlock"; readonly category: "character" }
  | { readonly kind: "opponentActivated"; readonly category: "character" }
  | { readonly kind: "permanent"; readonly category: "character" }
  | { readonly kind: "replacement"; readonly category: "character" }
  | { readonly kind: "startOfYourTurn"; readonly category: "character" }
  | { readonly kind: "triggerActivated"; readonly category: "character" }
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
  if (
    effect.trigger.type === "activateMain" ||
    effect.trigger.type === "permanent" ||
    effect.trigger.type === "replacement" ||
    effect.trigger.type === "startOfYourTurn"
  ) {
    return effect.trigger.type;
  }
  const scenario = scenarioDescriptorForEffect(effect);
  if (scenario !== undefined) {
    return scenarioDescriptorKey(scenario);
  }
  return `unsupported:${effect.trigger.type}`;
};

const scenarioForDefinition = (
  effects: readonly EffectBlock[],
): SupportedScenario => {
  const firstTrigger = effects[0]?.trigger.type;
  if (firstTrigger === undefined) {
    return { kind: "skipped", reason: "no runtime effect blocks" };
  }
  const firstEffect = effects[0];
  if (firstEffect === undefined) {
    return { kind: "skipped", reason: "no runtime effect blocks" };
  }
  if (effects.every((effect) => effect.trigger.type === "activateMain")) {
    return { kind: "activateEffect", category: "character" };
  }
  if (effects.some((effect) => effect.trigger.type === "trigger")) {
    return { kind: "lifeTrigger", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "permanent")) {
    return { kind: "permanent", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "replacement")) {
    return { kind: "replacement", category: "character" };
  }
  if (effects.every((effect) => effect.trigger.type === "startOfYourTurn")) {
    return { kind: "startOfYourTurn", category: "character" };
  }
  const firstScenario = scenarioDescriptorForEffect(firstEffect);
  if (
    firstScenario !== undefined &&
    effects.every((effect) => {
      const scenario = scenarioDescriptorForEffect(effect);
      return (
        scenario !== undefined &&
        scenarioDescriptorKey(scenario) === scenarioDescriptorKey(firstScenario)
      );
    })
  ) {
    return firstScenario;
  }
  return {
    kind: "skipped",
    reason: `no generated scenario for trigger ${firstTrigger}`,
  };
};

const scenarioDescriptorKey = (
  scenario: BehaviorProbeScenarioDescriptor,
): string => `${scenario.kind}:${scenario.category}`;

const scenarioDescriptorForTriggerType = (
  triggerType: Trigger["type"],
): BehaviorProbeScenarioDescriptor | undefined =>
  triggerQueueCapabilityForType(triggerType)?.behaviorProbeScenario;

const scenarioDescriptorForEffect = (
  effect: EffectBlock,
): BehaviorProbeScenarioDescriptor | undefined => {
  const direct = scenarioDescriptorForTriggerType(effect.trigger.type);
  if (direct !== undefined) {
    return direct;
  }
  for (const capability of allTriggerQueueCapabilities) {
    if (
      capability.behaviorProbeScenario !== undefined &&
      effectHasTrigger(effect, capability.triggerType)
    ) {
      return capability.behaviorProbeScenario;
    }
  }
  return undefined;
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
