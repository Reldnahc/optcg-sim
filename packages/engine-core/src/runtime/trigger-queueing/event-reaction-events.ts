import type { EngineEvent } from "@optcg/types";

import type { EventReactionTriggerType } from "../event-hooks/matcher.js";

export const autoEventReactionTriggerTypes = [
  "damageDealt",
  "fieldRemoved",
  "cardPlayed",
  "cardRested",
  "donReturned",
  "donAttached",
  "attackDeclared",
  "onBlock",
  "effectQueued",
  "effectResolved",
  "triggerActivated",
  "lifeRemoved",
] as const satisfies readonly EventReactionTriggerType[];

const autoEventReactionTriggerTypeSet: ReadonlySet<EventReactionTriggerType> =
  new Set(autoEventReactionTriggerTypes);

const autoEventReactionRuntimeEventTypes: ReadonlySet<EngineEvent["type"]> =
  new Set([
    "damageDealt",
    "cardMoved",
    "cardPlayed",
    "cardRested",
    "donReturned",
    "donAttached",
    "attackDeclared",
    "blockerActivated",
    "effectQueued",
    "effectResolved",
    "triggerActivated",
  ]);

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
