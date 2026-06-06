import type { CardFilter, GameState, PlayerId, TargetSpec } from "@optcg/types";

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

const playCategoryLabel = (category: string): string => {
  if (category === "character") return "characters";
  if (category === "event") return "Events";
  if (category === "stage") return "Stages";
  if (category === "leader") return "Leaders";
  return category;
};

const costRestrictionLabel = (filter: CardFilter | undefined): string => {
  const cost = filter?.cost;
  if (cost === undefined) {
    return "";
  }
  if ("op" in cost) {
    if (cost.op === "gte") return `-cost-${String(cost.value)}-or-more`;
    if (cost.op === "gt") return `-cost-over-${String(cost.value)}`;
    if (cost.op === "lte") return `-cost-${String(cost.value)}-or-less`;
    if (cost.op === "lt") return `-cost-under-${String(cost.value)}`;
    if (cost.op === "eq") return `-cost-${String(cost.value)}`;
    return `-cost-not-${String(cost.value)}`;
  }
  if (cost.min !== undefined && cost.max !== undefined) {
    return cost.min === cost.max
      ? `-cost-${String(cost.min)}`
      : `-cost-${String(cost.min)}-to-${String(cost.max)}`;
  }
  if (cost.min !== undefined) {
    return `-cost-${String(cost.min)}-or-more`;
  }
  if (cost.max !== undefined) {
    return `-cost-${String(cost.max)}-or-less`;
  }
  return "";
};

const playRestrictionLabel = (target: TargetSpec): string | undefined => {
  if (target.type !== "allMatching" || target.zone !== "hand") {
    return undefined;
  }
  const filter = target.filter;
  const categories =
    filter?.categories === undefined || filter.categories.length === 0
      ? ["card"]
      : filter.categories;
  const categoryLabel = categories.map(playCategoryLabel).join("/");
  return `no-playing-${categoryLabel}${costRestrictionLabel(filter)}`;
};

const playerRestrictionLabel = (
  restriction: string,
  sourceCategories: readonly string[] | undefined,
  target: TargetSpec,
): string | undefined => {
  if (restriction === "cannotPlay") {
    return playRestrictionLabel(target);
  }
  if (restriction === "cannotActivateDon") {
    const sourceLabel =
      sourceCategories === undefined || sourceCategories.length === 0
        ? "effect"
        : sourceCategories.map(sourceCategoryLabel).join("/");
    return `no-${sourceLabel}-don-refresh`;
  }
  return undefined;
};

const playerRestrictionTargetPlayer = (
  target: TargetSpec,
): string | undefined => {
  if (target.type === "player") {
    return target.player;
  }
  if (target.type === "allMatching" && target.zone === "hand") {
    return target.player;
  }
  return undefined;
};

export const playerRestrictionLabels = (
  state: GameState,
  playerId: PlayerId,
): string[] => {
  const restrictions: string[] = [];
  for (const effect of allContinuousEffects(state)) {
    if (effect.modifier.layer !== "restriction") continue;
    if (effect.modifier.operation.type !== "restriction") continue;
    if (!durationIsActive(state, effect)) continue;
    if (!continuousEffectConditionPasses(state, effect)) continue;
    const targetPlayer = playerRestrictionTargetPlayer(effect.modifier.target);
    if (targetPlayer === undefined) continue;
    if (
      !playerRefMatches(
        state,
        effect.controller,
        effect.source.playerId,
        targetPlayer,
        playerId,
      )
    ) {
      continue;
    }
    const label = playerRestrictionLabel(
      effect.modifier.operation.restriction,
      effect.modifier.operation.sourceCategories,
      effect.modifier.target,
    );
    if (label !== undefined && !restrictions.includes(label)) {
      restrictions.push(label);
    }
  }
  return restrictions;
};
