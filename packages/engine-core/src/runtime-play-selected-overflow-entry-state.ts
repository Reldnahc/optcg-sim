import type { GameState } from "@optcg/types";

export const findRuntimePlaySelectedOverflowEnterRested = (
  state: GameState,
  decisionId: NonNullable<GameState["pendingDecision"]>["id"],
): boolean | null => {
  const frame = state.effectExecutionFrames.find(
    (candidate) => candidate.pendingDecision.decisionId === decisionId,
  );
  if (frame === undefined) {
    return null;
  }
  const queueEntry = state.effectQueue.find(
    (entry) => entry.id === frame.queueEntryId,
  );
  if (queueEntry === undefined) {
    return null;
  }
  const sourceMetadata = state.cardManifest.cards[queueEntry.source.cardId];
  const effectDefinitionId = sourceMetadata?.support.effectDefinitionId;
  const definition =
    effectDefinitionId === undefined
      ? undefined
      : state.cardManifest.effectDefinitions?.[effectDefinitionId];
  const effectBlock = definition?.effects.find(
    (candidate) => candidate.id === frame.effectBlockId,
  );
  if (
    definition?.implementationStatus !== "implemented-dsl" ||
    effectBlock?.effect.type !== "sequence"
  ) {
    return null;
  }
  const segment =
    effectBlock.effect.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (segment?.effect.type !== "playSelected") {
    return null;
  }
  return segment.effect.enterRested === true;
};
