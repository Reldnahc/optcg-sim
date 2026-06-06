import type { GameState, PlayerId } from "@optcg/types";

import { getSupportedCounterEventPowerTargets } from "./counter-event-support.js";
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
    const supportedEvents = getSupportedCounterEventPowerTargets(
      state,
      card,
      defenderId,
      target,
    );
    return (
      (metadata?.category === "character" &&
        (getEffectiveCharacterCounterValue(state, card) ?? 0) > 0) ||
      supportedEvents.some(
        (supportedEvent) =>
          getActiveDonCount(defender.costArea) >= supportedEvent.printedCost,
      )
    );
  });
};
