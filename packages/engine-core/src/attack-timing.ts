import type {
  CardId,
  CardInstance,
  EffectDefinition,
  GameState,
  MatchCardManifest,
  ResolvedCard,
} from "@optcg/types";

const isAttackTimingTrigger = (
  trigger: EffectDefinition["effects"][number]["trigger"],
): boolean =>
  trigger.type === "whenAttacking" || trigger.type === "onOpponentAttack";

const isCombatNeutralTrigger = (
  trigger: EffectDefinition["effects"][number]["trigger"],
): boolean =>
  trigger.type === "onPlay" ||
  trigger.type === "main" ||
  trigger.type === "trigger" ||
  trigger.type === "activateMain" ||
  trigger.type === "startOfGame";

const supportsAttackTimingMetadataSanitization = (
  definition: EffectDefinition | undefined,
): definition is EffectDefinition =>
  definition !== undefined &&
  definition.effects.length > 0 &&
  definition.effects.some((effect) => isAttackTimingTrigger(effect.trigger)) &&
  definition.effects.every(
    (effect) =>
      isAttackTimingTrigger(effect.trigger) ||
      isCombatNeutralTrigger(effect.trigger),
  );

const definitionSupportsAttackTimingSanitization = (
  manifest: MatchCardManifest,
  card: { support?: ResolvedCard["support"] },
): boolean => {
  const effectDefinitionId = card.support?.effectDefinitionId;
  if (effectDefinitionId === undefined) {
    return false;
  }
  return supportsAttackTimingMetadataSanitization(
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

const sanitizedManifestForAttackTiming = (
  manifest: MatchCardManifest,
  attackerCardIds: ReadonlySet<CardId>,
): MatchCardManifest => {
  const supportedCardIds = new Set<CardId>();
  for (const attackerCardId of attackerCardIds) {
    const attackerMetadata = manifest.cards[attackerCardId];
    if (
      attackerMetadata !== undefined &&
      definitionSupportsAttackTimingSanitization(manifest, attackerMetadata)
    ) {
      supportedCardIds.add(attackerCardId);
    }
  }
  if (supportedCardIds.size === 0) {
    return manifest;
  }

  const nextDefinitions = Object.fromEntries(
    Object.entries(manifest.effectDefinitions ?? {}).filter(
      ([, definition]) =>
        !supportedCardIds.has(definition.cardId) ||
        !supportsAttackTimingMetadataSanitization(definition),
    ),
  );

  const { effectDefinitions, ...manifestWithoutDefinitions } = manifest;
  void effectDefinitions;

  const nextCards: MatchCardManifest["cards"] = { ...manifest.cards };
  for (const cardId of supportedCardIds) {
    const metadata = manifest.cards[cardId];
    if (metadata !== undefined) {
      nextCards[cardId] = sanitizeResolvedCardForCombatView(metadata);
    }
  }

  return {
    ...manifestWithoutDefinitions,
    cards: nextCards,
    ...(Object.keys(nextDefinitions).length > 0
      ? { effectDefinitions: nextDefinitions }
      : {}),
  };
};

export const withAttackTimingCombatMetadataHidden = (
  state: GameState,
  attacker: CardInstance | undefined,
): GameState => {
  if (attacker === undefined) {
    return state;
  }
  const cardManifest = sanitizedManifestForAttackTiming(
    state.cardManifest,
    new Set([attacker.cardId]),
  );
  return cardManifest === state.cardManifest
    ? state
    : { ...state, cardManifest };
};

export const withAllAttackTimingCombatMetadataHidden = (
  state: GameState,
): GameState => {
  const combatCardIds = new Set<CardId>();
  for (const player of Object.values(state.players)) {
    combatCardIds.add(player.leader.cardId);
    for (const character of player.characters) {
      combatCardIds.add(character.cardId);
    }
  }
  const cardManifest = sanitizedManifestForAttackTiming(
    state.cardManifest,
    combatCardIds,
  );
  return cardManifest === state.cardManifest
    ? state
    : { ...state, cardManifest };
};
