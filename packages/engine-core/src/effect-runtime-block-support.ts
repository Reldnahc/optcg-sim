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

export interface AutoRuntimeEntryAdapter {
  readonly category: "auto";
  readonly sourcePresencePolicies: readonly SourcePresencePolicy[];
  readonly triggerType: Trigger["type"];
}

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
  (effect.trigger.type === "main" || effect.trigger.type === "onPlay");

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
  block.trigger.type === adapter.triggerType &&
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
