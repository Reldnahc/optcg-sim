import type { EngineEvent } from "@optcg/types";

import type { EventReactionTriggerType } from "../event-hooks/matcher.js";
import { genericEventReactionCapabilities } from "./capabilities/event-families.js";

export const autoEventReactionTriggerTypes =
  genericEventReactionCapabilities.map(
    (capability) => capability.triggerType,
  ) as readonly EventReactionTriggerType[];

const autoEventReactionTriggerTypeSet: ReadonlySet<EventReactionTriggerType> =
  new Set(autoEventReactionTriggerTypes);

const autoEventReactionRuntimeEventTypes: ReadonlySet<EngineEvent["type"]> =
  new Set(
    genericEventReactionCapabilities.flatMap(
      (capability) => capability.runtimeEventTypes,
    ),
  );

export const isSupportedAutoEventReactionTriggerType = (
  triggerType: EventReactionTriggerType,
): boolean => autoEventReactionTriggerTypeSet.has(triggerType);

export const isAutoEventReactionRuntimeEventType = (
  eventType: EngineEvent["type"],
): boolean => autoEventReactionRuntimeEventTypes.has(eventType);

export const isAutoEventReactionTimingWindowId = (
  timingWindowId: string,
): boolean =>
  autoEventReactionTriggerTypes.some((triggerType) =>
    timingWindowId.endsWith(`:${triggerType}`),
  );
