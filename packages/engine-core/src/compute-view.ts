import type {
  CardFilter,
  CardRef,
  CardInstance,
  ComputedCardView,
  ComputedGameView,
  ContinuousEffectRecord,
  EffectQueueEntry,
  GameState,
  InstanceId,
  Keyword,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import { evaluateQueuedEffectCondition } from "./effect-runtime-conditions.js";
import {
  deriveImplementedDslPermanentContinuousEffects,
  hasCombatSafeImplementedDslDefinition,
} from "./effect-runtime-continuous.js";
import {
  fieldRemovalProtectionsForCard,
  isFieldRemovalProtectionModifier,
  isSupportedFieldRemovalProtectionModifier,
  malformedFieldRemovalProtectionMessage,
} from "./field-removal-protection.js";

type EngineInternalBattleState = NonNullable<GameState["battle"]> & {
  counterPower?: number;
};

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
const supportedContinuousKeywordGrants = new Set<Keyword>([
  "blocker",
  "banish",
  "rush",
  "rushCharacter",
  "doubleAttack",
]);

const isLeaderOrCharacter = (
  card: CardInstance,
): card is CardInstance & { zone: { zone: "leaderArea" | "characterArea" } } =>
  card.zone.zone === "leaderArea" || card.zone.zone === "characterArea";

const isSupportedContinuousPowerModifier = (
  effect: ContinuousEffectRecord,
): boolean =>
  effect.condition === undefined &&
  isSupportedDuration(effect.duration) &&
  ((effect.modifier.layer === "powerAdd" &&
    (effect.modifier.target.type === "self" ||
      effect.modifier.target.type === "all" ||
      effect.modifier.target.type === "exactCard") &&
    effect.modifier.operation.type === "addPower" &&
    (effect.duration.type !== "permanent" ||
      effect.modifier.operation.value === 1000)) ||
    (effect.modifier.layer === "restriction" &&
      (effect.modifier.target.type === "self" ||
        effect.modifier.target.type === "all" ||
        effect.modifier.target.type === "exactCard") &&
      effect.modifier.operation.type === "restriction" &&
      (effect.modifier.operation.restriction === "cannotAttack" ||
        effect.modifier.operation.restriction === "cannotBlock")));

const isSupportedContinuousKeywordModifier = (
  effect: ContinuousEffectRecord,
): boolean =>
  isSupportedDuration(effect.duration) &&
  effect.modifier.layer === "keywordAdd" &&
  (effect.modifier.target.type === "self" ||
    effect.modifier.target.type === "all" ||
    effect.modifier.target.type === "exactCard") &&
  effect.modifier.operation.type === "addKeyword" &&
  supportedContinuousKeywordGrants.has(effect.modifier.operation.keyword);

const isSupportedDuration = (
  duration: ContinuousEffectRecord["duration"],
): boolean =>
  duration.type === "thisBattle" ||
  duration.type === "thisTurn" ||
  duration.type === "untilEndOfTurn" ||
  duration.type === "untilStartOfNextTurn" ||
  duration.type === "whileSourceOnField" ||
  duration.type === "permanent";

const unsupportedContinuousEffectMessage = (
  effect: ContinuousEffectRecord,
): string =>
  `Unsupported continuous effect ${effect.id}: only unconditional self +1000 powerAdd modifiers with permanent or whileSourceOnField duration are supported by computeView.`;

const toConditionQueueEntry = (
  effect: ContinuousEffectRecord,
): EffectQueueEntry => ({
  id: `continuous-condition:${effect.id}` as EffectQueueEntry["id"],
  state: "resolving",
  timingWindowId:
    `continuous-condition:${effect.id}` as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: effect.controller,
  source: effect.source,
  sourceSnapshot: effect.sourceSnapshot,
  effectBlockId:
    `continuous-condition:${effect.id}` as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: effect.createdAtStateSeq,
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: effect.createdBy,
});

const continuousEffectConditionPasses = (
  state: GameState,
  effect: ContinuousEffectRecord,
): boolean => {
  const condition = evaluateQueuedEffectCondition(
    state,
    toConditionQueueEntry(effect),
    effect.condition,
  );
  if (!condition.supported) {
    throw new TypeError(unsupportedContinuousEffectMessage(effect));
  }
  return condition.passed;
};

const assertSupportedContinuousEffects = (state: GameState): void => {
  const effects = allContinuousEffects(state);
  for (const effect of effects) {
    if (isSupportedContinuousPowerModifier(effect)) continue;
    if (isSupportedFieldRemovalProtectionModifier(effect)) continue;
    if (isFieldRemovalProtectionModifier(effect)) {
      throw new TypeError(malformedFieldRemovalProtectionMessage(effect));
    }
    if (!isSupportedContinuousKeywordModifier(effect)) {
      throw new TypeError(unsupportedContinuousEffectMessage(effect));
    }
    if (!durationIsActive(state, effect)) continue;
    continuousEffectConditionPasses(state, effect);
  }
};

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

const durationIsActive = (
  state: GameState,
  effect: ContinuousEffectRecord,
): boolean => {
  if (effect.duration.type === "whileSourceOnField") {
    return isCardRefLive(state, effect.source);
  }
  return true;
};

const continuousPowerBonusForCard = (
  state: GameState,
  card: CardInstance,
): number => {
  let powerBonus = 0;
  const effects = allContinuousEffects(state);

  for (const effect of effects) {
    if (!durationIsActive(state, effect)) continue;
    if (effect.condition !== undefined) continue;
    if (effect.modifier.layer !== "powerAdd") continue;
    if (effect.modifier.operation.type !== "addPower") continue;
    if (!cardMatchesModifierTarget(state, card, effect)) continue;

    powerBonus += effect.modifier.operation.value;
  }

  return powerBonus;
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
  if (resolved.support.effectDefinitionId !== undefined) {
    if (
      !hasCombatSafeImplementedDslDefinition(
        state,
        resolved.support.effectDefinitionId,
      )
    ) {
      throw new TypeError(
        `Unsupported combat effect definition for ${String(card.cardId)}.`,
      );
    }
  } else if (
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

const legalTargetsForAttacker = (
  state: GameState,
  attacker: CardInstance,
): InstanceId[] => {
  const metadata = resolveCombatMetadata(state, attacker);
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
    keywords,
    canAttack: canAttackNow(state, card, keywords),
    canBlock: canBlockNow(state, card, keywords),
    cannotBeAttacked: false,
    protectedFrom: fieldRemovalProtections.protections,
  };
};

export const computeView = (state: GameState): ComputedGameView => {
  assertSupportedContinuousEffects(state);

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
const allContinuousEffects = (
  state: GameState,
): readonly ContinuousEffectRecord[] => [
  ...state.continuousEffects,
  ...deriveImplementedDslPermanentContinuousEffects(state),
];
