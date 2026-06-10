import type {
  CardRef,
  Effect,
  EffectExecutionFrame,
  EffectQueueEntry,
  GameState,
} from "@optcg/types";

import { resolveSavedFieldObjectKoSelection } from "../../runtime/primitives/execute.js";

export const resolveActivateTargets = (
  state: GameState,
  entry: EffectQueueEntry,
  target: Extract<Effect, { type: "activate" }>["target"],
  savedReferences: EffectExecutionFrame["savedReferences"],
): { ok: true; selectedTargets: CardRef[] } | { ok: false } => {
  if (target.type === "savedFieldObject") {
    const resolved = resolveSavedFieldObjectKoSelection({
      controllerId: entry.controllerId,
      savedReferences,
      state,
      target,
    });
    return resolved.ok
      ? { ok: true, selectedTargets: [...resolved.selectedTargets] }
      : { ok: false };
  }
  if (target.type === "self") {
    if (entry.source.zone === undefined) {
      return { ok: false };
    }
    return {
      ok: true,
      selectedTargets: [
        {
          instanceId: entry.source.instanceId,
          cardId: entry.source.cardId,
          playerId: entry.source.playerId,
          zone: entry.source.zone,
        },
      ],
    };
  }
  const player = state.players[entry.controllerId];
  if (player === undefined) {
    return { ok: false };
  }
  if (target.type === "myLeader") {
    return {
      ok: true,
      selectedTargets: [
        {
          instanceId: player.leader.instanceId,
          cardId: player.leader.cardId,
          playerId: entry.controllerId,
          zone: player.leader.zone,
        },
      ],
    };
  }
  if (
    target.type === "all" &&
    target.player === "self" &&
    target.zone === "characterArea"
  ) {
    return {
      ok: true,
      selectedTargets: player.characters.map((card) => ({
        instanceId: card.instanceId,
        cardId: card.cardId,
        playerId: entry.controllerId,
        zone: card.zone,
      })),
    };
  }
  return { ok: false };
};
