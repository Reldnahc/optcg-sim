import type {
  CardInstance,
  ComputedCardView,
  ComputedGameView,
  ContinuousEffectRecord,
  GameState,
  InstanceId,
  Keyword,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

const unsupportedCombatKeywords = new Set<Keyword>([
  "doubleAttack",
  "unblockable",
]);
const supportedDslCombatKeywords = new Set<Keyword>([
  "rush",
  "rushCharacter",
  "banish",
  "blocker",
]);

const isLeaderOrCharacter = (
  card: CardInstance,
): card is CardInstance & { zone: { zone: "leaderArea" | "characterArea" } } =>
  card.zone.zone === "leaderArea" || card.zone.zone === "characterArea";

const isSupportedContinuousPowerModifier = (
  effect: ContinuousEffectRecord,
): boolean =>
  effect.condition === undefined &&
  (effect.duration.type === "permanent" ||
    effect.duration.type === "whileSourceOnField") &&
  effect.modifier.layer === "powerAdd" &&
  effect.modifier.target.type === "self" &&
  effect.modifier.operation.type === "addPower" &&
  effect.modifier.operation.value === 1000;

const assertSupportedContinuousEffects = (
  continuousEffects: readonly ContinuousEffectRecord[],
): void => {
  for (const effect of continuousEffects) {
    if (!isSupportedContinuousPowerModifier(effect)) {
      throw new TypeError(
        `Unsupported continuous effect ${effect.id}: only unconditional self +1000 powerAdd modifiers with permanent or whileSourceOnField duration are supported by computeView.`,
      );
    }
  }
};

const continuousPowerBonusForCard = (
  state: GameState,
  card: CardInstance,
): number => {
  let powerBonus = 0;

  for (const effect of state.continuousEffects) {
    if (effect.duration.type !== "permanent") continue;
    if (effect.condition !== undefined) continue;
    if (effect.modifier.layer !== "powerAdd") continue;
    if (effect.modifier.target.type !== "self") continue;
    if (effect.modifier.operation.type !== "addPower") continue;
    if (effect.modifier.operation.value !== 1000) continue;
    if (effect.source.instanceId !== card.instanceId) continue;
    if (effect.source.cardId !== card.cardId) continue;
    if (effect.source.playerId !== card.controller) continue;

    powerBonus += effect.modifier.operation.value;
  }

  return powerBonus;
};

const resolveCombatMetadata = (
  state: GameState,
  card: CardInstance,
): ResolvedCard & { power: number } => {
  const resolved = state.cardManifest.cards[card.cardId];
  if (resolved === undefined) {
    throw new TypeError(
      `Missing card manifest metadata for combat card ${String(card.cardId)}.`,
    );
  }
  if (resolved.category !== "leader" && resolved.category !== "character") {
    throw new TypeError(
      `Unsupported combat category ${resolved.category} for ${String(card.cardId)}.`,
    );
  }
  if (resolved.power === undefined) {
    throw new TypeError(
      `Missing combat power metadata for ${String(card.cardId)}.`,
    );
  }
  if (
    resolved.support.status !== "vanilla-confirmed" &&
    resolved.support.status !== "implemented-dsl"
  ) {
    throw new TypeError(
      `Unsupported support status ${resolved.support.status} for ${String(card.cardId)}.`,
    );
  }
  if (
    resolved.support.effectDefinitionId !== undefined ||
    Object.values(state.cardManifest.effectDefinitions ?? {}).some(
      (definition) => definition.cardId === card.cardId,
    )
  ) {
    throw new TypeError(
      `Unsupported combat effect definition for ${String(card.cardId)}.`,
    );
  }
  if (resolved.support.status === "implemented-dsl") {
    if (
      (resolved.effectText ?? "").trim().length > 0 ||
      (resolved.triggerText ?? "").trim().length > 0
    ) {
      throw new TypeError(
        `Unsupported combat text metadata for ${String(card.cardId)}.`,
      );
    }
    for (const keyword of resolved.printedKeywords) {
      if (!supportedDslCombatKeywords.has(keyword)) {
        throw new TypeError(
          `Unsupported combat keyword ${keyword} for ${String(card.cardId)}.`,
        );
      }
    }
  }
  for (const keyword of resolved.printedKeywords) {
    if (unsupportedCombatKeywords.has(keyword)) {
      throw new TypeError(
        `Unsupported combat keyword ${keyword} for ${String(card.cardId)}.`,
      );
    }
  }
  return resolved as ResolvedCard & { power: number };
};

const canAttackNow = (state: GameState, card: CardInstance): boolean => {
  if (card.controller !== state.turn.turnPlayerId) return false;
  if (state.turn.phase !== "main") return false;
  if (state.battle !== undefined) return false;
  if (card.state !== "active") return false;
  if (!isLeaderOrCharacter(card)) return false;

  const turnCount = state.turn.playerTurnCounts[card.controller];
  if (turnCount === 1) return false;

  if (
    card.zone.zone === "characterArea" &&
    card.turnPlayed === state.turn.globalTurn
  ) {
    const metadata = resolveCombatMetadata(state, card);
    const hasRush = metadata.printedKeywords.includes("rush");
    const hasRushCharacter = metadata.printedKeywords.includes("rushCharacter");
    if (!hasRush && !hasRushCharacter) return false;
  }
  return true;
};

const legalTargetsForAttacker = (
  state: GameState,
  attacker: CardInstance,
): InstanceId[] => {
  if (!canAttackNow(state, attacker)) return [];
  const opponentId = (Object.keys(state.players) as PlayerId[]).find(
    (playerId) => playerId !== attacker.controller,
  );
  if (opponentId === undefined) return [];
  const opponent = state.players[opponentId];
  if (opponent === undefined) return [];

  const targets: InstanceId[] = [];
  const metadata = resolveCombatMetadata(state, attacker);
  const isPlayedThisTurnCharacter =
    attacker.zone.zone === "characterArea" &&
    attacker.turnPlayed === state.turn.globalTurn;
  const rushCharacterOnly =
    isPlayedThisTurnCharacter &&
    metadata.printedKeywords.includes("rushCharacter");

  if (!rushCharacterOnly) {
    resolveCombatMetadata(state, opponent.leader);
    targets.push(opponent.leader.instanceId);
  }

  for (const character of opponent.characters) {
    resolveCombatMetadata(state, character);
    if (character.state === "rested") {
      targets.push(character.instanceId);
    }
  }
  return targets;
};

const isCardRefLive = (
  state: GameState,
  ref: {
    instanceId: InstanceId;
    cardId: CardInstance["cardId"];
    playerId: PlayerId;
  },
): boolean => {
  const player = state.players[ref.playerId];
  if (player === undefined) return false;
  if (
    player.leader.instanceId === ref.instanceId &&
    player.leader.cardId === ref.cardId
  ) {
    return true;
  }
  return player.characters.some(
    (character) =>
      character.instanceId === ref.instanceId &&
      character.cardId === ref.cardId,
  );
};

const canBlockNow = (
  state: GameState,
  card: CardInstance,
  metadata: ResolvedCard & { power: number },
): boolean => {
  if (card.zone.zone !== "characterArea") return false;
  if (card.state !== "active") return false;
  if (!metadata.printedKeywords.includes("blocker")) return false;
  const battle = state.battle;
  if (battle === undefined || battle.step !== "block") return false;
  if (!isCardRefLive(state, battle.attacker)) return false;
  if (!isCardRefLive(state, battle.currentTarget)) return false;
  const defenderId = battle.currentTarget.playerId;
  return card.controller === defenderId;
};

const computeCardView = (
  state: GameState,
  card: CardInstance,
): ComputedCardView => {
  const metadata = resolveCombatMetadata(state, card);
  const basePower = metadata.power;
  const donBonus =
    card.controller === state.turn.turnPlayerId
      ? card.attachedDon.length * 1000
      : 0;
  const counterBonus =
    state.battle !== undefined &&
    state.battle.currentTarget.instanceId === card.instanceId &&
    state.battle.currentTarget.cardId === card.cardId
      ? (state.battle.counterPower ?? 0)
      : 0;
  const continuousPowerBonus = continuousPowerBonusForCard(state, card);

  return {
    instanceId: card.instanceId,
    cardId: card.cardId,
    basePower,
    currentPower: basePower + donBonus + counterBonus + continuousPowerBonus,
    keywords: [...metadata.printedKeywords] as Keyword[],
    canAttack: canAttackNow(state, card),
    canBlock: canBlockNow(state, card, metadata),
    cannotBeAttacked: false,
    protectedFrom: [],
  };
};

export const computeView = (state: GameState): ComputedGameView => {
  assertSupportedContinuousEffects(state.continuousEffects);

  const cards: ComputedGameView["cards"] = {};
  const legalAttackTargets: ComputedGameView["legalAttackTargets"] = {};
  const allCombatCards: CardInstance[] = [];

  for (const player of Object.values(state.players)) {
    allCombatCards.push(player.leader, ...player.characters);
  }

  for (const card of allCombatCards) {
    cards[card.instanceId] = computeCardView(state, card);
    legalAttackTargets[card.instanceId] = legalTargetsForAttacker(state, card);
  }

  return {
    seq: state.seq,
    turnPlayerId: state.turn.turnPlayerId,
    cards,
    legalAttackTargets,
    restrictions: {},
  };
};
