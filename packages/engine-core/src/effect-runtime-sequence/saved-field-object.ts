import type {
  CardInstance,
  CardRef,
  ContinuousEffectRecord,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SequenceSegmentResult,
} from "@optcg/types";

import { appendEvent, toStateSeq } from "../action-results.js";
import { moveConcreteCardsToTrash } from "../concrete-card-movement.js";
import {
  executeSelectedTargetEffectPrimitive,
  resolveSavedFieldObjectKoSelection,
} from "../runtime/primitives/execute.js";
import type { SupportedSequenceSegment } from "./support.js";
import {
  activateFieldObject,
  findFieldObjectByRef,
  restFieldObjects,
  restProtectionAttemptFromEntry,
} from "./saved-field-object/field-object-state.js";
import { resolveActivateTargets } from "./saved-field-object/saved-target-resolution.js";

export { restFieldObjects };

type SegmentLedgers = {
  savedReferences: EffectExecutionFrame["savedReferences"];
  segmentResults: EffectExecutionFrame["segmentResults"];
};

const exactTargetForSavedObject = (
  entry: EffectQueueEntry,
  card: CardRef,
  state: GameState,
  objectIndex: number,
): ContinuousEffectRecord["modifier"]["target"] => ({
  type: "exactCard",
  card,
  binding: {
    family: "selectedTargets",
    saveResultAs: String(entry.effectBlockId),
    objectIndex,
  },
  createdAtStateSeq: state.seq,
});

const continuousRecordForSavedObject = (
  state: GameState,
  entry: EffectQueueEntry,
  segment: SupportedSequenceSegment,
  target: CardRef,
  objectIndex: number,
): ContinuousEffectRecord | undefined => {
  if (
    segment.effect.type !== "modifyPower" &&
    segment.effect.type !== "cannotBecomeActive" &&
    segment.effect.type !== "cannotAttack" &&
    segment.effect.type !== "cannotBlock" &&
    segment.effect.type !== "preventBlockerActivation" &&
    segment.effect.type !== "invalidateEffects"
  ) {
    return undefined;
  }
  if (segment.effect.type === "invalidateEffects") {
    return {
      id: `continuous:${String(entry.id)}:${String(segment.id ?? objectIndex)}`,
      source: entry.source,
      sourceSnapshot: entry.sourceSnapshot,
      controller: entry.controllerId,
      modifier: {
        layer: "effectInvalidation",
        target: exactTargetForSavedObject(entry, target, state, objectIndex),
        operation: { type: "invalidateEffects" },
      },
      duration: segment.effect.duration,
      createdBy: {
        type: "effect",
        queueEntryId: entry.id,
        effectId: entry.effectBlockId,
      },
      createdAtStateSeq: state.seq,
    };
  }
  if (segment.effect.type === "modifyPower") {
    if (typeof segment.effect.value !== "number") {
      return undefined;
    }
    return {
      id: `continuous:${String(entry.id)}:${String(segment.id ?? objectIndex)}`,
      source: entry.source,
      sourceSnapshot: entry.sourceSnapshot,
      controller: entry.controllerId,
      modifier: {
        layer: "powerAdd",
        target: exactTargetForSavedObject(entry, target, state, objectIndex),
        operation: { type: "addPower", value: segment.effect.value },
      },
      duration: segment.effect.duration,
      createdBy: {
        type: "effect",
        queueEntryId: entry.id,
        effectId: entry.effectBlockId,
      },
      createdAtStateSeq: state.seq,
    };
  }
  return {
    id: `continuous:${String(entry.id)}:${String(segment.id ?? objectIndex)}`,
    source: entry.source,
    sourceSnapshot: entry.sourceSnapshot,
    controller: entry.controllerId,
    modifier: {
      layer: "restriction",
      target: exactTargetForSavedObject(entry, target, state, objectIndex),
      operation: {
        type: "restriction",
        restriction: segment.effect.type,
      },
    },
    duration: segment.effect.duration,
    createdBy: {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    },
    createdAtStateSeq: state.seq,
  };
};

