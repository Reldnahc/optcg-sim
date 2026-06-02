import type {
  CardId,
  CardInstance,
  CardRef,
  EffectDefinition,
  GameState,
  Keyword,
  MatchCardManifest,
  ResolvedCard,
} from "@optcg/types";

import { resolveImplementedDslEffectDefinition } from "../effect-runtime.js";
import { isSupportedAutoRuntimeEffectBlock } from "../effect-runtime-block-support.js";
import { isSupportedQueuedEffectConditionShape } from "../effect-runtime-conditions.js";
import { isSupportedPermanentContinuousEffectBlock } from "../runtime/continuous/continuous.js";
import {
  isSupportedOnOpponentAttackCompatibleQueuedEffect,
  isSupportedWhenAttackingCompatibleQueuedEffect,
} from "../runtime/trigger-queueing/attack.js";
import { isSupportedOnKOCompatibleQueuedEffect } from "../runtime/trigger-queueing/ko.js";
import { isSupportedReplacementEffectBlock } from "../effect-runtime-replacement-primitives.js";

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

const supportedExplanatoryNoteKeywordBodies = new Map<string, Keyword>([
  ["[Banish]", "banish"],
  ["[Blocker]", "blocker"],
  ["[Rush]", "rush"],
  ["[Rush: Character]", "rushCharacter"],
]);

const stripParentheticalExplanatoryNotes = (text: string): string | null => {
  let depth = 0;
  let stripped = "";

  for (const character of text) {
    if (character === "(") {
      depth += 1;
      if (depth > 1) {
        return null;
      }
      stripped += " ";
      continue;
    }
    if (character === ")") {
      if (depth === 0) {
        return null;
      }
      depth -= 1;
      stripped += " ";
      continue;
    }
    if (depth === 0) {
      stripped += character;
    }
  }

  if (depth !== 0) {
    return null;
  }
  return stripped;
};

const normalizeSupportGateText = (text: string): string =>
  text.replace(/\s+/gu, " ").trim();

export const hasUnsupportedSupportGateText = (
  text: string | undefined,
  card: ResolvedCard,
): boolean => {
  if (text === undefined || text.trim().length === 0) {
    return false;
  }

  const stripped = stripParentheticalExplanatoryNotes(text);
  if (stripped === null) {
    return true;
  }

  const normalized = normalizeSupportGateText(stripped);
  if (normalized.length === 0) {
    return false;
  }

  const keyword = supportedExplanatoryNoteKeywordBodies.get(normalized);
  return keyword === undefined || !card.printedKeywords.includes(keyword);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isBattleNeutralFieldRemovalProtection = (value: unknown): boolean => {
  if (!isRecord(value) || value["process"] !== "fieldRemoval") {
    return false;
  }
  const fieldRemoval = value["fieldRemoval"];
  if (!isRecord(fieldRemoval)) {
    return false;
  }
  const exclusions = fieldRemoval["exclusions"];
  if (!isRecord(exclusions)) {
    return false;
  }
  return (
    fieldRemoval["processFamily"] === "fieldRemoval" &&
    fieldRemoval["sourceKind"] === "cardEffect" &&
    fieldRemoval["sourceControllerRelation"] === "opponentControlled" &&
    fieldRemoval["targetScope"] === "thisCard" &&
    exclusions["battleKO"] === "excluded" &&
    exclusions["ruleProcessTrash"] === "excluded" &&
    exclusions["controllerCost"] === "excluded" &&
    exclusions["controllerOwnedEffect"] === "excluded" &&
    exclusions["ambiguousCustomRemoval"] === "failClosed"
  );
};

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

const battleEffectBodyIssue = (value: unknown): string | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const type = value["type"];
  if (type === "protectFromKO" && value["sourceKind"] !== "cardEffect") {
    return "unsupported protectFromKO sourceKind";
  }
  if (
    type === "cannotBeBlockedBy" ||
    type === "cannotBeAttacked" ||
    type === "cannotBlock"
  ) {
    return `unsupported restriction body ${type}`;
  }
  if (type === "giveKeyword" && value["keyword"] === "unblockable") {
    return "unsupported keyword body giveKeyword:unblockable";
  }

  const operation = value["operation"];
  if (isRecord(operation)) {
    if (operation["type"] === "restriction") {
      return "unsupported continuous restriction operation";
    }
    if (operation["type"] === "protection") {
      return isBattleNeutralFieldRemovalProtection(operation["protection"])
        ? undefined
        : "unsupported continuous protection operation";
    }
    if (
      isRecord(operation["protection"]) &&
      !isBattleNeutralFieldRemovalProtection(operation["protection"])
    ) {
      return "unsupported continuous protection operation";
    }
  }
  if (
    isRecord(value["protection"]) &&
    !isBattleNeutralFieldRemovalProtection(value["protection"])
  ) {
    return "unsupported protection body";
  }

  for (const entry of Object.values(value)) {
    const nested = battleEffectBodyIssue(entry);
    if (nested !== undefined) {
      return nested;
    }
  }
  return undefined;
};

const isSupportedBattleRuntimeEffect = (
  effect: EffectDefinition["effects"][number],
): boolean =>
  isSupportedQueuedEffectConditionShape(effect.condition) &&
  (isSupportedWhenAttackingCompatibleQueuedEffect(effect) ||
    isSupportedOnOpponentAttackCompatibleQueuedEffect(effect) ||
    isSupportedAutoRuntimeEffectBlock(effect, {
      category: "auto",
      sourcePresencePolicies: ["mustRemainInSameZone"],
      triggerType: "opponentActivated",
    }) ||
    isSupportedAutoRuntimeEffectBlock(effect, {
      category: "auto",
      sourcePresencePolicies: ["mustRemainInSameZone"],
      triggerType: "lifeRemoved",
    }) ||
    isSupportedOnKOCompatibleQueuedEffect(effect));

