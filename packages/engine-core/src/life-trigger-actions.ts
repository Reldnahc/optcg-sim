import type {
  CardInstance,
  ConfirmLifeTriggerDecision,
  EffectBlock,
  EffectDefinition,
  GameState,
  PlayerId,
} from "@optcg/types";

import { toDecisionId } from "./action-results.js";
import { toCardRef } from "./action-state.js";

export const hasLifeTriggerText = (triggerText: string | undefined): boolean =>
  triggerText !== undefined && triggerText.trim().length > 0;

const isSupportedTriggerEffect = (effect: EffectBlock): boolean => {
  if (effect.category !== "auto") return false;
  if (effect.trigger.type !== "trigger") return false;
  if (
    effect.sourcePresencePolicy !== "resolveFromLastKnownInformation" &&
    effect.sourcePresencePolicy !== "noSourceRequired"
  ) {
    return false;
  }
  if (effect.effect.type !== "draw") return false;
  if (effect.effect.count !== 1 || effect.effect.player !== "self") {
    return false;
  }
  if (effect.cost !== undefined) return false;
  if (effect.condition !== undefined) return false;
  if (effect.optional !== undefined && effect.optional) return false;
  if (effect.oncePerTurn !== undefined && effect.oncePerTurn) return false;
  return true;
};

const hasUnsupportedShape = (effect: EffectBlock): boolean =>
  effect.effect.type !== "draw" ||
  effect.cost !== undefined ||
  effect.condition !== undefined ||
  effect.conditionTiming !== undefined ||
  effect.failurePolicy !== undefined ||
  effect.optional !== undefined ||
  effect.oncePerTurn !== undefined;

const isExactSupportedTriggerDefinition = (
  definition: EffectDefinition | undefined,
): boolean => {
  if (definition === undefined || definition.effects.length !== 1) {
    return false;
  }
  const effect = definition.effects[0];
  if (effect === undefined) {
    return false;
  }
  if (hasUnsupportedShape(effect)) {
    return false;
  }
  return isSupportedTriggerEffect(effect);
};

export const getSupportedLifeTriggerDecision = (
  state: GameState,
  damagedPlayerId: PlayerId,
  card: CardInstance,
): ConfirmLifeTriggerDecision | undefined => {
  const resolved = state.cardManifest.cards[card.cardId];
  if (resolved === undefined || !hasLifeTriggerText(resolved.triggerText)) {
    return undefined;
  }
  const support = resolved.support;
  if (support.status !== "implemented-dsl") {
    return undefined;
  }
  const definitionId = support.effectDefinitionId;
  if (definitionId === undefined) {
    return undefined;
  }
  const definition = state.cardManifest.effectDefinitions?.[definitionId];
  if (!isExactSupportedTriggerDefinition(definition)) {
    return undefined;
  }
  return {
    id: toDecisionId(
      `decision:life-trigger:${String(card.instanceId)}:${String(state.seq + 1)}`,
    ),
    type: "confirmLifeTrigger",
    playerId: damagedPlayerId,
    prompt: "Activate life trigger?",
    causedBy: { type: "ruleProcess", name: "battle:lifeTriggerDecision" },
    visibility: { type: "public" },
    card: toCardRef(card, damagedPlayerId),
    options: ["activateTrigger", "addToHand"],
  };
};
