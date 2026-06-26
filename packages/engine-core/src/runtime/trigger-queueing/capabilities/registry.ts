import type { Trigger } from "@optcg/types";

import { genericEventReactionCapabilities } from "./event-families.js";
import { specializedTriggerQueueCapabilities } from "./specialized-families.js";
import type { TriggerQueueCapability } from "./types.js";

export const allTriggerQueueCapabilities = [
  ...specializedTriggerQueueCapabilities,
  ...genericEventReactionCapabilities,
] as const satisfies readonly TriggerQueueCapability[];

const capabilitiesByType: ReadonlyMap<
  TriggerQueueCapability["triggerType"],
  TriggerQueueCapability
> = new Map(
  allTriggerQueueCapabilities.map((value) => [value.triggerType, value]),
);

export const triggerQueueCapabilityForType = (
  triggerType: Trigger["type"],
): TriggerQueueCapability | undefined =>
  triggerType === "anyOf" || triggerType === "eventCount"
    ? undefined
    : capabilitiesByType.get(triggerType);
