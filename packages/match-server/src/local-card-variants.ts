import type {
  CardId,
  InstanceId,
  MatchCardManifest,
  VariantKey,
} from "@optcg/types";

import type { DevMatchSetup } from "./local-match.js";

const variantKeyForIndex = (
  manifest: MatchCardManifest,
  cardId: CardId,
  variantIndex: number | undefined,
): VariantKey | undefined => {
  if (variantIndex === undefined) {
    return undefined;
  }
  const variant = manifest.cards[cardId]?.variants.find(
    (candidate) => candidate.variantIndex === variantIndex,
  );
  if (variant === undefined) {
    throw new TypeError(
      `Variant ${String(variantIndex)} is not available for ${String(cardId)}.`,
    );
  }
  return variant.variantKey;
};

export const cardVariantOverridesForSetup = (
  setup: DevMatchSetup,
): Record<InstanceId, VariantKey> => {
  const overrides: Record<InstanceId, VariantKey> = {};
  for (const player of setup.players) {
    const leaderVariant = variantKeyForIndex(
      setup.cardManifest,
      player.leaderCardId,
      player.leaderVariantIndex,
    );
    if (leaderVariant !== undefined) {
      overrides[`${String(player.playerId)}:leader` as InstanceId] =
        leaderVariant;
    }
    player.deckCardIds.forEach((cardId, index) => {
      const variantKey = variantKeyForIndex(
        setup.cardManifest,
        cardId,
        player.deckVariantIndexes?.[index],
      );
      if (variantKey !== undefined) {
        overrides[
          `${String(player.playerId)}:deck:${String(index)}:${String(cardId)}` as InstanceId
        ] = variantKey;
      }
    });
  }
  return overrides;
};
