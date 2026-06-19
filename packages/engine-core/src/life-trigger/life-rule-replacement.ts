import type {
  CardInstance,
  ContinuousEffectRecord,
  Effect,
  GameState,
  PlayerId,
} from "@optcg/types";

import { reindexZoneCards } from "../actions/state.js";
import { allContinuousEffects } from "../runtime/continuous/active-effects.js";

type LifeRuleReplacement = {
  readonly record: ContinuousEffectRecord;
  readonly replacement: Extract<Effect, { type: "replacement" }>;
};

const isFaceUpLifeToHandDeckBottomReplacement = (
  effect: Extract<Effect, { type: "replacement" }>,
): boolean =>
  effect.when.type === "wouldMoveZone" &&
  effect.when.from === "life" &&
  effect.when.to === "hand" &&
  effect.when.lifeMatcher?.faceUp === true &&
  effect.when.target.type === "all" &&
  effect.when.target.zone === "life" &&
  effect.when.target.player === "self" &&
  effect.instead.type === "bounce" &&
  effect.instead.target.type === "replacementTarget" &&
  effect.instead.destination === "deckBottom";

const isPlayerSelfReplacementTarget = (
  record: ContinuousEffectRecord,
): boolean =>
  record.modifier.target.type === "player" &&
  record.modifier.target.player === "self";

export const findLifeRuleAddToHandReplacement = (
  state: GameState,
  playerId: PlayerId,
  sourceLifeFaceUp: boolean,
): LifeRuleReplacement | undefined => {
  if (!sourceLifeFaceUp) {
    return undefined;
  }
  for (const record of allContinuousEffects(state)) {
    if (
      record.controller !== playerId ||
      !isPlayerSelfReplacementTarget(record) ||
      record.modifier.layer !== "replacement" ||
      record.modifier.operation.type !== "replacement"
    ) {
      continue;
    }
    const replacement = record.modifier.operation.replacement;
    if (isFaceUpLifeToHandDeckBottomReplacement(replacement)) {
      return { record, replacement };
    }
  }
  return undefined;
};

export const applyLifeRuleDeckBottomReplacement = (
  playerDeck: readonly CardInstance[],
  card: CardInstance,
  playerId: PlayerId,
): { readonly deck: CardInstance[]; readonly card: CardInstance } => {
  const movedCard: CardInstance = {
    ...card,
    owner: playerId,
    controller: playerId,
    attachedDon: [],
    zone: {
      zone: "deck",
      playerId,
      slot: "deck",
      index: playerDeck.length,
    },
  };
  const deck = reindexZoneCards(
    [...playerDeck, movedCard],
    "deck",
    playerId,
    "deck",
  );
  return { deck, card: deck[deck.length - 1] ?? movedCard };
};
