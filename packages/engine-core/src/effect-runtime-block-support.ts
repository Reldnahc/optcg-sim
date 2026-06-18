import type { EffectDefinition, SourcePresencePolicy } from "@optcg/types";

import { isSupportedQueuedEffectConditionShape } from "./effect-runtime-conditions.js";
import { isSupportedContinuousQueueEffect } from "./runtime/continuous/continuous.js";
import { isSourceDependentContinuousQueueEffect } from "./runtime/continuous/support.js";
import { isSupportedMainEventTargetKoEffectAllowingOncePerTurn } from "./runtime/primitives/execute.js";
import { isSupportedQueuedAutoSequenceForEntryPoint } from "./effect-runtime-sequence/support.js";
import { isSupportedReusableEffectBody } from "./effect-runtime-reusable-body-support.js";
import {
  triggerContainsType,
  type AutoRuntimeEntryAdapter,
} from "./effect-runtime-entry-adapters.js";

export {
  autoRuntimeEntryAdapterForBlock,
  autoRuntimeEntryAdapterForTriggerType,
  autoRuntimeEntryAdaptersForBlock,
  triggerContainsType,
} from "./effect-runtime-entry-adapters.js";
export type { AutoRuntimeEntryAdapter } from "./effect-runtime-entry-adapters.js";

type EffectBlock = EffectDefinition["effects"][number];

export const isAutoRuntimeTriggerCandidate = (
  block: EffectBlock,
  adapter: AutoRuntimeEntryAdapter,
): boolean =>
  block.category === adapter.category &&
  triggerContainsType(block.trigger, adapter.triggerType);

const isSupportedSequenceBody = (
  block: EffectBlock,
  adapter: AutoRuntimeEntryAdapter,
): boolean =>
  block.sourcePresencePolicy !== undefined &&
  isSupportedQueuedAutoSequenceForEntryPoint(
    block,
    adapter.triggerType,
    block.sourcePresencePolicy,
    { allowInitialTrashFromHand: true },
  );

const isSupportedContinuousBody = (
  block: EffectBlock & { sourcePresencePolicy: SourcePresencePolicy },
): boolean =>
  isSupportedContinuousQueueEffect(block.effect) &&
  (block.sourcePresencePolicy === "mustRemainInSameZone" ||
    !isSourceDependentContinuousQueueEffect(block.effect));

const isSupportedTargetChoiceBody = (
  block: EffectBlock & { sourcePresencePolicy: SourcePresencePolicy },
): boolean => isSupportedMainEventTargetKoEffectAllowingOncePerTurn(block);

const hasSupportedBlockEnvelope = (
  block: EffectBlock,
  adapter: AutoRuntimeEntryAdapter,
): block is EffectBlock & { sourcePresencePolicy: SourcePresencePolicy } =>
  isAutoRuntimeTriggerCandidate(block, adapter) &&
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
  isSupportedReusableEffectBody(block.effect) ||
  isSupportedContinuousBody(block) ||
  isSupportedTargetChoiceBody(block) ||
  isSupportedSequenceBody(block, adapter);

const isSupportedOptionalBody = (
  block: EffectBlock & { sourcePresencePolicy: SourcePresencePolicy },
  adapter: AutoRuntimeEntryAdapter,
): boolean =>
  isSupportedNonOptionalBody({ ...block, optional: false }, adapter);

export const isSupportedAutoRuntimeEffectBlock = (
  block: EffectBlock,
  adapter: AutoRuntimeEntryAdapter,
): block is EffectBlock & { sourcePresencePolicy: SourcePresencePolicy } => {
  if (!hasSupportedBlockEnvelope(block, adapter)) {
    return false;
  }
  if (block.optional === true) {
    return isSupportedOptionalBody(block, adapter);
  }
  return isSupportedNonOptionalBody(block, adapter);
};
