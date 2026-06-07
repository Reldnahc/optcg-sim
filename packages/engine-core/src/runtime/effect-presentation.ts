import type { EffectTextSourceMap, EffectTextSpanId } from "@optcg/types";

export const activeSpanIdsForEffectPath = ({
  sourceMap,
  effectPath,
  sequenceIndex,
}: {
  readonly sourceMap: EffectTextSourceMap | undefined;
  readonly effectPath: readonly string[];
  readonly sequenceIndex?: number;
}): EffectTextSpanId[] => {
  if (sourceMap === undefined) {
    return [];
  }

  return sourceMap.spans
    .filter((span) => {
      const samePath =
        span.effectPath === undefined ||
        (span.effectPath.length === effectPath.length &&
          span.effectPath.every((part, index) => part === effectPath[index]));
      const sameIndex =
        sequenceIndex === undefined || span.sequenceIndex === sequenceIndex;
      return (
        samePath &&
        sameIndex &&
        (span.role === "body" ||
          span.role === "cost" ||
          span.role === "choiceOption")
      );
    })
    .map((span) => span.id);
};
