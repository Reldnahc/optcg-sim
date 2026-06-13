import type {
  CardInstance,
  CardFilter,
  CardRef,
  ComputedCardView,
  ComputedGameView,
  GameState,
  InstanceId,
  Keyword,
  PlayerId,
  PlayerRef,
  ResolvedCard,
} from "@optcg/types";

import {
  allContinuousEffects,
  continuousEffectConditionPasses,
  durationIsActive,
  isCardRefLive,
  isSupportedContinuousKeywordModifier,
  recordConditionPasses,
} from "./compute-view-continuous.js";
import { fieldRemovalProtectionsForCard } from "../replacement/field-removal-protection.js";
import { cardMatchesContinuousModifierTarget } from "../runtime/continuous/target-matching.js";
import { cardMatchesSearchFilter, getOpponentId } from "../actions/state.js";

type EngineInternalBattleState = NonNullable<GameState["battle"]> & {
  counterPower?: number;
};

interface ComputeViewOptions {
  ignoreAttackCosts?: boolean;
  supportStatusPolicy?: "throw" | "ignore";
  unsupportedCombatKeywordPolicy?: "throw" | "ignore";
}

const isLeaderOrCharacter = (
  card: CardInstance,
): card is CardInstance & { zone: { zone: "leaderArea" | "characterArea" } } =>
  card.zone.zone === "leaderArea" || card.zone.zone === "characterArea";

const continuousPowerBonusForCard = (
  state: GameState,
  card: CardInstance,
): number => {
  let powerBonus = 0;
  const effects = allContinuousEffects(state);

  for (const effect of effects) {
    if (effect.modifier.layer !== "powerAdd") continue;
    if (effect.modifier.operation.type !== "addPower") continue;
    if (!durationIsActive(state, effect)) continue;
    if (!recordConditionPasses(state, effect)) continue;
    if (!cardMatchesContinuousModifierTarget(state, card, effect)) continue;

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
    if (effect.modifier.layer !== "basePowerSet") continue;
    if (effect.modifier.operation.type !== "setBasePower") continue;
    if (!durationIsActive(state, effect)) continue;
    if (!continuousEffectConditionPasses(state, effect)) continue;
    if (!cardMatchesContinuousModifierTarget(state, card, effect)) continue;

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
    if (effect.modifier.layer !== "costAdd") continue;
    if (effect.modifier.operation.type !== "addCost") continue;
    if (!durationIsActive(state, effect)) continue;
    if (!recordConditionPasses(state, effect)) continue;
    if (!cardMatchesContinuousModifierTarget(state, card, effect)) continue;

    costBonus += effect.modifier.operation.value;
  }

  return costBonus;
};

const hasRestriction = (
  state: GameState,
  card: CardInstance,
  restriction: "cannotAttack" | "cannotBlock" | "preventBlockerActivation",
): boolean => {
  const effects = allContinuousEffects(state);
  for (const effect of effects) {
    if (effect.modifier.layer !== "restriction") continue;
    if (effect.modifier.operation.type !== "restriction") continue;
    if (effect.modifier.operation.restriction !== restriction) continue;
    if (!durationIsActive(state, effect)) continue;
    if (!continuousEffectConditionPasses(state, effect)) continue;
    if (!cardMatchesContinuousModifierTarget(state, card, effect)) continue;
    return true;
  }
  return false;
};

const hasAttackPermission = (state: GameState, card: CardInstance): boolean => {
  const effects = allContinuousEffects(state);
  for (const effect of effects) {
    if (effect.modifier.layer !== "attackPermission") continue;
    if (effect.modifier.operation.type !== "attackPermission") continue;
    if (!durationIsActive(state, effect)) continue;
    if (!continuousEffectConditionPasses(state, effect)) continue;
    if (!cardMatchesContinuousModifierTarget(state, card, effect)) continue;
    return true;
  }
  return false;
};

const playerRefMatchesCard = (
  state: GameState,
  source: CardInstance,
  ref: PlayerRef,
  playerId: PlayerId,
): boolean => {
  switch (ref) {
    case "self":
    case "controller":
      return playerId === source.controller;
    case "owner":
      return playerId === source.owner;
    case "opponent":
      return playerId === getOpponentId(state, source.controller);
    case "turnPlayer":
      return playerId === state.turn.turnPlayerId;
    case "nonTurnPlayer":
      return playerId === getOpponentId(state, state.turn.turnPlayerId);
  }
};

const cardMatchesAttackTargetFilter = (
  resolved: ResolvedCard,
  filter: CardFilter | undefined,
): boolean => filter === undefined || cardMatchesSearchFilter(resolved, filter);

