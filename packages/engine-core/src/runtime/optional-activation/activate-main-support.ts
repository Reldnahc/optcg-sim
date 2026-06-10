import type { CardRef, EffectQueueEntry } from "@optcg/types";

export const isFieldZoneForActivateMain = (
  zone: CardRef["zone"],
): zone is NonNullable<CardRef["zone"]> =>
  zone?.zone === "leaderArea" ||
  zone?.zone === "characterArea" ||
  zone?.zone === "stageArea";

export const isScopedActivateMainQueueEntry = (
  entry: EffectQueueEntry,
): boolean =>
  entry.queueOrigin?.type === "activateMain" &&
  entry.generation === 0 &&
  entry.triggerEventId === undefined &&
  entry.sourcePresencePolicy === "mustRemainInSameZone" &&
  isFieldZoneForActivateMain(entry.source.zone) &&
  isFieldZoneForActivateMain(entry.sourceSnapshot.zone);
