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
  if (effectBlocks.length !== 2) {
    return false;
  }

  const runtimeBlocks = effectBlocks.filter(
    (effectBlock): effectBlock is EffectBlock => effectBlock !== undefined,
  );
  if (runtimeBlocks.length === 1) {
    const onlyRuntimeBlock = runtimeBlocks[0];
    return (
      onlyRuntimeBlock !== undefined &&
      triggerRankByType[onlyRuntimeBlock.trigger.type] !== undefined
    );
  }
  if (runtimeBlocks.length !== 2) {
    return false;
  }

  const triggerRanks = runtimeBlocks.map(
    (effectBlock) => triggerRankByType[effectBlock.trigger.type],
  );

  return (
    triggerRanks[0] !== undefined &&
    triggerRanks[1] !== undefined &&
    triggerRanks[0] < triggerRanks[1]
  );
}
