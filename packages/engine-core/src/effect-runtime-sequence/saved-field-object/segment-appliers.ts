import type {
  CardInstance,
  ContinuousEffectRecord,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SequenceSegmentResult,
} from "@optcg/types";

import { appendEvent, toStateSeq } from "../../action-results.js";
import { moveConcreteCardsToTrash } from "../../concrete-card-movement.js";
import {
  executeSelectedTargetEffectPrimitive,
  resolveSavedFieldObjectKoSelection,
} from "../../runtime/primitives/execute.js";
import type { SupportedSequenceSegment } from "../support.js";
import { continuousRecordForSavedObject } from "./continuous-records.js";
import {
  activateFieldObject,
  findFieldObjectByRef,
  restFieldObjects,
  restProtectionAttemptFromEntry,
} from "./field-object-state.js";
import { resolveActivateTargets } from "./saved-target-resolution.js";

type SegmentLedgers = {
  savedReferences: EffectExecutionFrame["savedReferences"];
  segmentResults: EffectExecutionFrame["segmentResults"];
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
  if (
    params.segment.effect.type !== "modifyPower" &&
    params.segment.effect.type !== "giveKeyword" &&
    params.segment.effect.type !== "giveAttribute" &&
    params.segment.effect.type !== "cannotBecomeActive" &&
    params.segment.effect.type !== "cannotAttack" &&
    params.segment.effect.type !== "attackCost" &&
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
