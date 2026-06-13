import type {
  CardRef,
  Effect,
  EffectExecutionFrame,
  EffectQueueEntry,
  GameState,
} from "@optcg/types";

import {
  cardMatchesHandSelectionFilter,
  toCardRef,
} from "../../actions/state.js";
import { resolveSavedFieldObjectKoSelection } from "../../runtime/primitives/execute.js";

type AllActivateTarget = Extract<
  Extract<Effect, { type: "activate" }>["target"],
  { type: "all" }
>;

const allActivateTargetRefs = (
  state: GameState,
  entry: EffectQueueEntry,
  target: AllActivateTarget,
): CardRef[] => {
  if (target.player !== "self") {
    return [];
  }
  const player = state.players[entry.controllerId];
  if (player === undefined) {
    return [];
  }
  const cards =
    target.zone === "leaderArea"
      ? [player.leader]
      : target.zone === "characterArea"
        ? player.characters
        : target.zone === "costArea"
          ? player.costArea
          : [];
  return cards
    .filter((card) =>
      cardMatchesHandSelectionFilter(
        state,
        entry.controllerId,
        card,
        target.filter,
      ),
    )
    .map((card) => toCardRef(card, entry.controllerId));
};

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
    (target.zone === "costArea" ||
      target.zone === "characterArea" ||
      target.zone === "leaderArea")
  ) {
    return {
      ok: true,
      selectedTargets: allActivateTargetRefs(state, entry, target),
    };
  }
  return { ok: false };
};
