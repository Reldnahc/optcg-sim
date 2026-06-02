import type {
  CardFilter,
  CardRef,
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

import {
  allContinuousEffects,
  assertSupportedContinuousEffects,
  continuousEffectConditionPasses,
  durationIsActive,
  isCardRefLive,
  isSupportedContinuousKeywordModifier,
  recordConditionPasses,
} from "./compute-view-continuous.js";
import { fieldRemovalProtectionsForCard } from "../replacement/field-removal-protection.js";

type EngineInternalBattleState = NonNullable<GameState["battle"]> & {
  counterPower?: number;
};

const unsupportedCombatKeywords = new Set<Keyword>(["doubleAttack"]);
interface ComputeViewOptions {
  supportStatusPolicy?: "throw" | "ignore";
  unsupportedCombatKeywordPolicy?: "throw" | "ignore";
}

const isLeaderOrCharacter = (
  card: CardInstance,
): card is CardInstance & { zone: { zone: "leaderArea" | "characterArea" } } =>
  card.zone.zone === "leaderArea" || card.zone.zone === "characterArea";

const cardMatchesRef = (card: CardInstance, ref: CardRef): boolean =>
  card.instanceId === ref.instanceId &&
  card.cardId === ref.cardId &&
  card.controller === ref.playerId;

const numericFilterMatches = (
  value: number | undefined,
  filter: CardFilter["cost"] | CardFilter["power"],
): boolean => {
  if (filter === undefined) return true;
  if (value === undefined) return false;
  if ("op" in filter) return value === filter.value;
  if (filter.min !== undefined && value < filter.min) return false;
  if (filter.max !== undefined && value > filter.max) return false;
  return true;
};

const cardMatchesAllFilter = (
  state: GameState,
  card: CardInstance,
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) return true;
  const metadata = state.cardManifest.cards[card.cardId];
  if (metadata === undefined) return false;
  if (
    filter.categories !== undefined &&
    !filter.categories.includes(metadata.category)
  ) {
    return false;
  }
  if (
    filter.typesAny !== undefined &&
    !filter.typesAny.some((type) => metadata.types.includes(type))
  ) {
    return false;
  }
  if (
    filter.names !== undefined &&
    !filter.names.some((name) => metadata.name === name)
  ) {
    return false;
  }
  return (
    numericFilterMatches(metadata.cost, filter.cost) &&
    numericFilterMatches(metadata.power, filter.power)
  );
};

const cardMatchesAllTarget = (
  state: GameState,
  card: CardInstance,
  effect: ContinuousEffectRecord,
): boolean => {
  const target = effect.modifier.target;
  if (target.type !== "all") return false;
  if (target.zone !== card.zone.zone) return false;
  if (!cardMatchesAllFilter(state, card, target.filter)) return false;
  if (target.player === "self") {
    return card.controller === effect.controller;
  }
  if (target.player === "opponent") {
    return card.controller !== effect.controller;
  }
  return false;
};

const cardMatchesModifierTarget = (
  state: GameState,
  card: CardInstance,
  effect: ContinuousEffectRecord,
): boolean => {
  const target = effect.modifier.target;
  if (target.type === "self") {
    return cardMatchesRef(card, effect.source);
  }
  if (target.type === "myLeader") {
    return (
      card.zone.zone === "leaderArea" && card.controller === effect.controller
    );
  }
  if (target.type === "exactCard") {
    const cardZone = card.zone.zone;
    const targetZone = target.card.zone?.zone;
    if (target.binding.family !== "selectedTargets") return false;
    if (targetZone !== "leaderArea" && targetZone !== "characterArea") {
      return false;
    }
    if (cardZone !== targetZone) return false;
    return cardMatchesRef(card, target.card);
  }
  return cardMatchesAllTarget(state, card, effect);
};

const continuousPowerBonusForCard = (
  state: GameState,
  card: CardInstance,
): number => {
  let powerBonus = 0;
  const effects = allContinuousEffects(state);

  for (const effect of effects) {
    if (!durationIsActive(state, effect)) continue;
    if (!recordConditionPasses(state, effect)) continue;
    if (effect.modifier.layer !== "powerAdd") continue;
    if (effect.modifier.operation.type !== "addPower") continue;
    if (!cardMatchesModifierTarget(state, card, effect)) continue;

    powerBonus += effect.modifier.operation.value;
  }

  return powerBonus;
};

const continuousBasePowerForCard = (
  state: GameState,
  card: CardInstance,
): number | undefined => {
  let basePower: number | undefined;
  const effects = allContinuousEffects(state);

  for (const effect of effects) {
    if (!durationIsActive(state, effect)) continue;
    if (effect.modifier.layer !== "basePowerSet") continue;
    if (effect.modifier.operation.type !== "setBasePower") continue;
    if (!continuousEffectConditionPasses(state, effect)) continue;
    if (!cardMatchesModifierTarget(state, card, effect)) continue;

    basePower =
      basePower === undefined
        ? effect.modifier.operation.value
        : Math.max(basePower, effect.modifier.operation.value);
  }

  return basePower;
};

