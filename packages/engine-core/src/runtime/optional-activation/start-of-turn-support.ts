import type { EffectQueueEntry } from "@optcg/types";

import { isFieldZoneForActivateMain } from "./activate-main-support.js";

export const startOfYourTurnQueueingName = "effectRuntime:startOfYourTurn";

export const isScopedStartOfTurnQueueEntry = (
  entry: EffectQueueEntry,
): boolean =>
  entry.queueOrigin?.type === "startOfYourTurn" &&
  entry.generation === 0 &&
  entry.triggerEventId === undefined &&
  entry.sourcePresencePolicy === "mustRemainInSameZone" &&
  isFieldZoneForActivateMain(entry.source.zone) &&
  isFieldZoneForActivateMain(entry.sourceSnapshot.zone);