export const applySavedFieldObjectKoSequenceSegment = (params: {
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  index: number;
  ledgers: SegmentLedgers;
  segment: SupportedSequenceSegment;
  segmentKey: (segment: SupportedSequenceSegment, index: number) => string;
  state: GameState;
}): {
  events: ReturnType<typeof executeSelectedTargetEffectPrimitive>["events"];
  ledgers: SegmentLedgers;
  state: GameState;
} => {
  if (
    params.segment.effect.type !== "ko" ||
    params.segment.effect.target.type !== "savedFieldObject"
  ) {
    return {
      events: [],
      ledgers: params.ledgers,
      state: params.state,
    };
  }
  const resolvedSavedTarget = resolveSavedFieldObjectKoSelection({
    controllerId: params.entry.controllerId,
    savedReferences: params.ledgers.savedReferences,
    state: params.state,
    target: params.segment.effect.target,
  });
  if (!resolvedSavedTarget.ok) {
    return {
      events: [],
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [params.segmentKey(params.segment, params.index)]: {
            ...params.emptySegmentResult(),
            attempted: true,
          },
        },
      },
      state: params.state,
    };
  }
  const targetZone = params.segment.effect.target.zone;
  if (targetZone === undefined) {
    return {
      events: [],
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [params.segmentKey(params.segment, params.index)]: {
            ...params.emptySegmentResult(),
            attempted: true,
          },
        },
      },
      state: params.state,
    };
  }

  const resolvedKo = executeSelectedTargetEffectPrimitive(
    params.state,
    params.entry,
    {
      type: "ko",
      target: {
        type: "choose",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: params.segment.effect.target.player,
          zone: targetZone,
          min: resolvedSavedTarget.selectedTargets.length,
          max: resolvedSavedTarget.selectedTargets.length,
          allowFewerIfUnavailable: false,
          visibility: "public",
        },
      },
    },
    resolvedSavedTarget.selectedTargets,
  );
  if (resolvedKo.errors !== undefined) {
    return {
      events: [],
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [params.segmentKey(params.segment, params.index)]: {
            ...params.emptySegmentResult(),
            attempted: true,
          },
        },
      },
      state: params.state,
    };
  }

  if (resolvedKo.state.pendingDecision?.type === "chooseReplacement") {
    return {
      events: resolvedKo.events,
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [params.segmentKey(params.segment, params.index)]: {
            ...params.emptySegmentResult(),
            attempted: true,
          },
        },
      },
      state: resolvedKo.state,
    };
  }

  return {
    events: resolvedKo.events,
    ledgers: {
      ...params.ledgers,
      segmentResults: {
        ...params.ledgers.segmentResults,
        [params.segmentKey(params.segment, params.index)]: {
          ...params.emptySegmentResult(),
          attempted: true,
          succeeded: true,
          changedState: resolvedKo.events.length > 0,
          selectedTargets: [...resolvedSavedTarget.selectedTargets],
        },
      },
    },
    state: resolvedKo.state,
  };
};