const continuousCostBonusForCard = (
  state: GameState,
  card: CardInstance,
): number => {
  let costBonus = 0;
  const effects = allContinuousEffects(state);

  for (const effect of effects) {
    if (!durationIsActive(state, effect)) continue;
    if (!recordConditionPasses(state, effect)) continue;
    if (effect.modifier.layer !== "costAdd") continue;
    if (effect.modifier.operation.type !== "addCost") continue;
    if (!cardMatchesModifierTarget(state, card, effect)) continue;

    costBonus += effect.modifier.operation.value;
  }

  return costBonus;
};

const hasRestriction = (
  state: GameState,
  card: CardInstance,
  restriction: "cannotAttack" | "cannotBlock",
): boolean => {
  const effects = allContinuousEffects(state);
  for (const effect of effects) {
    if (!durationIsActive(state, effect)) continue;
    if (effect.condition !== undefined) continue;
    if (effect.modifier.layer !== "restriction") continue;
    if (effect.modifier.operation.type !== "restriction") continue;
    if (effect.modifier.operation.restriction !== restriction) continue;
    if (!cardMatchesModifierTarget(state, card, effect)) continue;
    return true;
  }
  return false;
};

const continuousKeywordsForCard = (
  state: GameState,
  card: CardInstance,
): Keyword[] => {
  const keywords: Keyword[] = [];
  const effects = allContinuousEffects(state);
  for (const effect of effects) {
    if (!durationIsActive(state, effect)) continue;
    if (!isSupportedContinuousKeywordModifier(effect)) continue;
    if (!continuousEffectConditionPasses(state, effect)) continue;
    if (!cardMatchesModifierTarget(state, card, effect)) continue;
    const operation = effect.modifier.operation;
    if (operation.type !== "addKeyword") continue;
    const keyword = operation.keyword;
    if (!keywords.includes(keyword)) {
      keywords.push(keyword);
    }
  }
  return keywords;
};

const computedKeywordsForCard = (
  state: GameState,
  card: CardInstance,
  metadata: ResolvedCard,
): Keyword[] => {
  const keywords = [...metadata.printedKeywords] as Keyword[];
  for (const keyword of continuousKeywordsForCard(state, card)) {
    if (!keywords.includes(keyword)) {
      keywords.push(keyword);
    }
  }
  return keywords;
};

const resolveCombatMetadata = (
  state: GameState,
  card: CardInstance,
  options: ComputeViewOptions = {},
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
    options.supportStatusPolicy !== "ignore" &&
    resolved.support.status !== "vanilla-confirmed" &&
    resolved.support.status !== "implemented-dsl"
  ) {
    throw new TypeError(
      `Unsupported support status ${resolved.support.status} for ${String(card.cardId)}.`,
    );
  }
  for (const keyword of resolved.printedKeywords) {
    if (
      options.unsupportedCombatKeywordPolicy !== "ignore" &&
      unsupportedCombatKeywords.has(keyword)
    ) {
      throw new TypeError(
        `Unsupported combat keyword ${keyword} for ${String(card.cardId)}.`,
      );
    }
  }
  return resolved as ResolvedCard & { power: number };
};

const canAttackNow = (
  state: GameState,
  card: CardInstance,
  keywords: readonly Keyword[],
): boolean => {
  if (card.controller !== state.turn.turnPlayerId) return false;
  if (state.turn.phase !== "main") return false;
  if (state.battle !== undefined) return false;
  if (card.state !== "active") return false;
  if (!isLeaderOrCharacter(card)) return false;
  if (hasRestriction(state, card, "cannotAttack")) return false;

  const turnCount = state.turn.playerTurnCounts[card.controller];
  if (turnCount === 1) return false;

  if (
    card.zone.zone === "characterArea" &&
    card.turnPlayed === state.turn.globalTurn
  ) {
    const hasRush = keywords.includes("rush");
    const hasRushCharacter = keywords.includes("rushCharacter");
    if (!hasRush && !hasRushCharacter) return false;
  }
  return true;
};

const findLeaderOrCharacter = (
  state: GameState,
  ref: Pick<CardRef, "instanceId" | "cardId" | "playerId">,
): CardInstance | undefined => {
  const player = state.players[ref.playerId];
  if (player === undefined) return undefined;
  if (
    player.leader.instanceId === ref.instanceId &&
    player.leader.cardId === ref.cardId
  ) {
    return player.leader;
  }
  return player.characters.find(
    (character) =>
      character.instanceId === ref.instanceId &&
      character.cardId === ref.cardId,
  );
};

