import type {
  Effect,
  EffectDefinition,
  SourcePresencePolicy,
  Trigger,
} from "@optcg/types";

import { isSupportedQueuedEffectConditionShape } from "./effect-runtime-conditions.js";
import { isSupportedContinuousQueueEffect } from "./runtime/continuous/continuous.js";
import {
  isSupportedMainEventTargetKoEffectAllowingOncePerTurn,
  isSupportedDrawBody,
  isSupportedWinGameBody,
} from "./runtime/primitives/execute.js";
import { isSupportedMoveCardsEffect } from "./effect-runtime-move-cards.js";
import { isSupportedPlaceTopDeckCardsEffect } from "./effect-runtime-top-deck-placement.js";
import { isSupportedQueuedAutoSequenceForEntryPoint } from "./effect-runtime-sequence/support.js";
import { isSupportedTrashFromHandUntilCountBody } from "./runtime/primitives/trash-from-hand-until.js";

type EffectBlock = EffectDefinition["effects"][number];
type AutoRuntimeTriggerType = Exclude<Trigger["type"], "anyOf">;

export interface AutoRuntimeEntryAdapter {
  readonly category: "auto";
  readonly sourcePresencePolicies: readonly SourcePresencePolicy[];
  readonly triggerType: AutoRuntimeTriggerType;
}

const autoAdapter = (
  triggerType: AutoRuntimeEntryAdapter["triggerType"],
  sourcePresencePolicies: readonly SourcePresencePolicy[],
): AutoRuntimeEntryAdapter => ({
  category: "auto",
  sourcePresencePolicies,
  triggerType,
});

export const autoRuntimeEntryAdapterForTriggerType = (
  triggerType: AutoRuntimeTriggerType,
): AutoRuntimeEntryAdapter | undefined => {
  if (triggerType === "onPlay") {
    return autoAdapter("onPlay", ["mustRemainInSameZone"]);
  }
  if (triggerType === "whenAttacking") {
    return autoAdapter("whenAttacking", ["mustRemainInSameZone"]);
  }
  if (triggerType === "onOpponentAttack") {
    return autoAdapter("onOpponentAttack", ["mustRemainInSameZone"]);
  }
  if (triggerType === "onKO") {
    return autoAdapter("onKO", [
      "resolveFromDestinationZone",
      "resolveFromLastKnownInformation",
    ]);
  }
  if (triggerType === "endOfYourTurn") {
    return autoAdapter("endOfYourTurn", ["mustRemainInSameZone"]);
  }
  if (triggerType === "main") {
    return autoAdapter("main", [
      "noSourceRequired",
      "resolveFromDestinationZone",
    ]);
  }
  if (triggerType === "trigger") {
    return autoAdapter("trigger", ["noSourceRequired"]);
  }
  if (triggerType === "counter") {
    return autoAdapter("counter", ["resolveFromDestinationZone"]);
  }
  if (triggerType === "lifeRemoved") {
    return autoAdapter("lifeRemoved", ["mustRemainInSameZone"]);
  }
  if (triggerType === "damageDealt") {
    return autoAdapter("damageDealt", ["mustRemainInSameZone"]);
  }
  if (triggerType === "fieldRemoved") {
    return autoAdapter("fieldRemoved", ["mustRemainInSameZone"]);
  }
  if (triggerType === "cardPlayed") {
    return autoAdapter("cardPlayed", ["mustRemainInSameZone"]);
  }
  if (triggerType === "handTrashedByEffect") {
    return autoAdapter("handTrashedByEffect", ["mustRemainInSameZone"]);
  }
  if (triggerType === "opponentActivated") {
    return autoAdapter("opponentActivated", ["mustRemainInSameZone"]);
  }
  return undefined;
};

const triggerTypes = (trigger: Trigger): readonly AutoRuntimeTriggerType[] =>
  trigger.type === "anyOf"
    ? trigger.triggers.flatMap(triggerTypes)
    : [trigger.type];

export const triggerContainsType = (
  trigger: Trigger,
  triggerType: AutoRuntimeTriggerType,
): boolean => triggerTypes(trigger).includes(triggerType);

export const autoRuntimeEntryAdaptersForBlock = (
  block: EffectBlock,
): readonly AutoRuntimeEntryAdapter[] => {
  if (block.sourcePresencePolicy === undefined) {
    return [];
  }
  const adapters = triggerTypes(block.trigger).map((triggerType) =>
    autoRuntimeEntryAdapterForTriggerType(triggerType),
  );
  return adapters.every(
    (adapter): adapter is AutoRuntimeEntryAdapter => adapter !== undefined,
  )
    ? adapters
    : [];
};

export const autoRuntimeEntryAdapterForBlock = (
  block: EffectBlock,
): AutoRuntimeEntryAdapter | undefined =>
  autoRuntimeEntryAdaptersForBlock(block)[0];

const isSupportedDrawUpToBody = (
  effect: Effect,
): effect is Extract<Effect, { type: "drawUpTo" }> =>
  effect.type === "drawUpTo" &&
  effect.player === "self" &&
  Number.isInteger(effect.count) &&
  effect.count >= 0;

const isSupportedActivateReferencedEffectBody = (
  effect: Effect,
): effect is Extract<Effect, { type: "activateReferencedEffect" }> =>
  effect.type === "activateReferencedEffect" &&
  effect.source.type === "triggerCard" &&
  effect.trigger.type !== "anyOf" &&
  autoRuntimeEntryAdapterForTriggerType(effect.trigger.type) !== undefined;

const isSupportedPlaySourceBody = (
  effect: Effect,
): effect is Extract<Effect, { type: "playSource" }> =>
  effect.type === "playSource" &&
  effect.source.type === "triggerCard" &&
  effect.ignoreCost === true;

