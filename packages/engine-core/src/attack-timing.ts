import type {
  CardId,
  CardInstance,
  EffectDefinition,
  GameState,
  MatchCardManifest,
  ResolvedCard,
} from "@optcg/types";

const hasOnlyWhenAttackingEffects = (
  definition: EffectDefinition | undefined,
): definition is EffectDefinition =>
  definition !== undefined &&
  definition.effects.length > 0 &&
  definition.effects.every((effect) => effect.trigger.type === "whenAttacking");

const definitionSupportsAttackTimingSanitization = (
  manifest: MatchCardManifest,
  card: ResolvedCard,
): boolean => {
  const effectDefinitionId = card.support.effectDefinitionId;
  if (effectDefinitionId === undefined) {
    return false;
  }
  return hasOnlyWhenAttackingEffects(
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
  attackerCardId: CardId,
): MatchCardManifest => {
  const attackerMetadata = manifest.cards[attackerCardId];
  if (
    attackerMetadata === undefined ||
    !definitionSupportsAttackTimingSanitization(manifest, attackerMetadata)
  ) {
    return manifest;
  }

  const nextDefinitions = Object.fromEntries(
    Object.entries(manifest.effectDefinitions ?? {}).filter(
      ([, definition]) =>
        definition.cardId !== attackerCardId ||
        !hasOnlyWhenAttackingEffects(definition),
    ),
  );

  const { effectDefinitions, ...manifestWithoutDefinitions } = manifest;
  void effectDefinitions;

  return {
    ...manifestWithoutDefinitions,
    cards: {
      ...manifest.cards,
      [attackerCardId]: sanitizeResolvedCardForCombatView(attackerMetadata),
    },
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
    attacker.cardId,
  );
  return cardManifest === state.cardManifest
    ? state
    : { ...state, cardManifest };
};
