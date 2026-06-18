import type { EffectDefinition, ResolvedCard } from "@optcg/types";

import { triggerContainsType } from "../effect-runtime-entry-adapters.js";

type EffectBlock = EffectDefinition["effects"][number];

const isOnPlayBlock = (effect: EffectBlock): boolean =>
  effect.category === "auto" && triggerContainsType(effect.trigger, "onPlay");

const isAlwaysOnBlock = (effect: EffectBlock): boolean =>
  effect.category === "permanent" || effect.category === "replacement";

const isMainEventBlock = (effect: EffectBlock): boolean =>
  effect.category === "auto" && triggerContainsType(effect.trigger, "main");

export const playRelevantEffectBlocks = (
  category: ResolvedCard["category"],
  effects: readonly EffectBlock[],
): EffectBlock[] => {
  if (category === "event") {
    return effects.filter(isMainEventBlock);
  }
  if (category === "character" || category === "stage") {
    return effects.filter(
      (effect) => isOnPlayBlock(effect) || isAlwaysOnBlock(effect),
    );
  }
  return [];
};
