import type {
  CardInstance,
  CardRef,
  ContinuousEffectRecord,
  Duration,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SavedFieldObjectTargetBinding,
  SequenceSegmentResult,
} from "@optcg/types";

import { appendEvent, toStateSeq } from "../../action-results.js";
import { moveConcreteCardsToTrash } from "../../concrete-card-movement.js";
import {
  executeSelectedTargetEffectPrimitive,
  resolveSavedFieldObjectKoSelection,
} from "../../runtime/primitives/execute.js";
import { isSupportedSavedTargetContinuousSegment } from "../support/continuous.js";
import type { SupportedSequenceSegment } from "../support.js";
import { continuousRecordForSavedObject } from "./continuous-records.js";
import {
  activateFieldObject,
  findFieldObjectByRef,
  restFieldObjects,
  restProtectionAttemptFromEntry,
} from "./field-object-state.js";
import { resolveActivateTargets } from "./saved-target-resolution.js";
import { cardMatchesContinuousModifierTarget } from "../../runtime/continuous/target-matching.js";

type SegmentLedgers = {
  savedReferences: EffectExecutionFrame["savedReferences"];
  segmentResults: EffectExecutionFrame["segmentResults"];
};

const basePowerForFieldObject = (
  state: GameState,
  target: CardRef,
): number | undefined => {
  const located = findFieldObjectByRef(state, target);
  const printedPower = state.cardManifest.cards[target.cardId]?.power;
  if (located === null || printedPower === undefined) {
    return undefined;
  }

  let basePowerOverride: number | undefined;
  for (const effect of state.continuousEffects) {
    if (effect.modifier.layer !== "basePowerSet") continue;
    if (effect.modifier.operation.type !== "setBasePower") continue;
    if (!cardMatchesContinuousModifierTarget(state, located.card, effect)) {
      continue;
    }

    basePowerOverride =
      basePowerOverride === undefined
        ? effect.modifier.operation.value
        : Math.max(basePowerOverride, effect.modifier.operation.value);
  }

  return basePowerOverride ?? printedPower;
};

const swapBasePowerRecord = (params: {
  binding: SavedFieldObjectTargetBinding;
  duration: Duration;
  entry: EffectQueueEntry;
  idSuffix: string;
  state: GameState;
  target: CardRef;
  value: number;
}): ContinuousEffectRecord => ({
  id: `continuous:${String(params.entry.id)}:${params.idSuffix}`,
  source: params.entry.source,
  sourceSnapshot: params.entry.sourceSnapshot,
  controller: params.entry.controllerId,
  modifier: {
    layer: "basePowerSet",
    target: {
      type: "exactCard",
      card: params.target,
      binding: params.binding,
      createdAtStateSeq: params.state.seq,
    },
    operation: { type: "setBasePower", value: params.value },
  },
  duration: params.duration,
  createdBy: {
    type: "effect",
    queueEntryId: params.entry.id,
    effectId: params.entry.effectBlockId,
  },
  createdAtStateSeq: params.state.seq,
});

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
  events: EngineEvent[];
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
    {
      events: params.events,
      sourceKind: "effect",
      sourceControllerId: params.entry.controllerId,
      sourceCardId: params.entry.source.cardId,
    },
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

export const applySavedFieldObjectChangeAttackTargetSequenceSegment = (params: {
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
  if (params.segment.effect.type !== "changeAttackTarget") {
    return { ledgers: params.ledgers, state: params.state };
  }
  const resolvedSavedTarget = resolveSavedFieldObjectKoSelection({
    controllerId: params.entry.controllerId,
    savedReferences: params.ledgers.savedReferences,
    state: params.state,
    target: params.segment.effect.target,
  });
  const selectedTarget = resolvedSavedTarget.ok
    ? resolvedSavedTarget.selectedTargets[0]
    : undefined;
  if (selectedTarget === undefined || params.state.battle === undefined) {
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

  const nextState = {
    ...params.state,
    battle: {
      ...params.state.battle,
      currentTarget: selectedTarget,
    },
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
          changedState: true,
          selectedTargets: [selectedTarget],
        },
      },
    },
    state: nextState,
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
  if (!isSupportedSavedTargetContinuousSegment(params.segment.effect)) {
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

export const applySavedFieldObjectBasePowerSwapSequenceSegment = (params: {
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
  if (params.segment.effect.type !== "swapBasePower") {
    return { ledgers: params.ledgers, state: params.state };
  }

  const left = resolveSavedFieldObjectKoSelection({
    controllerId: params.entry.controllerId,
    savedReferences: params.ledgers.savedReferences,
    state: params.state,
    target: params.segment.effect.left,
  });
  const right = resolveSavedFieldObjectKoSelection({
    controllerId: params.entry.controllerId,
    savedReferences: params.ledgers.savedReferences,
    state: params.state,
    target: params.segment.effect.right,
  });
  const leftTarget = left.ok ? left.selectedTargets[0] : undefined;
  const rightTarget = right.ok ? right.selectedTargets[0] : undefined;
  if (
    !left.ok ||
    !right.ok ||
    left.selectedTargets.length !== 1 ||
    right.selectedTargets.length !== 1 ||
    leftTarget === undefined ||
    rightTarget === undefined
  ) {
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

  const leftBasePower = basePowerForFieldObject(params.state, leftTarget);
  const rightBasePower = basePowerForFieldObject(params.state, rightTarget);
  if (leftBasePower === undefined || rightBasePower === undefined) {
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

  const records = [
    swapBasePowerRecord({
      binding: params.segment.effect.left.binding,
      duration: params.segment.effect.duration,
      entry: params.entry,
      idSuffix: `${String(params.segment.id ?? params.index)}:left`,
      state: params.state,
      target: leftTarget,
      value: rightBasePower,
    }),
    swapBasePowerRecord({
      binding: params.segment.effect.right.binding,
      duration: params.segment.effect.duration,
      entry: params.entry,
      idSuffix: `${String(params.segment.id ?? params.index)}:right`,
      state: params.state,
      target: rightTarget,
      value: leftBasePower,
    }),
  ];
  const nextState = {
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
          changedState: true,
          selectedTargets: [leftTarget, rightTarget],
        },
      },
    },
    state: nextState,
  };
};