const attackTargetRestricted = (
  state: GameState,
  attacker: CardInstance,
  target: CardInstance,
  targetPlayerId: PlayerId,
  targetResolved: ResolvedCard,
): boolean => {
  const effects = allContinuousEffects(state);
  for (const effect of effects) {
    if (effect.modifier.layer !== "restriction") continue;
    if (effect.modifier.operation.type !== "targetRestriction") continue;
    if (effect.modifier.operation.restriction !== "cannotAttack") continue;
    if (!durationIsActive(state, effect)) continue;
    if (!continuousEffectConditionPasses(state, effect)) continue;
    if (!cardMatchesContinuousModifierTarget(state, attacker, effect)) continue;
    const attackTarget = effect.modifier.operation.attackTarget;
    if (target.zone.zone !== attackTarget.zone) continue;
    if (
      !playerRefMatchesCard(
        state,
        attacker,
        attackTarget.player,
        targetPlayerId,
      )
    ) {
      continue;
    }
    if (cardMatchesAttackTargetFilter(targetResolved, attackTarget.filter)) {
      return true;
    }
  }
  return false;
};

export const attackTrashCostCountForCard = (
  state: GameState,
  card: CardInstance,
): number => {
  let count = 0;
  const effects = allContinuousEffects(state);
  for (const effect of effects) {
    if (effect.modifier.layer !== "restriction") continue;
    if (effect.modifier.operation.type !== "attackCost") continue;
    if (!durationIsActive(state, effect)) continue;
    if (!continuousEffectConditionPasses(state, effect)) continue;
    if (!cardMatchesContinuousModifierTarget(state, card, effect)) continue;
    count += effect.modifier.operation.cost.count;
  }
  return count;
};

const restrictionLabel = (restriction: string): string | undefined => {
  switch (restriction) {
    case "cannotAttack":
      return "cannot-attack";
    case "cannotBlock":
      return "cannot-block";
    case "cannotBecomeActive":
      return "cannot-become-active";
    case "preventBlockerActivation":
      return "no-blocker";
    default:
      return undefined;
  }
};

const continuousRestrictionLabelsForCard = (
  state: GameState,
  card: CardInstance,
): string[] => {
  const restrictions: string[] = [];
  const effects = allContinuousEffects(state);
  for (const effect of effects) {
    if (effect.modifier.layer !== "restriction") continue;
    if (!durationIsActive(state, effect)) continue;
    if (!continuousEffectConditionPasses(state, effect)) continue;
    if (!cardMatchesContinuousModifierTarget(state, card, effect)) continue;
    const label =
      effect.modifier.operation.type === "attackCost"
        ? `attack-cost-trash-${String(effect.modifier.operation.cost.count)}`
        : effect.modifier.operation.type === "restriction"
          ? restrictionLabel(effect.modifier.operation.restriction)
          : undefined;
    if (label !== undefined && !restrictions.includes(label)) {
      restrictions.push(label);
    }
  }
  return restrictions;
};

const continuousKeywordsForCard = (
  state: GameState,
  card: CardInstance,
): Keyword[] => {
  const keywords: Keyword[] = [];
  const effects = allContinuousEffects(state);
  for (const effect of effects) {
    if (!isSupportedContinuousKeywordModifier(effect)) continue;
    if (!durationIsActive(state, effect)) continue;
    if (!continuousEffectConditionPasses(state, effect)) continue;
    if (!cardMatchesContinuousModifierTarget(state, card, effect)) continue;
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
  return resolved as ResolvedCard & { power: number };
};

const canAttackNow = (
  state: GameState,
  card: CardInstance,
  keywords: readonly Keyword[],
  options: ComputeViewOptions = {},
): boolean => {
  if (card.controller !== state.turn.turnPlayerId) return false;
  if (state.turn.phase !== "main") return false;
  if (state.battle !== undefined) return false;
  if (card.state !== "active") return false;
  if (!isLeaderOrCharacter(card)) return false;
  if (hasRestriction(state, card, "cannotAttack")) return false;
  const attackTrashCost = options.ignoreAttackCosts
    ? 0
    : attackTrashCostCountForCard(state, card);
  if (attackTrashCost > 0) {
    const player = state.players[card.controller];
    if (player === undefined || player.hand.length < attackTrashCost) {
      return false;
    }
  }

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
  if (!canAttackNow(state, attacker, attackerKeywords, options)) return [];
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
  const canAttackActiveCharacters = hasAttackPermission(state, attacker);

  if (!rushCharacterOnly) {
    const targetMetadata = resolveCombatMetadata(state, opponent.leader);
    if (
      !attackTargetRestricted(
        state,
        attacker,
        opponent.leader,
        opponentId,
        targetMetadata,
      )
    ) {
      targets.push(opponent.leader.instanceId);
    }
  }

  for (const character of opponent.characters) {
    const targetMetadata = resolveCombatMetadata(state, character);
    if (
      (character.state === "rested" || canAttackActiveCharacters) &&
      !attackTargetRestricted(
        state,
        attacker,
        character,
        opponentId,
        targetMetadata,
      )
    ) {
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
  if (hasRestriction(state, attacker, "preventBlockerActivation")) {
    return false;
  }
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
  const restrictions = continuousRestrictionLabelsForCard(state, card);
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
    restrictions,
    canAttack: canAttackNow(state, card, keywords, options),
    canBlock: canBlockNow(state, card, keywords),
    cannotBeAttacked: false,
    protectedFrom: fieldRemovalProtections.protections,
  };
};

export const computeView = (
  state: GameState,
  options: ComputeViewOptions = {},
): ComputedGameView => {
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
