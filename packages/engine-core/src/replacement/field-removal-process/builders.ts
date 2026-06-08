import type {
  CardRef,
  EffectQueueEntry,
  PlayerId,
  ReplacementProcess,
} from "@optcg/types";

import type { SelectedTargetKoReplacementPayload } from "./types.js";

export const buildKoReplacementProcess = (params: {
  battleContinuation?: SelectedTargetKoReplacementPayload["battleContinuation"];
  causedBy: ReplacementProcess["causedBy"];
  effectId: string;
  id: ReplacementProcess["id"];
  source: CardRef;
  sourceControllerId: PlayerId;
  sourceKind: "battle" | "cardEffect";
  queueEntryId?: EffectQueueEntry["id"];
  target: CardRef;
}): ReplacementProcess => {
  const payload: SelectedTargetKoReplacementPayload = {
    effectId: params.effectId,
    ...(params.queueEntryId === undefined
      ? {}
      : { queueEntryId: params.queueEntryId }),
    source: params.source,
    target: params.target,
    fieldRemovalAttempt: {
      processFamily: "fieldRemoval",
      classification: "moveFromFieldToTrash",
      sourceKind: params.sourceKind,
      sourceControllerId: params.sourceControllerId,
    },
    ...(params.battleContinuation === undefined
      ? {}
      : { battleContinuation: params.battleContinuation }),
  };
  return {
    id: params.id,
    type: "ko",
    source: params.source,
    target: params.target,
    payload,
    causedBy: params.causedBy,
    usedReplacementIds: [],
  };
};

export const buildFieldRemovalKoReplacementProcess = buildKoReplacementProcess;

export const buildSelectedTargetKoReplacementProcess = (
  entry: EffectQueueEntry,
  target: CardRef,
  targetIndex: number,
): ReplacementProcess =>
  buildKoReplacementProcess({
    effectId: entry.effectBlockId,
    id: `${entry.id}:ko:${target.instanceId}:${String(targetIndex)}`,
    queueEntryId: entry.id,
    source: entry.source,
    target,
    causedBy: entry.causedBy,
    sourceKind: "cardEffect",
    sourceControllerId: entry.controllerId,
  });

export const buildSelectedTargetFieldRemovalKoReplacementProcess =
  buildSelectedTargetKoReplacementProcess;

export const buildSelectedTargetsFieldRemovalKoReplacementProcess = (
  entry: EffectQueueEntry,
  targets: readonly CardRef[],
): ReplacementProcess => {
  const firstTarget = targets[0];
  if (firstTarget === undefined) {
    throw new Error(
      "field-removal K.O. replacement process requires a target.",
    );
  }
  const payload: SelectedTargetKoReplacementPayload = {
    effectId: entry.effectBlockId,
    queueEntryId: entry.id,
    source: entry.source,
    target: firstTarget,
    ...(targets.length > 1 ? { targets: [...targets] } : {}),
    fieldRemovalAttempt: {
      processFamily: "fieldRemoval",
      classification: "moveFromFieldToTrash",
      sourceKind: "cardEffect",
      sourceControllerId: entry.controllerId,
    },
  };
  return {
    id:
      targets.length === 1
        ? `${entry.id}:ko:${firstTarget.instanceId}:0`
        : `${entry.id}:ko:${targets
            .map((target) => target.instanceId)
            .join("+")}`,
    type: "ko",
    source: entry.source,
    target: firstTarget,
    payload,
    causedBy: entry.causedBy,
    usedReplacementIds: [],
  };
};

export const buildSelectedTargetMoveZoneReplacementProcess = (params: {
  classification: "moveFromFieldToDeckBottom" | "moveFromFieldToHand";
  entry: EffectQueueEntry;
  target: CardRef;
  targetIndex: number;
}): ReplacementProcess => {
  const payload: SelectedTargetKoReplacementPayload = {
    effectId: params.entry.effectBlockId,
    queueEntryId: params.entry.id,
    source: params.entry.source,
    target: params.target,
    fieldRemovalAttempt: {
      processFamily: "fieldRemoval",
      classification: params.classification,
      sourceKind: "cardEffect",
      sourceControllerId: params.entry.controllerId,
    },
  };
  return {
    id: `${params.entry.id}:moveZone:${params.target.instanceId}:${String(
      params.targetIndex,
    )}`,
    type: "moveZone",
    source: params.entry.source,
    target: params.target,
    payload,
    causedBy: params.entry.causedBy,
    usedReplacementIds: [],
  };
};

export const buildSelectedTargetFieldRemovalMoveToHandReplacementProcess =
  buildSelectedTargetMoveZoneReplacementProcess;

export const buildSelectedTargetFieldRemovalMoveZoneReplacementProcess =
  buildSelectedTargetMoveZoneReplacementProcess;

export const buildSelectedTargetsFieldRemovalMoveZoneReplacementProcess =
  (params: {
    classification: "moveFromFieldToDeckBottom" | "moveFromFieldToHand";
    entry: EffectQueueEntry;
    targets: readonly CardRef[];
  }): ReplacementProcess => {
    const firstTarget = params.targets[0];
    if (firstTarget === undefined) {
      throw new Error("field-removal replacement process requires a target.");
    }
    const payload: SelectedTargetKoReplacementPayload = {
      effectId: params.entry.effectBlockId,
      queueEntryId: params.entry.id,
      source: params.entry.source,
      target: firstTarget,
      ...(params.targets.length > 1 ? { targets: [...params.targets] } : {}),
      fieldRemovalAttempt: {
        processFamily: "fieldRemoval",
        classification: params.classification,
        sourceKind: "cardEffect",
        sourceControllerId: params.entry.controllerId,
      },
    };
    return {
      id:
        params.targets.length === 1
          ? `${params.entry.id}:moveZone:${firstTarget.instanceId}:0`
          : `${params.entry.id}:moveZone:${params.targets
              .map((target) => target.instanceId)
              .join("+")}`,
      type: "moveZone",
      source: params.entry.source,
      target: firstTarget,
      payload,
      causedBy: params.entry.causedBy,
      usedReplacementIds: [],
    };
  };
