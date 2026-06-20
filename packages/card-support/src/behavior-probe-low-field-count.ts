import type {
  CardInstance,
  Condition,
  Effect,
  EffectBlock,
  GameState,
  PayCostEffect,
} from "@optcg/types";

export const enforceLowFieldCountConditions = (
  state: GameState,
  source: CardInstance,
  effects: readonly EffectBlock[],
): void => {
  for (const effect of effects) {
    enforceLowFieldCountCondition(state, source, effect.condition);
    enforceLowFieldCountConditionsInEffect(state, source, effect.effect);
  }
};

const enforceLowFieldCountConditionsInSequenceEffect = (
  state: GameState,
  source: CardInstance,
  effect: Effect | PayCostEffect,
): void => {
  if (effect.type === "payCost") {
    return;
  }
  enforceLowFieldCountConditionsInEffect(state, source, effect);
};

const enforceLowFieldCountConditionsInEffect = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): void => {
  if (effect.type === "conditional") {
    enforceLowFieldCountCondition(state, source, effect.if);
    enforceLowFieldCountConditionsInEffect(state, source, effect.then);
    if (effect.else !== undefined) {
      enforceLowFieldCountConditionsInEffect(state, source, effect.else);
    }
    return;
  }
  if (effect.type === "sequence") {
    for (const segment of effect.effects) {
      enforceLowFieldCountConditionsInSequenceEffect(
        state,
        source,
        segment.effect,
      );
    }
    return;
  }
  if (effect.type === "choice") {
    for (const option of effect.options) {
      enforceLowFieldCountConditionsInEffect(state, source, option.effect);
    }
    return;
  }
  if (effect.type === "delayed" || effect.type === "forEachSavedTarget") {
    enforceLowFieldCountConditionsInEffect(state, source, effect.effect);
    return;
  }
  if (effect.type === "replacement") {
    enforceLowFieldCountConditionsInEffect(state, source, effect.instead);
  }
};

const enforceLowFieldCountCondition = (
  state: GameState,
  source: CardInstance,
  condition: Condition | undefined,
): void => {
  if (condition === undefined) {
    return;
  }
  if (condition.type === "and" || condition.type === "or") {
    for (const child of condition.conditions) {
      enforceLowFieldCountCondition(state, source, child);
    }
    return;
  }
  if (condition.type === "not") {
    enforceLowFieldCountCondition(state, source, condition.condition);
    return;
  }
  if (
    condition.type !== "fieldCount" ||
    condition.player !== "self" ||
    (condition.op !== "lte" && condition.op !== "lt")
  ) {
    return;
  }
  const player = state.players[source.controller];
  if (player === undefined) {
    return;
  }
  const limit =
    condition.op === "lt" ? Math.max(0, condition.value - 1) : condition.value;
  const kept: CardInstance[] = [];
  for (const card of player.characters) {
    if (card.instanceId === source.instanceId) {
      kept.unshift(card);
      continue;
    }
    if (kept.length < limit) {
      kept.push(card);
    }
  }
  player.characters = kept.slice(0, limit).map((card, index) => ({
    ...card,
    zone: {
      zone: "characterArea",
      playerId: source.controller,
      slot: "character",
      index,
    },
  }));
};
