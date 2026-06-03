import type { GameState, PlayerId } from "@optcg/types";

import {
  allContinuousEffects,
  continuousEffectConditionPasses,
  durationIsActive,
} from "./compute-view-continuous.js";

const playerRefMatches = (
  state: GameState,
  controllerId: PlayerId,
  ownerId: PlayerId,
  playerRef: string,
  playerId: PlayerId,
): boolean => {
  if (playerRef === "self" || playerRef === "controller") {
    return playerId === controllerId;
  }
  if (playerRef === "opponent") {
    return playerId !== controllerId;
  }
  if (playerRef === "turnPlayer") {
    return playerId === state.turn.turnPlayerId;
  }
  if (playerRef === "nonTurnPlayer") {
    return playerId !== state.turn.turnPlayerId;
  }
  if (playerRef === "owner") {
    return playerId === ownerId;
  }
  return false;
};

const sourceCategoryLabel = (category: string): string => {
  if (category === "character") return "character";
  if (category === "event") return "Event";
  if (category === "stage") return "Stage";
  if (category === "leader") return "Leader";
  return category;
};

const playerRestrictionLabel = (
  restriction: string,
  sourceCategories: readonly string[] | undefined,
): string | undefined => {
  if (restriction !== "cannotActivateDon") {
    return undefined;
  }
  const sourceLabel =
    sourceCategories === undefined || sourceCategories.length === 0
      ? "effect"
      : sourceCategories.map(sourceCategoryLabel).join("/");
  return `no-${sourceLabel}-don-refresh`;
};

export const playerRestrictionLabels = (
  state: GameState,
  playerId: PlayerId,
): string[] => {
  const restrictions: string[] = [];
  for (const effect of allContinuousEffects(state)) {
    if (!durationIsActive(state, effect)) continue;
    if (!continuousEffectConditionPasses(state, effect)) continue;
    if (effect.modifier.layer !== "restriction") continue;
    if (effect.modifier.target.type !== "player") continue;
    if (effect.modifier.operation.type !== "restriction") continue;
    if (
      !playerRefMatches(
        state,
        effect.controller,
        effect.source.playerId,
        effect.modifier.target.player,
        playerId,
      )
    ) {
      continue;
    }
    const label = playerRestrictionLabel(
      effect.modifier.operation.restriction,
      effect.modifier.operation.sourceCategories,
    );
    if (label !== undefined && !restrictions.includes(label)) {
      restrictions.push(label);
    }
  }
  return restrictions;
};
