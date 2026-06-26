import type {
  EffectDefinition,
  SourcePresencePolicy,
  Trigger,
} from "@optcg/types";

import { triggerQueueCapabilityForType } from "./runtime/trigger-queueing/capabilities/registry.js";

type EffectBlock = EffectDefinition["effects"][number];
export type AutoRuntimeTriggerType = Exclude<Trigger["type"], "anyOf">;

export interface AutoRuntimeEntryAdapter {
  readonly category: "auto";
  readonly sourcePresencePolicies: readonly SourcePresencePolicy[];
  readonly triggerType: AutoRuntimeTriggerType;
}

const autoAdapter = (
  triggerType: AutoRuntimeEntryAdapter["triggerType"],
  sourcePresencePolicies: readonly SourcePresencePolicy[],
): AutoRuntimeEntryAdapter => ({
  category: "auto",
  sourcePresencePolicies,
  triggerType,
});

export const autoRuntimeEntryAdapterForTriggerType = (
  triggerType: AutoRuntimeTriggerType,
): AutoRuntimeEntryAdapter | undefined => {
  const capability = triggerQueueCapabilityForType(triggerType);
  return capability === undefined || capability.category !== "auto"
    ? undefined
    : autoAdapter(capability.triggerType, capability.sourcePresencePolicies);
};

const triggerTypes = (trigger: Trigger): readonly AutoRuntimeTriggerType[] =>
  trigger.type === "anyOf"
    ? trigger.triggers.flatMap(triggerTypes)
    : trigger.type === "eventCount"
      ? triggerTypes(trigger.trigger)
      : [trigger.type];

export const triggerContainsType = (
  trigger: Trigger,
  triggerType: AutoRuntimeTriggerType,
): boolean => triggerTypes(trigger).includes(triggerType);

export const autoRuntimeEntryAdaptersForBlock = (
  block: EffectBlock,
): readonly AutoRuntimeEntryAdapter[] => {
  if (block.sourcePresencePolicy === undefined) {
    return [];
  }
  const adapters = triggerTypes(block.trigger).map((triggerType) =>
    autoRuntimeEntryAdapterForTriggerType(triggerType),
  );
  return adapters.every(
    (adapter): adapter is AutoRuntimeEntryAdapter => adapter !== undefined,
  )
    ? adapters
    : [];
};

export const autoRuntimeEntryAdapterForBlock = (
  block: EffectBlock,
): AutoRuntimeEntryAdapter | undefined =>
  autoRuntimeEntryAdaptersForBlock(block)[0];
