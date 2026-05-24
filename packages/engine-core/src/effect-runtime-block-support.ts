import type {
  Effect,
  EffectDefinition,
  SourcePresencePolicy,
  Trigger,
} from "@optcg/types";

import { isSupportedQueuedEffectConditionShape } from "./effect-runtime-conditions.js";
import { isSupportedContinuousQueueEffect } from "./effect-runtime-continuous.js";
import { isSupportedSearchRequestShape } from "./effect-runtime-search-reveal.js";
import { isSupportedQueuedAutoSequenceForEntryPoint } from "./effect-runtime-sequence-support.js";

type EffectBlock = EffectDefinition["effects"][number];

export interface AutoRuntimeEntryAdapter {
  readonly category: "auto";
  readonly sourcePresencePolicies: readonly SourcePresencePolicy[];
  readonly triggerType: Trigger["type"];
}

const isSupportedDrawBody = (
  effect: Effect,
): effect is Extract<Effect, { type: "draw" }> =>
  effect.type === "draw" &&
  effect.player === "self" &&
  Number.isInteger(effect.count) &&
  effect.count >= 0;

const isSupportedDrawUpToBody = (
  effect: Effect,
): effect is Extract<Effect, { type: "drawUpTo" }> =>
  effect.type === "drawUpTo" &&
  effect.player === "self" &&
  Number.isInteger(effect.count) &&
  effect.count >= 0;

const isSupportedSearchBody = (
  block: EffectBlock,
): block is EffectBlock & { effect: Extract<Effect, { type: "search" }> } =>
  block.sourcePresencePolicy === "mustRemainInSameZone" &&
  block.effect.type === "search" &&
  isSupportedSearchRequestShape(block.effect.request);

const isSupportedTrashFromHandBody = (
  effect: Effect,
): effect is Extract<Effect, { type: "trashFromHand" }> =>
  effect.type === "trashFromHand" &&
  effect.player === "self" &&
  effect.chooser === "self" &&
  effect.filter === undefined &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

const isQueuedAutoSequenceTriggerType = (
  triggerType: Trigger["type"],
): triggerType is "onPlay" | "whenAttacking" | "onKO" | "main" | "trigger" =>
  triggerType === "onPlay" ||
  triggerType === "whenAttacking" ||
  triggerType === "onKO" ||
  triggerType === "main" ||
  triggerType === "trigger";

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
    effect.type !== "cannotBlock"
  ) {
    return false;
  }
  return (
    effect.target.type === "self" ||
    effect.target.type === "myLeader" ||
    effect.duration.type === "whileSourceOnField"
  );
};

const isSupportedContinuousBody = (
  block: EffectBlock & { sourcePresencePolicy: SourcePresencePolicy },
): boolean =>
  isSupportedContinuousQueueEffect(block.effect) &&
  (block.sourcePresencePolicy === "mustRemainInSameZone" ||
    !isSourceDependentContinuousEffect(block.effect));

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
  isSupportedSearchBody(block) ||
  isSupportedContinuousBody(block) ||
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
