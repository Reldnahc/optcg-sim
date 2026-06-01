import type {
  CardInstance,
  CardRef,
  ContinuousEffectRecord,
  EffectExecutionFrame,
  EffectQueueEntry,
  GameState,
  PlayerId,
  SequenceSegmentResult,
} from "@optcg/types";

import { toStateSeq } from "./action-results.js";
import { getOpponentId } from "./action-state.js";
import {
  executeSelectedTargetEffectPrimitive,
  resolveSavedFieldObjectKoSelection,
} from "./effect-runtime-primitives.js";
import type { SupportedSequenceSegment } from "./effect-runtime-sequence-support.js";
import {
  applyRestProtection,
  type RestProtectionAttempt,
} from "./field-removal-protection.js";

type SegmentLedgers = {
  savedReferences: EffectExecutionFrame["savedReferences"];
  segmentResults: EffectExecutionFrame["segmentResults"];
};

const refsEqual = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId;

const restFieldObject = (
  state: GameState,
  target: CardRef,
): { changed: boolean; state: GameState } => {
  const player = state.players[target.playerId];
  if (player === undefined) {
    return { changed: false, state };
  }
  if (
    target.zone?.zone === "leaderArea" &&
    refsEqual(target, {
      instanceId: player.leader.instanceId,
      cardId: player.leader.cardId,
      playerId: target.playerId,
      zone: player.leader.zone,
    })
  ) {
    return {
      changed: player.leader.state !== "rested",
      state: {
        ...state,
        players: {
          ...state.players,
          [target.playerId]: {
            ...player,
            leader: { ...player.leader, state: "rested" },
          },
        },
      },
    };
  }
  if (target.zone?.zone === "characterArea") {
    let changed = false;
    const characters = player.characters.map((card) => {
      if (
        card.instanceId !== target.instanceId ||
        card.cardId !== target.cardId
      ) {
        return card;
      }
      changed = card.state !== "rested";
      return { ...card, state: "rested" as const };
    });
    return {
      changed,
      state: {
        ...state,
        players: {
          ...state.players,
          [target.playerId]: { ...player, characters },
        },
      },
    };
  }
  if (
    target.zone?.zone === "stageArea" &&
    player.stage !== undefined &&
    refsEqual(target, {
      instanceId: player.stage.instanceId,
      cardId: player.stage.cardId,
      playerId: target.playerId,
      zone: player.stage.zone,
    })
  ) {
    return {
      changed: player.stage.state !== "rested",
      state: {
        ...state,
        players: {
          ...state.players,
          [target.playerId]: {
            ...player,
            stage: { ...player.stage, state: "rested" },
          },
        },
      },
    };
  }
  if (target.zone?.zone === "costArea") {
    let changed = false;
    const costArea = player.costArea.map((card) => {
      if (
        card.instanceId !== target.instanceId ||
        card.cardId !== target.cardId
      ) {
        return card;
      }
      changed = card.state !== "rested";
      return { ...card, state: "rested" as const };
    });
    return {
      changed,
      state: {
        ...state,
        players: {
          ...state.players,
          [target.playerId]: { ...player, costArea },
        },
      },
    };
  }
  return { changed: false, state };
};

export const restFieldObjects = (
  state: GameState,
  targets: readonly CardRef[],
  attempt?: RestProtectionAttempt,
): { changed: boolean; state: GameState } => {
  let nextState = state;
  let changed = false;
  for (const target of targets) {
    if (attempt !== undefined) {
      const located = findFieldObjectByRef(nextState, target);
      if (located !== null) {
        const protection = applyRestProtection(
          nextState,
          located.card,
          attempt,
        );
        if (!protection.ok || protection.prevented) {
          continue;
        }
      }
    }
    const rested = restFieldObject(nextState, target);
    nextState = rested.state;
    changed ||= rested.changed;
  }
  return { changed, state: nextState };
};