export const applySavedFieldObjectTrashSequenceSegment = (params: {
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  index: number;
  ledgers: SegmentLedgers;
  segment: SupportedSequenceSegment;
  segmentKey: (segment: SupportedSequenceSegment, index: number) => string;
  state: GameState;
}): {
  events: EngineEvent[];
  ledgers: SegmentLedgers;
  state: GameState;
} => {
  if (
    params.segment.effect.type !== "trash" ||
    params.segment.effect.target.type !== "savedFieldObject"
  ) {
    return {
      events: [],
      ledgers: params.ledgers,
      state: params.state,
    };
  }
  const resolvedSavedTarget = resolveSavedFieldObjectKoSelection({
    controllerId: params.entry.controllerId,
    savedReferences: params.ledgers.savedReferences,
    state: params.state,
    target: params.segment.effect.target,
  });
  if (!resolvedSavedTarget.ok) {
    return {
      events: [],
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [params.segmentKey(params.segment, params.index)]: {
            ...params.emptySegmentResult(),
            attempted: true,
          },
        },
      },
      state: params.state,
    };
  }

  const targetCards = resolvedSavedTarget.selectedTargets
    .map((target) => findFieldObjectByRef(params.state, target)?.card)
    .filter((card): card is CardInstance => card !== undefined);
  const sourceZone = params.segment.effect.target.zone;
  const playerId = targetCards[0]?.zone.playerId;
  if (
    playerId === undefined ||
    (sourceZone !== "characterArea" && sourceZone !== "stageArea")
  ) {
    return {
      events: [],
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [params.segmentKey(params.segment, params.index)]: {
            ...params.emptySegmentResult(),
            attempted: true,
          },
        },
      },
      state: params.state,
    };
  }

  const attachedDonIds = new Set(
    targetCards.flatMap((card) => card.attachedDon),
  );
  const events: EngineEvent[] = [];
  const movement = moveConcreteCardsToTrash(params.state, events, targetCards, {
    cardMovedPayloadShape: "zoneRefs",
    cardMovedVisibility: { type: "public" },
    cardTrashedVisibility: { type: "public" },
    clearAttachedDon: true,
    emitCardTrashed: true,
    includeCardIdentityInCardMoved: true,
    playerId,
    reason: "effectTrash",
    sourceZone,
  });
  const movedPlayer = movement.state.players[playerId];
  if (movedPlayer === undefined) {
    return {
      events,
      ledgers: params.ledgers,
      state: params.state,
    };
  }
  const nextPlayer = {
    ...movedPlayer,
    costArea: movedPlayer.costArea.map((card) =>
      attachedDonIds.has(card.instanceId)
        ? { ...card, state: "rested" as const }
        : card,
    ),
  };
  const nextState: GameState = {
    ...movement.state,
    players: {
      ...movement.state.players,
      [playerId]: nextPlayer,
    },
  };
  for (const donId of attachedDonIds) {
    appendEvent(
      nextState,
      events,
      "donReturned",
      { playerId, donInstanceId: donId, state: "rested" },
      { type: "replayOnly" },
    );
  }

  return {
    events,
    ledgers: {
      ...params.ledgers,
      segmentResults: {
        ...params.ledgers.segmentResults,
        [params.segmentKey(params.segment, params.index)]: {
          ...params.emptySegmentResult(),
          attempted: true,
          succeeded: true,
          changedState: targetCards.length > 0,
          selectedTargets: [...resolvedSavedTarget.selectedTargets],
        },
      },
    },
    state: {
      ...nextState,
      eventJournal: [...params.state.eventJournal, ...events],
    },
  };
};

export const applySavedFieldObjectRestSequenceSegment = (params: {
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  index: number;
  ledgers: SegmentLedgers;
  segment: SupportedSequenceSegment;
  segmentKey: (segment: SupportedSequenceSegment, index: number) => string;
  state: GameState;
}): {
  ledgers: SegmentLedgers;
  state: GameState;
} => {
  if (
    params.segment.effect.type !== "rest" ||
    params.segment.effect.target.type !== "savedFieldObject"
  ) {
    return { ledgers: params.ledgers, state: params.state };
  }
  const resolvedSavedTarget = resolveSavedFieldObjectKoSelection({
    controllerId: params.entry.controllerId,
    savedReferences: params.ledgers.savedReferences,
    state: params.state,
    target: params.segment.effect.target,
  });
  if (!resolvedSavedTarget.ok) {
    return {
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [params.segmentKey(params.segment, params.index)]: {
            ...params.emptySegmentResult(),
            attempted: true,
          },
        },
      },
      state: params.state,
    };
  }

  const rested = restFieldObjects(
    params.state,
    resolvedSavedTarget.selectedTargets,
    restProtectionAttemptFromEntry(params.entry),
  );
  const nextState = rested.state;
  const changedState = rested.changed;

  return {
    ledgers: {
      ...params.ledgers,
      segmentResults: {
        ...params.ledgers.segmentResults,
        [params.segmentKey(params.segment, params.index)]: {
          ...params.emptySegmentResult(),
          attempted: true,
          succeeded: true,
          changedState,
          selectedTargets: [...resolvedSavedTarget.selectedTargets],
        },
      },
    },
    state: changedState
      ? { ...nextState, seq: toStateSeq(nextState.seq + 1) }
      : nextState,
  };
};

