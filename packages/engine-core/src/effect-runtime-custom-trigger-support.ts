import type { EffectDefinition, EffectQueueEntry } from "@optcg/types";

import {
  isSupportedAutoRuntimeEffectBlock,
  type AutoRuntimeEntryAdapter,
} from "./effect-runtime-block-support.js";

type EffectBlock = EffectDefinition["effects"][number];

const effectResolvedCustomAdapter = {
  category: "auto",
  triggerType: "custom",
  sourcePresencePolicies: ["mustRemainInSameZone"],
} satisfies AutoRuntimeEntryAdapter;

export const isSupportedEffectResolvedCustomEffect = (
  effect: EffectBlock,
  eventName: string,
): effect is EffectBlock & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
} =>
  effect.sourcePresencePolicy === "mustRemainInSameZone" &&
  effect.trigger.type === "custom" &&
  effect.trigger.event === eventName &&
  isSupportedAutoRuntimeEffectBlock(effect, effectResolvedCustomAdapter);
