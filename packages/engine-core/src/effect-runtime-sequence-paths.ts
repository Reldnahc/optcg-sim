import type { Effect } from "@optcg/types";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;

const rootSequenceEffectPath = ["effect", "sequence"] as const;

export const isRootSequencePath = (effectPath: readonly string[]): boolean =>
  effectPath.length === rootSequenceEffectPath.length &&
  effectPath.every((part, index) => part === rootSequenceEffectPath[index]);

export const segmentKey = (
  _segment: SequenceEffect["effects"][number],
  index: number,
): string => String(index);

export const segmentKeyForPath = (
  effectPath: readonly string[],
  segment: SequenceEffect["effects"][number],
  index: number,
): string =>
  isRootSequencePath(effectPath)
    ? segmentKey(segment, index)
    : `${effectPath.join(".")}:${segmentKey(segment, index)}`;

export const rootSequencePath = (): string[] => [...rootSequenceEffectPath];

export const conditionalThenSequencePath = (
  effectPath: readonly string[],
  index: number,
): string[] => [...effectPath, String(index), "then", "sequence"];

export const conditionalThenSingleEffectPath = (
  effectPath: readonly string[],
  index: number,
): string[] => [...effectPath, String(index), "then", "single"];

export const nestedSequencePath = (
  effectPath: readonly string[],
  index: number,
): string[] => [...effectPath, String(index), "nested", "sequence"];

export const toSingleEffectSequence = (effect: Effect): SequenceEffect => ({
  type: "sequence",
  effects: [{ connector: "always", effect }],
});

export const resolveSequenceForPath = (
  effect: SequenceEffect,
  effectPath: readonly string[],
): SequenceEffect | undefined => {
  if (!isRootSequencePath(effectPath)) {
    if (
      effectPath.length < rootSequenceEffectPath.length ||
      !isRootSequencePath(effectPath.slice(0, rootSequenceEffectPath.length))
    ) {
      return undefined;
    }
  }
  let current: SequenceEffect = effect;
  let index = rootSequenceEffectPath.length;
  while (index < effectPath.length) {
    const segmentIndex = Number(effectPath[index]);
    const branchToken = effectPath[index + 1];
    const sequenceToken = effectPath[index + 2];
    if (!Number.isSafeInteger(segmentIndex)) {
      return undefined;
    }
    const segment = current.effects[segmentIndex];
    if (segment === undefined) {
      return undefined;
    }
    if (branchToken === "nested" && sequenceToken === "sequence") {
      if (segment.effect.type !== "sequence") {
        return undefined;
      }
      current = segment.effect;
    } else if (branchToken === "then" && sequenceToken === "sequence") {
      if (segment.effect.type !== "conditional") {
        return undefined;
      }
      if (segment.effect.then.type !== "sequence") {
        return undefined;
      }
      current = segment.effect.then;
    } else if (branchToken === "then" && sequenceToken === "single") {
      if (segment.effect.type !== "conditional") {
        return undefined;
      }
      if (segment.effect.then.type === "sequence") {
        return undefined;
      }
      current = toSingleEffectSequence(segment.effect.then);
    } else {
      return undefined;
    }
    index += 3;
  }
  return current;
};

export const conditionalParentForPath = (
  effectPath: readonly string[],
):
  | {
      parentIndex: number;
      parentPath: string[];
    }
  | undefined => {
  if (isRootSequencePath(effectPath) || effectPath.length < 5) {
    return undefined;
  }
  const branchToken = effectPath[effectPath.length - 1];
  const parentToken = effectPath[effectPath.length - 2];
  const parentIndexToken = effectPath[effectPath.length - 3];
  const parentIndex = Number(parentIndexToken);
  if (
    !(
      (parentToken === "then" &&
        (branchToken === "sequence" || branchToken === "single")) ||
      (parentToken === "nested" && branchToken === "sequence")
    ) ||
    !Number.isSafeInteger(parentIndex)
  ) {
    return undefined;
  }
  return {
    parentIndex,
    parentPath: effectPath.slice(0, -3),
  };
};
