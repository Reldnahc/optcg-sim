import type { CardRef } from "@optcg/types";

import type { ClientCardModel } from "../view-model.js";
import type { EffectSpotlightPresentation } from "./EffectSpotlight.js";
import {
  isCombatSpotlightSource,
  type EffectSpotlightPlaybackEntry,
} from "./use-effect-spotlight-playback.js";

export interface BuildEffectSpotlightPresentationInput {
  readonly entry: EffectSpotlightPlaybackEntry | undefined;
  readonly cardModel: (card: CardRef) => ClientCardModel;
}

const cardKey = (card: CardRef): string =>
  [String(card.playerId), String(card.instanceId), String(card.cardId)].join(
    "|",
  );

const targetCardsForEntry = (
  entry: EffectSpotlightPlaybackEntry,
): readonly CardRef[] => {
  if (isCombatSpotlightSource(entry)) {
    return [];
  }
  const activeSpanIds = new Set(entry.active.activeSpanIds);
  const seenTargetKeys = new Set<string>();
  const targetCards: CardRef[] = [];
  for (const link of entry.active.targetLinks ?? []) {
    if (!activeSpanIds.has(link.spanId)) {
      continue;
    }
    for (const card of link.cards) {
      const key = cardKey(card);
      if (seenTargetKeys.has(key)) {
        continue;
      }
      seenTargetKeys.add(key);
      targetCards.push(card);
    }
  }
  return targetCards;
};

const combatRelationLabel = (
  entry: Extract<EffectSpotlightPlaybackEntry, { readonly kind: "combat" }>,
): string =>
  entry.combat.eventKind === "counterUsed" ? "counters" : "attacks";

export const buildEffectSpotlightPresentation = ({
  cardModel,
  entry,
}: BuildEffectSpotlightPresentationInput):
  | EffectSpotlightPresentation
  | undefined => {
  if (entry === undefined) {
    return undefined;
  }
  if (isCombatSpotlightSource(entry)) {
    return {
      kind: "cardLink",
      sourceCard: cardModel(entry.combat.attacker),
      relatedCards: [cardModel(entry.combat.defender)],
      relationLabel: combatRelationLabel(entry),
      tone: "combat",
      sourcePower: entry.combat.attackerPower,
      relatedPowers: [entry.combat.defenderPower],
    };
  }
  const targetCards = targetCardsForEntry(entry);
  if (targetCards.length > 0) {
    return {
      kind: "cardLink",
      active: entry.active,
      sourceCard: cardModel(entry.active.source),
      relatedCards: targetCards.map(cardModel),
      relationLabel: "targets",
      tone: "targeting",
    };
  }
  return {
    kind: "effectText",
    active: entry.active,
    card: cardModel(entry.active.source),
  };
};