const findFieldObjectByRef = (
  state: GameState,
  target: CardRef,
): { card: CardInstance } | null => {
  const player = state.players[target.playerId];
  if (player === undefined) {
    return null;
  }
  if (
    target.zone?.zone === "leaderArea" &&
    player.leader.instanceId === target.instanceId &&
    player.leader.cardId === target.cardId
  ) {
    return { card: player.leader };
  }
  if (target.zone?.zone === "characterArea") {
    const card = player.characters.find(
      (candidate) =>
        candidate.instanceId === target.instanceId &&
        candidate.cardId === target.cardId,
    );
    return card === undefined ? null : { card };
  }
  if (
    target.zone?.zone === "stageArea" &&
    player.stage?.instanceId === target.instanceId &&
    player.stage.cardId === target.cardId
  ) {
    return { card: player.stage };
  }
  if (target.zone?.zone === "costArea") {
    const card = player.costArea.find(
      (candidate) =>
        candidate.instanceId === target.instanceId &&
        candidate.cardId === target.cardId,
    );
    return card === undefined ? null : { card };
  }
  return null;
};

const restProtectionAttemptFromEntry = (
  entry: EffectQueueEntry,
): RestProtectionAttempt => ({
  sourceKind: "cardEffect",
  sourceControllerId: entry.controllerId,
  sourceCardCategory: entry.sourceSnapshot.category,
});

const activateFieldObject = (
  state: GameState,
  entry: EffectQueueEntry,
  target: CardRef,
): { changed: boolean; state: GameState } => {
  const player = state.players[target.playerId];
  if (player === undefined) {
    return { changed: false, state };
  }
  if (isDonActivationPrevented(state, entry, target)) {
    return { changed: false, state };
  }
  if (target.zone?.zone === "costArea") {
    let changed = false;
    const costArea = player.costArea.map((card) => {
      if (
        card.instanceId !== target.instanceId ||
        card.cardId !== target.cardId
      ) {
        return card;
      }
      changed = card.state !== "active";
      return { ...card, state: "active" as const };
    });
    return {
      changed,
      state: {
        ...state,
        players: {
          ...state.players,
          [target.playerId]: { ...player, costArea },
        },
      },
    };
  }
  if (target.zone?.zone === "characterArea") {
    let changed = false;
    const characters = player.characters.map((card) => {
      if (
        card.instanceId !== target.instanceId ||
        card.cardId !== target.cardId
      ) {
        return card;
      }
      changed = card.state !== "active";
      return { ...card, state: "active" as const };
    });
    return {
      changed,
      state: {
        ...state,
        players: {
          ...state.players,
          [target.playerId]: { ...player, characters },
        },
      },
    };
  }
  return { changed: false, state };
};

const targetPlayerForDonActivationRestriction = (
  state: GameState,
  effect: ContinuousEffectRecord,
): PlayerId | undefined => {
  const target = effect.modifier.target;
  if (target.type !== "player") {
    return undefined;
  }
  switch (target.player) {
    case "self":
    case "controller":
      return effect.controller;
    case "owner":
      return effect.source.playerId;
    case "opponent":
      return getOpponentId(state, effect.controller) ?? undefined;
    case "turnPlayer":
      return state.turn.turnPlayerId;
    case "nonTurnPlayer":
      return getOpponentId(state, state.turn.turnPlayerId) ?? undefined;
    default:
      return undefined;
  }
};

const isDonActivationPrevented = (
  state: GameState,
  entry: EffectQueueEntry,
  target: CardRef,
): boolean => {
  if (target.zone?.zone !== "costArea") {
    return false;
  }
  return state.continuousEffects.some((effect) => {
    if (
      effect.modifier.layer !== "restriction" ||
      effect.modifier.operation.type !== "restriction" ||
      effect.modifier.operation.restriction !== "cannotActivateDon"
    ) {
      return false;
    }
    const sourceCategories = effect.modifier.operation.sourceCategories;
    if (
      sourceCategories !== undefined &&
      !sourceCategories.includes(entry.sourceSnapshot.category)
    ) {
      return false;
    }
    return (
      targetPlayerForDonActivationRestriction(state, effect) === target.playerId
    );
  });
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
    segment.effect.type !== "cannotBecomeActive" &&
    segment.effect.type !== "cannotAttack" &&
    segment.effect.type !== "cannotBlock" &&
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
          zone: params.segment.effect.target.zone,
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
    params.segment.effect.type !== "cannotBecomeActive" &&
    params.segment.effect.type !== "cannotAttack" &&
    params.segment.effect.type !== "cannotBlock" &&
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
