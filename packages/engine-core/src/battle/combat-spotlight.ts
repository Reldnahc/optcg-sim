import type {
  CardInstance,
  CardRef,
  EngineEvent,
  GameState,
  PlayerId,
} from "@optcg/types";

import { appendCombatSpotlightEntryCreatedEvent } from "../action-results.js";

export const cardRefForCombat = (
  card: CardInstance,
  playerId: PlayerId,
): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

export const appendDamageSpotlightEntry = ({
  attacker,
  attackerPower,
  defender,
  defenderPower,
  events,
  state,
}: {
  readonly state: GameState;
  readonly events: EngineEvent[];
  readonly attacker: CardRef;
  readonly defender: CardRef;
  readonly attackerPower: number;
  readonly defenderPower: number;
}): void => {
  const damageDealt = events.at(-1);
  if (damageDealt === undefined || damageDealt.type !== "damageDealt") {
    return;
  }
  appendCombatSpotlightEntryCreatedEvent({
    state,
    events,
    anchorEvent: damageDealt,
    combat: {
      eventKind: "damageDealt",
      attacker,
      defender,
      attackerPower,
      defenderPower,
      amount: 1,
    },
  });
};

export const appendBattleKoSpotlightEntry = ({
  attacker,
  attackerPower,
  defender,
  defenderPower,
  events,
  state,
}: {
  readonly state: GameState;
  readonly events: EngineEvent[];
  readonly attacker: CardRef;
  readonly defender: CardRef;
  readonly attackerPower: number;
  readonly defenderPower: number;
}): void => {
  const cardKOd = events.at(-1);
  if (cardKOd === undefined || cardKOd.type !== "cardKOd") {
    return;
  }
  appendCombatSpotlightEntryCreatedEvent({
    state,
    events,
    anchorEvent: cardKOd,
    combat: {
      eventKind: "battleKOd",
      attacker,
      defender,
      attackerPower,
      defenderPower,
    },
  });
};
