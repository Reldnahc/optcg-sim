import type { CardInstance, CardRef, GameState, PlayerId } from "@optcg/types";

import {
  getSupportedCounterEventPowerShapeTargets,
  getSupportedCounterEventPowerTargets,
} from "./battle-counter-event-support.js";
import { getActiveDonCount } from "./play-card-support.js";

const unsupportedCounterEventReason =
  "Counter Events are unsupported in the Counter Step.";

const hasRawCounterText = (value: string | undefined): boolean =>
  value !== undefined && /\[counter\]/i.test(value);

const hasCounterTriggerDefinition = (
  state: GameState,
  cardId: CardInstance["cardId"],
): boolean =>
  Object.values(state.cardManifest.effectDefinitions ?? {}).some(
    (definition) =>
      definition.cardId === cardId &&
      definition.effects.some((effect) => effect.trigger.type === "counter"),
  );

const isUnsupportedCounterEventCandidate = (
  state: GameState,
  card: CardInstance,
  defenderId: PlayerId,
  battleTarget: CardRef | undefined,
): boolean => {
  if (
    getSupportedCounterEventPowerShapeTargets(
      state,
      card,
      defenderId,
      battleTarget,
    ).length > 0
  ) {
    return false;
  }
  const metadata = state.cardManifest.cards[card.cardId];
  return (
    metadata?.category === "event" &&
    ((metadata.counter !== undefined && metadata.counter > 0) ||
      hasRawCounterText(metadata.effectText) ||
      hasRawCounterText(metadata.triggerText) ||
      hasCounterTriggerDefinition(state, card.cardId))
  );
};

export const getUnsupportedCounterWindowReason = (
  state: GameState,
  defenderId: PlayerId,
): string | undefined => {
  const defender = state.players[defenderId];
  const target = state.battle?.currentTarget;
  if (defender === undefined) {
    return "Battle requires unsupported counter window handling.";
  }
  for (const card of defender.hand) {
    const metadata = state.cardManifest.cards[card.cardId];
    if (metadata === undefined) {
      return "Battle requires unsupported counter window handling.";
    }
    if (isUnsupportedCounterEventCandidate(state, card, defenderId, target)) {
      return unsupportedCounterEventReason;
    }
    if (
      getSupportedCounterEventPowerShapeTargets(state, card, defenderId, target)
        .length === 0 &&
      hasCounterTriggerDefinition(state, card.cardId)
    ) {
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
        metadata.counter !== undefined &&
        metadata.counter > 0) ||
      supportedEvents.some(
        (supportedEvent) =>
          getActiveDonCount(defender.costArea) >= supportedEvent.printedCost,
      )
    );
  });
};
