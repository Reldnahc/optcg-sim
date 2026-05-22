import type { EffectBlock } from "@optcg/types";

const triggerRankByType: Readonly<Record<string, number>> = {
  onKO: 3,
  onPlay: 1,
  permanent: 0,
  trigger: 4,
  whenAttacking: 2,
};

export function isCertifiedLineSeparatedEffectBlockComposition(
  effectBlocks: readonly (EffectBlock | undefined)[],
): boolean {
  if (effectBlocks.length < 2) {
    return false;
  }

  const rankedRuntimeBlocks = effectBlocks.flatMap((effectBlock) => {
    if (effectBlock === undefined) {
      return [];
    }
    const rank = triggerRankByType[effectBlock.trigger.type];
    return rank === undefined ? [] : [rank];
  });
  if (rankedRuntimeBlocks.length === 0) {
    return false;
  }

  for (let index = 1; index < rankedRuntimeBlocks.length; index += 1) {
    const previous = rankedRuntimeBlocks[index - 1];
    const current = rankedRuntimeBlocks[index];
    if (
      previous === undefined ||
      current === undefined ||
      previous >= current
    ) {
      return false;
    }
  }

  return true;
}
