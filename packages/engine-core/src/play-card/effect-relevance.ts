import type { EffectDefinition, ResolvedCard } from "@optcg/types";

type EffectBlock = EffectDefinition["effects"][number];

const isOnPlayBlock = (effect: EffectBlock): boolean =>
  effect.category === "auto" && effect.trigger.type === "onPlay";

const isAlwaysOnBlock = (effect: EffectBlock): boolean =>
  effect.category === "permanent" || effect.category === "replacement";

const isMainEventBlock = (effect: EffectBlock): boolean =>
  effect.category === "auto" && effect.trigger.type === "main";

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
