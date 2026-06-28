import type { GameState, PlayerId } from "@optcg/types";

import { getSupportedCounterEventActivations } from "./counter-event-activation.js";
import { getActiveDonCount } from "../play-card/support.js";
import { getEffectiveCharacterCounterValue } from "./effective-counter.js";

export const getUnsupportedCounterWindowReason = (
  state: GameState,
  defenderId: PlayerId,
): string | undefined => {
  const defender = state.players[defenderId];
  if (defender === undefined) {
    return "Battle requires unsupported counter window handling.";
  }
  for (const card of defender.hand) {
    const metadata = state.cardManifest.cards[card.cardId];
    if (metadata === undefined) {
      return "Battle requires unsupported counter window handling.";
    }
  }
  return undefined;
};

export const hasUnsupportedCounterWindow = (
  state: GameState,
  defenderId: PlayerId,
): boolean =>
  getUnsupportedCounterWindowReason(state, defenderId) !== undefined;

export const hasPotentialCharacterCounterActions = (
  state: GameState,
  defenderId: PlayerId,
): boolean => {
  const target = state.battle?.currentTarget;
  const defender = state.players[defenderId];
  if (defender === undefined) {
    return false;
  }
  return defender.hand.some((card) => {
    const metadata = state.cardManifest.cards[card.cardId];
    const supportedEvents = getSupportedCounterEventActivations(
      state,
      defenderId,
    );
    return (
      (metadata?.category === "character" &&
        (getEffectiveCharacterCounterValue(state, card) ?? 0) > 0) ||
      supportedEvents.some(
        ({ card: eventCard, activation }) =>
          eventCard.instanceId === card.instanceId &&
          getActiveDonCount(defender.costArea) >= activation.printedCost,
      )
    );
  });
};
