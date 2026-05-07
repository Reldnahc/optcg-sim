import type {
  CardId,
  CardInstance,
  CardRef,
  EffectDefinition,
  GameState,
  MatchCardManifest,
  ResolvedCard,
} from "@optcg/types";

import {
  isSupportedNoChoiceOnKODrawEffect,
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

const isSupportedBattleRuntimeEffect = (
  effect: EffectDefinition["effects"][number],
): boolean =>
  isSupportedNoChoiceWhenAttackingDrawEffect(effect) ||
  isSupportedNoChoiceOnOpponentAttackDrawEffect(effect) ||
  isSupportedNoChoiceOnKODrawEffect(effect);

const hasSupportedBattleRuntimeDefinitionForText = (
  state: GameState,
  cardId: CardInstance["cardId"],
): boolean => {
  const card = state.cardManifest.cards[cardId];
  const effectDefinitionId = card?.support.effectDefinitionId;
  if (
    card?.support.status !== "implemented-dsl" ||
    effectDefinitionId === undefined
  ) {
    return false;
  }
  const definition = state.cardManifest.effectDefinitions?.[effectDefinitionId];
  if (
    definition === undefined ||
    definition.cardId !== cardId ||
    definition.implementationStatus !== "implemented-dsl" ||
    !definition.metadata.tested ||
    (definition.metadata.reviewer === undefined &&
      (definition.metadata.reviewedBy === undefined ||
        definition.metadata.reviewedAt === undefined))
  ) {
    return false;
  }
  return definition.effects.every(isSupportedBattleRuntimeEffect);
};

const hasOnlySupportedBattleRuntimeEffects = (
  definition: EffectDefinition | undefined,
): definition is EffectDefinition =>
  definition !== undefined &&
  definition.effects.length > 0 &&
  definition.effects.every(isSupportedBattleRuntimeEffect);

const supportsBattleRuntimeSanitization = (
  manifest: MatchCardManifest,
  card: { support?: ResolvedCard["support"] },
): boolean => {
  const effectDefinitionId = card.support?.effectDefinitionId;
  if (effectDefinitionId === undefined) {
    return false;
  }
  return hasOnlySupportedBattleRuntimeEffects(
    manifest.effectDefinitions?.[effectDefinitionId],
  );
};

const sanitizeResolvedCardForCombatView = (
  card: ResolvedCard,
): ResolvedCard => {
  const sanitizedSupport: ResolvedCard["support"] = { ...card.support };
  delete sanitizedSupport.effectDefinitionId;

  const { effectText, triggerText, ...cardWithoutText } = card;
  void effectText;
  void triggerText;
  return { ...cardWithoutText, support: sanitizedSupport };
};

export const withSupportedBattleRuntimeMetadataHidden = (
  state: GameState,
): GameState => {
  const combatCardIds = new Set<CardId>();
  for (const player of Object.values(state.players)) {
    combatCardIds.add(player.leader.cardId);
    for (const character of player.characters) {
      combatCardIds.add(character.cardId);
    }
  }

  const supportedCardIds = new Set<CardId>();
  for (const cardId of combatCardIds) {
    const metadata = state.cardManifest.cards[cardId];
    if (
      metadata !== undefined &&
      supportsBattleRuntimeSanitization(state.cardManifest, metadata)
    ) {
      supportedCardIds.add(cardId);
    }
  }
  if (supportedCardIds.size === 0) {
    return state;
  }

  const nextDefinitions = Object.fromEntries(
    Object.entries(state.cardManifest.effectDefinitions ?? {}).filter(
      ([, definition]) =>
        !supportedCardIds.has(definition.cardId) ||
        !hasOnlySupportedBattleRuntimeEffects(definition),
    ),
  );
  const { effectDefinitions, ...manifestWithoutDefinitions } =
    state.cardManifest;
  void effectDefinitions;

  const nextCards: MatchCardManifest["cards"] = {
    ...state.cardManifest.cards,
  };
  for (const cardId of supportedCardIds) {
    const metadata = state.cardManifest.cards[cardId];
    if (metadata !== undefined) {
      nextCards[cardId] = sanitizeResolvedCardForCombatView(metadata);
    }
  }

  return {
    ...state,
    cardManifest: {
      ...manifestWithoutDefinitions,
      cards: nextCards,
      ...(Object.keys(nextDefinitions).length > 0
        ? { effectDefinitions: nextDefinitions }
        : {}),
    },
  };
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
    if (
      hasText(state.cardManifest.cards[cardId]?.effectText) &&
      !hasSupportedBattleRuntimeDefinitionForText(state, cardId)
    ) {
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
        isSupportedNoChoiceOnOpponentAttackDrawEffect(effect) ||
        isSupportedNoChoiceOnKODrawEffect(effect)
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