const isSupportedTrashFromHandBody = (
  effect: Effect,
): effect is Extract<Effect, { type: "trashFromHand" }> =>
  effect.type === "trashFromHand" &&
  (effect.player === "self" || effect.player === "opponent") &&
  effect.chooser === effect.player &&
  effect.filter === undefined &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

const isSupportedMoveCardsBody = (
  effect: Effect,
): effect is Extract<Effect, { type: "moveCards" }> =>
  isSupportedMoveCardsEffect(effect);

const isSupportedDamageBody = (
  effect: Effect,
): effect is Extract<Effect, { type: "damage" }> =>
  effect.type === "damage" &&
  effect.player === "opponent" &&
  effect.count === 1;

const isSupportedPlaceTopDeckCardsBody = (
  effect: Effect,
): effect is Extract<Effect, { type: "placeTopDeckCards" }> =>
  isSupportedPlaceTopDeckCardsEffect(effect);

const isQueuedAutoSequenceTriggerType = (
  triggerType: Trigger["type"],
): triggerType is
  | "onPlay"
  | "whenAttacking"
  | "onKO"
  | "onOpponentAttack"
  | "endOfYourTurn"
  | "main"
  | "trigger"
  | "counter"
  | "lifeRemoved"
  | "damageDealt"
  | "fieldRemoved"
  | "cardPlayed"
  | "handTrashedByEffect"
  | "opponentActivated" =>
  triggerType === "onPlay" ||
  triggerType === "whenAttacking" ||
  triggerType === "onKO" ||
  triggerType === "onOpponentAttack" ||
  triggerType === "endOfYourTurn" ||
  triggerType === "main" ||
  triggerType === "trigger" ||
  triggerType === "counter" ||
  triggerType === "lifeRemoved" ||
  triggerType === "damageDealt" ||
  triggerType === "fieldRemoved" ||
  triggerType === "cardPlayed" ||
  triggerType === "handTrashedByEffect" ||
  triggerType === "opponentActivated";

const isSupportedSequenceBody = (
  block: EffectBlock,
  adapter: AutoRuntimeEntryAdapter,
): boolean =>
  isQueuedAutoSequenceTriggerType(adapter.triggerType) &&
  block.sourcePresencePolicy !== undefined &&
  isSupportedQueuedAutoSequenceForEntryPoint(
    block,
    adapter.triggerType,
    block.sourcePresencePolicy,
  );

const isSourceDependentContinuousEffect = (effect: Effect): boolean => {
  if (
    effect.type !== "modifyPower" &&
    effect.type !== "cannotAttack" &&
    effect.type !== "cannotBlock" &&
    effect.type !== "preventBlockerActivation"
  ) {
    return false;
  }
  return (
    effect.target.type === "self" ||
    effect.duration.type === "whileSourceOnField"
  );
};

const isSupportedContinuousBody = (
  block: EffectBlock & { sourcePresencePolicy: SourcePresencePolicy },
): boolean =>
  isSupportedContinuousQueueEffect(block.effect) &&
  (block.sourcePresencePolicy === "mustRemainInSameZone" ||
    !isSourceDependentContinuousEffect(block.effect));

const isSupportedTargetChoiceBody = (
  block: EffectBlock & { sourcePresencePolicy: SourcePresencePolicy },
): boolean => isSupportedMainEventTargetKoEffectAllowingOncePerTurn(block);

const hasSupportedBlockEnvelope = (
  block: EffectBlock,
  adapter: AutoRuntimeEntryAdapter,
): block is EffectBlock & { sourcePresencePolicy: SourcePresencePolicy } =>
  block.category === adapter.category &&
  triggerContainsType(block.trigger, adapter.triggerType) &&
  block.sourcePresencePolicy !== undefined &&
  adapter.sourcePresencePolicies.includes(block.sourcePresencePolicy) &&
  block.cost === undefined &&
  block.conditionTiming === undefined &&
  block.failurePolicy === undefined &&
  isSupportedQueuedEffectConditionShape(block.condition);

const isSupportedNonOptionalBody = (
  block: EffectBlock & { sourcePresencePolicy: SourcePresencePolicy },
  adapter: AutoRuntimeEntryAdapter,
): boolean =>
  isSupportedDrawBody(block.effect) ||
  isSupportedDrawUpToBody(block.effect) ||
  isSupportedTrashFromHandBody(block.effect) ||
  isSupportedTrashFromHandUntilCountBody(block.effect) ||
  isSupportedMoveCardsBody(block.effect) ||
  isSupportedDamageBody(block.effect) ||
  isSupportedPlaceTopDeckCardsBody(block.effect) ||
  isSupportedWinGameBody(block.effect) ||
  isSupportedContinuousBody(block) ||
  isSupportedActivateReferencedEffectBody(block.effect) ||
  isSupportedPlaySourceBody(block.effect) ||
  isSupportedTargetChoiceBody(block) ||
  isSupportedSequenceBody(block, adapter);

const isSupportedOptionalBody = (
  block: EffectBlock & { sourcePresencePolicy: SourcePresencePolicy },
): boolean => isSupportedDrawBody(block.effect);

export const isSupportedAutoRuntimeEffectBlock = (
  block: EffectBlock,
  adapter: AutoRuntimeEntryAdapter,
): block is EffectBlock & { sourcePresencePolicy: SourcePresencePolicy } => {
  if (!hasSupportedBlockEnvelope(block, adapter)) {
    return false;
  }
  if (block.optional === true) {
    return isSupportedOptionalBody(block);
  }
  return isSupportedNonOptionalBody(block, adapter);
};