const isBattleNeutralTrigger = (
  trigger: EffectDefinition["effects"][number]["trigger"],
): boolean =>
  trigger.type === "onPlay" ||
  trigger.type === "main" ||
  trigger.type === "trigger" ||
  trigger.type === "activateMain" ||
  trigger.type === "startOfGame";

const supportsBattleRuntimeMetadataSanitization = (
  definition: EffectDefinition | undefined,
): definition is EffectDefinition =>
  definition !== undefined &&
  definition.effects.length > 0 &&
  definition.effects.every(
    (effect) =>
      isSupportedBattleRuntimeEffect(effect) ||
      isSupportedReplacementEffectBlock(effect) ||
      isBattleNeutralTrigger(effect.trigger),
  );

const hasSupportedBattleRuntimeDefinition = (
  manifest: MatchCardManifest,
  card: ResolvedCard | undefined,
): card is ResolvedCard => {
  if (card === undefined || !Object.hasOwn(card, "support")) {
    return false;
  }
  const lookup = resolveImplementedDslEffectDefinition(card, manifest);
  return (
    lookup.ok && supportsBattleRuntimeMetadataSanitization(lookup.definition)
  );
};

const hasBattleSafeImplementedDslDefinitionForText = (
  state: GameState,
  cardId: CardInstance["cardId"],
): boolean => {
  const card = state.cardManifest.cards[cardId];
  if (card === undefined) {
    return false;
  }
  if (hasSupportedBattleRuntimeDefinition(state.cardManifest, card)) {
    return true;
  }
  const lookup = resolveImplementedDslEffectDefinition(
    card,
    state.cardManifest,
  );
  if (!lookup.ok) {
    return false;
  }
  return (
    lookup.definition.effects.length > 0 &&
    lookup.definition.effects.every(
      (effect) =>
        isSupportedBattleRuntimeEffect(effect) ||
        isSupportedReplacementEffectBlock(effect) ||
        isBattleNeutralTrigger(effect.trigger) ||
        isSupportedPermanentContinuousEffectBlock(effect),
    )
  );
};

const supportsBattleRuntimeSanitization = (
  manifest: MatchCardManifest,
  card: ResolvedCard | undefined,
): card is ResolvedCard => hasSupportedBattleRuntimeDefinition(manifest, card);

const battleRelevantMetadataTrigger = (
  effect: EffectDefinition["effects"][number],
): boolean =>
  effect.trigger.type === "counter" ||
  effect.trigger.type === "onBlock" ||
  effect.trigger.type === "onKO" ||
  effect.trigger.type === "endOfBattle" ||
  effect.trigger.type === "whenAttacking" ||
  effect.trigger.type === "onOpponentAttack" ||
  effect.category === "replacement";

const battleMetadataIssueForEffect = (
  effect: EffectDefinition["effects"][number],
): string | undefined => {
  if (
    isSupportedBattleRuntimeEffect(effect) ||
    isSupportedReplacementEffectBlock(effect) ||
    isSupportedPermanentContinuousEffectBlock(effect)
  ) {
    return undefined;
  }

  if (battleRelevantMetadataTrigger(effect)) {
    return "unsupported battle timing effect";
  }

  const bodyIssue = hasThisBattleDuration(effect.effect)
    ? "unsupported thisBattle duration"
    : battleEffectBodyIssue(effect.effect);
  if (bodyIssue === undefined) {
    return undefined;
  }

  if (effect.trigger.type === "permanent") {
    return bodyIssue;
  }
  if (effect.trigger.type === "onPlay") {
    return bodyIssue;
  }
  return undefined;
};

const battleMetadataIssueMessage = (
  cardId: CardInstance["cardId"],
  effect: EffectDefinition["effects"][number],
  issue: string,
): string =>
  [
    "Battle requires unsupported effect metadata",
    `card=${String(cardId)}`,
    `effect=${String(effect.id)}`,
    `trigger=${effect.trigger.type}`,
    `category=${effect.category}`,
    `reason=${issue}`,
  ].join("; ");

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
        !supportsBattleRuntimeMetadataSanitization(definition),
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

export const hasUnsupportedBattleEffectMetadata = (state: GameState): boolean =>
  getUnsupportedBattleEffectMetadataReason(state) !== undefined;

export const getUnsupportedBattleEffectMetadataReason = (
  state: GameState,
): string | undefined => {
  const combatCardIds = new Set<CardInstance["cardId"]>();
  for (const player of Object.values(state.players)) {
    combatCardIds.add(player.leader.cardId);
    for (const character of player.characters) {
      combatCardIds.add(character.cardId);
    }
  }

  for (const cardId of combatCardIds) {
    const card = state.cardManifest.cards[cardId];
    if (
      card !== undefined &&
      hasUnsupportedSupportGateText(card.effectText, card) &&
      !hasBattleSafeImplementedDslDefinitionForText(state, cardId)
    ) {
      return [
        "Battle requires unsupported effect metadata",
        `card=${String(cardId)}`,
        "reason=unsupported support-gate text",
      ].join("; ");
    }
  }

  for (const definition of Object.values(
    state.cardManifest.effectDefinitions ?? {},
  )) {
    if (!combatCardIds.has(definition.cardId)) {
      continue;
    }
    for (const effect of definition.effects) {
      const issue = battleMetadataIssueForEffect(effect);
      if (issue !== undefined) {
        return battleMetadataIssueMessage(definition.cardId, effect, issue);
      }
    }
  }

  return undefined;
};

export const isSupportedBattleResolutionEnvelope = (
  battle: NonNullable<GameState["battle"]>,
): boolean => {
  if (battle.damageCount !== 1 && battle.damageCount !== 2) {
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
