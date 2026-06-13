import type {
  CardInstance,
  EffectQueueEntry,
  ResolvedCard,
} from "@optcg/types";

export const sourceSnapshotForContinuousCard = (
  card: CardInstance,
  resolved: ResolvedCard,
): EffectQueueEntry["sourceSnapshot"] => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  ownerId: card.owner,
  controllerId: card.controller,
  zone: card.zone,
  category:
    card.zone.zone === "leaderArea" || card.zone.zone === "stageArea"
      ? card.zone.zone === "leaderArea"
        ? "leader"
        : "stage"
      : resolved.category,
  colors: [],
  keywords: [],
});
