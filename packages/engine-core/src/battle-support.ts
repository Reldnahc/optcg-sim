import type { CardInstance, CardRef, GameState } from "@optcg/types";

import {
  isSupportedNoChoiceOnOpponentAttackDrawEffect,
  isSupportedNoChoiceWhenAttackingDrawEffect,
} from "./effect-runtime.js";

export const sameCardRef = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId;

export const expireBattleDurationStateForCleanup = (
  state: GameState,
): GameState => {
  const cleanedState: GameState = {
    ...state,
    continuousEffects: state.continuousEffects.filter(
      (effect) => effect.duration.type !== "thisBattle",
    ),
  };
  delete cleanedState.battle;
  return cleanedState;
};

const hasText = (value: string | undefined): boolean =>
  value !== undefined && value.trim().length > 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const hasThisBattleDuration = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }
  const duration = value["duration"];
  if (isRecord(duration) && duration["type"] === "thisBattle") {
    return true;
  }
  return Object.values(value).some((entry) => hasThisBattleDuration(entry));
};

const hasUnsupportedBattleEffectBody = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }

  const type = value["type"];
  if (
    type === "protectFromKO" ||
    type === "cannotBeBlockedBy" ||
    type === "cannotBeAttacked" ||
    type === "cannotBlock"
  ) {
    return true;
  }
  if (type === "giveKeyword" && value["keyword"] === "unblockable") {
    return true;
  }

  const operation = value["operation"];
  if (isRecord(operation)) {
    if (
      operation["type"] === "protection" ||
      operation["type"] === "restriction"
    ) {
      return true;
    }
    if (isRecord(operation["protection"])) {
      return true;
    }
  }
  if (isRecord(value["protection"])) {
    return true;
  }

  return Object.values(value).some((entry) =>
    hasUnsupportedBattleEffectBody(entry),
  );
};

export const hasUnsupportedBattleEffectMetadata = (
  state: GameState,
): boolean => {
  const combatCardIds = new Set<CardInstance["cardId"]>();
  for (const player of Object.values(state.players)) {
    combatCardIds.add(player.leader.cardId);
    for (const character of player.characters) {
      combatCardIds.add(character.cardId);
    }
  }

  for (const cardId of combatCardIds) {
    if (hasText(state.cardManifest.cards[cardId]?.effectText)) {
      return true;
    }
  }

  for (const definition of Object.values(
    state.cardManifest.effectDefinitions ?? {},
  )) {
    if (!combatCardIds.has(definition.cardId)) {
      continue;
    }
    for (const effect of definition.effects) {
      if (
        isSupportedNoChoiceWhenAttackingDrawEffect(effect) ||
        isSupportedNoChoiceOnOpponentAttackDrawEffect(effect)
      ) {
        continue;
      }
      if (
        effect.trigger.type === "counter" ||
        effect.trigger.type === "onBlock" ||
        effect.trigger.type === "onKO" ||
        effect.trigger.type === "endOfBattle" ||
        effect.trigger.type === "whenAttacking" ||
        effect.trigger.type === "onOpponentAttack" ||
        effect.category === "replacement" ||
        hasThisBattleDuration(effect.effect) ||
        hasUnsupportedBattleEffectBody(effect.effect)
      ) {
        return true;
      }
    }
  }

  return false;
};

export const isSupportedBattleResolutionEnvelope = (
  battle: NonNullable<GameState["battle"]>,
): boolean => {
  if (battle.damageCount !== 1) {
    return false;
  }
  if (battle.blocker === undefined) {
    return battle.step === "attack" || battle.step === "counter";
  }
  return (
    (battle.step === "block" || battle.step === "counter") &&
    sameCardRef(battle.blocker, battle.currentTarget)
  );
};