export const applySavedFieldObjectActivateSequenceSegment = (params: {
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  index: number;
  ledgers: SegmentLedgers;
  segment: SupportedSequenceSegment;
  segmentKey: (segment: SupportedSequenceSegment, index: number) => string;
  state: GameState;
}): {
  ledgers: SegmentLedgers;
  state: GameState;
} => {
  if (params.segment.effect.type !== "activate") {
    return { ledgers: params.ledgers, state: params.state };
  }
  const resolvedSavedTarget = resolveActivateTargets(
    params.state,
    params.entry,
    params.segment.effect.target,
    params.ledgers.savedReferences,
  );
  if (!resolvedSavedTarget.ok) {
    return {
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [params.segmentKey(params.segment, params.index)]: {
            ...params.emptySegmentResult(),
            attempted: true,
          },
        },
      },
      state: params.state,
    };
  }

  let nextState = params.state;
  let changedState = false;
  for (const target of resolvedSavedTarget.selectedTargets) {
    const activated = activateFieldObject(nextState, params.entry, target);
    nextState = activated.state;
    changedState ||= activated.changed;
  }

  return {
    ledgers: {
      ...params.ledgers,
      segmentResults: {
        ...params.ledgers.segmentResults,
        [params.segmentKey(params.segment, params.index)]: {
          ...params.emptySegmentResult(),
          attempted: true,
          succeeded: true,
          changedState,
          selectedTargets: [...resolvedSavedTarget.selectedTargets],
        },
      },
    },
    state: changedState
      ? { ...nextState, seq: toStateSeq(nextState.seq + 1) }
      : nextState,
  };
};

export const applySavedFieldObjectRestrictionSequenceSegment = (params: {
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  index: number;
  ledgers: SegmentLedgers;
  segment: SupportedSequenceSegment;
  segmentKey: (segment: SupportedSequenceSegment, index: number) => string;
  state: GameState;
}): {
  ledgers: SegmentLedgers;
  state: GameState;
} => {
  if (
    params.segment.effect.type !== "modifyPower" &&
    params.segment.effect.type !== "cannotBecomeActive" &&
    params.segment.effect.type !== "cannotAttack" &&
    params.segment.effect.type !== "cannotBlock" &&
    params.segment.effect.type !== "preventBlockerActivation" &&
    params.segment.effect.type !== "invalidateEffects"
  ) {
    return { ledgers: params.ledgers, state: params.state };
  }
  if (params.segment.effect.target.type !== "savedFieldObject") {
    return { ledgers: params.ledgers, state: params.state };
  }
  const resolvedSavedTarget = resolveSavedFieldObjectKoSelection({
    controllerId: params.entry.controllerId,
    savedReferences: params.ledgers.savedReferences,
    state: params.state,
    target: params.segment.effect.target,
  });
  if (!resolvedSavedTarget.ok) {
    return {
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [params.segmentKey(params.segment, params.index)]: {
            ...params.emptySegmentResult(),
            attempted: true,
          },
        },
      },
      state: params.state,
    };
  }

  const records = resolvedSavedTarget.selectedTargets
    .map((target, objectIndex) =>
      continuousRecordForSavedObject(
        params.state,
        params.entry,
        params.segment,
        target,
        objectIndex,
      ),
    )
    .filter((record): record is ContinuousEffectRecord => record !== undefined);
  const nextState =
    records.length === 0
      ? params.state
      : {
          ...params.state,
          continuousEffects: [...params.state.continuousEffects, ...records],
          seq: toStateSeq(params.state.seq + 1),
        };

  return {
    ledgers: {
      ...params.ledgers,
      segmentResults: {
        ...params.ledgers.segmentResults,
        [params.segmentKey(params.segment, params.index)]: {
          ...params.emptySegmentResult(),
          attempted: true,
          succeeded: true,
          changedState: records.length > 0,
          selectedTargets: [...resolvedSavedTarget.selectedTargets],
        },
      },
    },
    state: nextState,
  };
};
