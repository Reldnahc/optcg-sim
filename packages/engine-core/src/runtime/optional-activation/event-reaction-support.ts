import type { CardRef, EffectQueueEntry } from "@optcg/types";

export const activatedReactionQueueingName = "effectRuntime:activatedReaction";

const isFieldZoneForActivatedReaction = (
  zone: CardRef["zone"],
): zone is NonNullable<CardRef["zone"]> =>
  zone?.zone === "leaderArea" ||
  zone?.zone === "characterArea" ||
  zone?.zone === "stageArea";

export const isScopedActivatedReactionQueueEntry = (
  entry: EffectQueueEntry,
): boolean =>
  entry.queueOrigin?.type === "activatedReaction" &&
  entry.generation === 0 &&
  entry.triggerEventId !== undefined &&
  entry.sourcePresencePolicy === "mustRemainInSameZone" &&
  isFieldZoneForActivatedReaction(entry.source.zone) &&
  isFieldZoneForActivatedReaction(entry.sourceSnapshot.zone);
