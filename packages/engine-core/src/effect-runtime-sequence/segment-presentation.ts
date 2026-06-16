import type {
  Effect,
  EffectDefinition,
  EffectExecutionFrame,
  EffectQueueEntry,
  EffectTextSpanId,
  GameState,
} from "@optcg/types";

import { resolveSequenceForPath, rootSequencePath } from "./paths.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegment = SequenceEffect["effects"][number];

export const sequenceEffectBlockForEntry = (
  state: GameState,
  entry: EffectQueueEntry,
): EffectDefinition["effects"][number] | undefined => {
  if (entry.effectBlockOverride !== undefined) {
    return entry.effectBlockOverride;
  }
  const card = state.cardManifest.cards[entry.source.cardId];
  const definitionId = card?.support.effectDefinitionId;
  if (
    card === undefined ||
    card.support.status !== "implemented-dsl" ||
    definitionId === undefined
  ) {
    return undefined;
  }
  return state.cardManifest.effectDefinitions?.[definitionId]?.effects.find(
    (effect) => effect.id === entry.effectBlockId,
  );
};

const segmentPresentationSpanIds = (
  segment: SequenceSegment | undefined,
  entry: EffectQueueEntry,
): readonly EffectTextSpanId[] | undefined => {
  const presentation = segment?.presentation;
  if (
    presentation === undefined ||
    (entry.presentation?.textKind !== undefined &&
      presentation.textKind !== entry.presentation.textKind)
  ) {
    return undefined;
  }
  return presentation.spanIds.length === 0 ? undefined : presentation.spanIds;
};

export const segmentPresentationSpanIdsForFrame = (
  effectBlock: EffectDefinition["effects"][number] | undefined,
  entry: EffectQueueEntry,
  frame: EffectExecutionFrame,
): readonly EffectTextSpanId[] | undefined => {
  if (effectBlock?.effect.type !== "sequence") {
    return undefined;
  }
  const sequence = resolveSequenceForPath(effectBlock.effect, frame.effectPath);
  return segmentPresentationSpanIds(
    sequence?.effects[frame.pendingDecision.resumeAtSegmentIndex],
    entry,
  );
};

const segmentPathForResultKey = (
  key: string,
): {
  readonly effectPath: readonly string[];
  readonly index: number;
} | null => {
  const separatorIndex = key.lastIndexOf(":");
  const indexToken = separatorIndex < 0 ? key : key.slice(separatorIndex + 1);
  const index = Number(indexToken);
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    String(index) !== indexToken
  ) {
    return null;
  }
  return separatorIndex < 0
    ? { effectPath: rootSequencePath(), index }
    : { effectPath: key.slice(0, separatorIndex).split("."), index };
};

export const segmentPresentationSpanIdsForResultKey = (
  effectBlock: EffectDefinition["effects"][number] | undefined,
  entry: EffectQueueEntry,
  key: string,
): readonly EffectTextSpanId[] | undefined => {
  if (effectBlock?.effect.type !== "sequence") {
    return undefined;
  }
  const path = segmentPathForResultKey(key);
  if (path === null) {
    return undefined;
  }
  const sequence = resolveSequenceForPath(effectBlock.effect, path.effectPath);
  return segmentPresentationSpanIds(sequence?.effects[path.index], entry);
};