const legalTargetsForAttacker = (
  state: GameState,
  attacker: CardInstance,
  options: ComputeViewOptions = {},
): InstanceId[] => {
  const metadata = resolveCombatMetadata(state, attacker, options);
  const attackerKeywords = computedKeywordsForCard(state, attacker, metadata);
  if (!canAttackNow(state, attacker, attackerKeywords)) return [];
  const opponentId = (Object.keys(state.players) as PlayerId[]).find(
    (playerId) => playerId !== attacker.controller,
  );
  if (opponentId === undefined) return [];
  const opponent = state.players[opponentId];
  if (opponent === undefined) return [];

  const targets: InstanceId[] = [];
  const isPlayedThisTurnCharacter =
    attacker.zone.zone === "characterArea" &&
    attacker.turnPlayed === state.turn.globalTurn;
  const rushCharacterOnly =
    isPlayedThisTurnCharacter && attackerKeywords.includes("rushCharacter");

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

const canBlockNow = (
  state: GameState,
  card: CardInstance,
  keywords: readonly Keyword[],
): boolean => {
  if (card.zone.zone !== "characterArea") return false;
  if (card.state !== "active") return false;
  if (!keywords.includes("blocker")) return false;
  if (hasRestriction(state, card, "cannotBlock")) return false;
  const battle = state.battle;
  if (battle === undefined || battle.step !== "block") return false;
  if (!isCardRefLive(state, battle.attacker)) return false;
  if (!isCardRefLive(state, battle.currentTarget)) return false;
  const attacker = findLeaderOrCharacter(state, battle.attacker);
  if (attacker === undefined) return false;
  const attackerMetadata = resolveCombatMetadata(state, attacker);
  const attackerKeywords = computedKeywordsForCard(
    state,
    attacker,
    attackerMetadata,
  );
  if (attackerKeywords.includes("unblockable")) return false;
  const defenderId = battle.currentTarget.playerId;
  return card.controller === defenderId;
};

const computeCardView = (
  state: GameState,
  card: CardInstance,
  options: ComputeViewOptions = {},
): ComputedCardView => {
  const metadata = resolveCombatMetadata(state, card, options);
  const printedBasePower = metadata.power;
  const basePower = continuousBasePowerForCard(state, card) ?? printedBasePower;
  const baseCost = metadata.cost;
  const continuousCostBonus = continuousCostBonusForCard(state, card);
  const donBonus =
    card.controller === state.turn.turnPlayerId
      ? card.attachedDon.length * 1000
      : 0;
  const battle = state.battle as EngineInternalBattleState | undefined;
  const counterBonus =
    battle !== undefined &&
    battle.currentTarget.instanceId === card.instanceId &&
    battle.currentTarget.cardId === card.cardId
      ? (battle.counterPower ?? 0)
      : 0;
  const continuousPowerBonus = continuousPowerBonusForCard(state, card);
  const keywords = computedKeywordsForCard(state, card, metadata);
  const fieldRemovalProtections = fieldRemovalProtectionsForCard(state, card);
  if (!fieldRemovalProtections.ok) {
    throw new TypeError(
      `Unsupported continuous effect for ${String(
        card.instanceId,
      )}: ${fieldRemovalProtections.reason}.`,
    );
  }

  return {
    instanceId: card.instanceId,
    cardId: card.cardId,
    basePower,
    currentPower: basePower + donBonus + counterBonus + continuousPowerBonus,
    ...(baseCost === undefined
      ? {}
      : {
          baseCost,
          currentCost: Math.max(0, baseCost + continuousCostBonus),
        }),
    keywords,
    canAttack: canAttackNow(state, card, keywords),
    canBlock: canBlockNow(state, card, keywords),
    cannotBeAttacked: false,
    protectedFrom: fieldRemovalProtections.protections,
  };
};

export const computeView = (
  state: GameState,
  options: ComputeViewOptions = {},
): ComputedGameView => {
  assertSupportedContinuousEffects(state);

  const cards: ComputedGameView["cards"] = {};
  const legalAttackTargets: ComputedGameView["legalAttackTargets"] = {};
  const allCombatCards: CardInstance[] = [];

  for (const player of Object.values(state.players)) {
    allCombatCards.push(player.leader, ...player.characters);
  }

  for (const card of allCombatCards) {
    cards[card.instanceId] = computeCardView(state, card, options);
    legalAttackTargets[card.instanceId] = legalTargetsForAttacker(
      state,
      card,
      options,
    );
  }

  return {
    seq: state.seq,
    turnPlayerId: state.turn.turnPlayerId,
    cards,
    legalAttackTargets,
    restrictions: {},
  };
};
