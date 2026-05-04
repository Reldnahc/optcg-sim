import type {
  CardInstance,
  ComputedCardView,
  ComputedGameView,
  GameState,
  InstanceId,
  Keyword,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

const unsupportedCombatKeywords = new Set<Keyword>([
  "doubleAttack",
  "banish",
  "blocker",
  "unblockable",
]);

const isLeaderOrCharacter = (
  card: CardInstance,
): card is CardInstance & { zone: { zone: "leaderArea" | "characterArea" } } =>
  card.zone.zone === "leaderArea" || card.zone.zone === "characterArea";

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
  if (resolved.support.status !== "vanilla-confirmed") {
    throw new TypeError(
      `Unsupported support status ${resolved.support.status} for ${String(card.cardId)}.`,
    );
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

  return {
    instanceId: card.instanceId,
    cardId: card.cardId,
    basePower,
    currentPower: basePower + donBonus,
    keywords: [...metadata.printedKeywords] as Keyword[],
    canAttack: canAttackNow(state, card),
    canBlock: false,
    cannotBeAttacked: false,
    protectedFrom: [],
  };
};

export const computeView = (state: GameState): ComputedGameView => {
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
