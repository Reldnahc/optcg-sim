import type { CardRef, EffectQueueEntry, GameState } from "@optcg/types";

import { reifyCardRef } from "../../actions/state.js";

export const controllerLeaderRef = (
  state: GameState,
  entry: EffectQueueEntry,
): CardRef | null => {
  const leader = state.players[entry.controllerId]?.leader;
  return leader === undefined
    ? null
    : {
        instanceId: leader.instanceId,
        cardId: leader.cardId,
        playerId: entry.controllerId,
        zone: leader.zone,
      };
};

export const battleAttackerRef = (state: GameState): CardRef | null => {
  const attacker = state.battle?.attacker;
  if (attacker === undefined) {
    return null;
  }
  const resolved = reifyCardRef(state, attacker);
  return resolved === null
    ? null
    : {
        instanceId: resolved.card.instanceId,
        cardId: resolved.card.cardId,
        playerId: resolved.playerId,
        zone: resolved.card.zone,
      };
};

export const battleCurrentTargetRef = (state: GameState): CardRef | null => {
  const target = state.battle?.currentTarget;
  if (target === undefined) {
    return null;
  }
  const resolved = reifyCardRef(state, target);
  return resolved === null
    ? null
    : {
        instanceId: resolved.card.instanceId,
        cardId: resolved.card.cardId,
        playerId: resolved.playerId,
        zone: resolved.card.zone,
      };
};
