import type {
  CardInstance,
  CardRef,
  ContinuousEffectRecord,
  Effect,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  PlayerId,
  SequenceSegmentResult,
} from "@optcg/types";

import { appendEvent, toStateSeq } from "../action-results.js";
import { getOpponentId } from "../actions/state.js";
import { moveConcreteCardsToTrash } from "../concrete-card-movement.js";
import {
  executeSelectedTargetEffectPrimitive,
  resolveSavedFieldObjectKoSelection,
} from "../runtime/primitives/execute.js";
import type { SupportedSequenceSegment } from "./support.js";
import {
  applyRestProtection,
  type RestProtectionAttempt,
} from "../replacement/field-removal-protection.js";
import {
  continuousEffectConditionPasses,
  durationIsActive,
} from "../view/compute-view-continuous.js";

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
      changed: player.leader.state !== "active",
      state: {
        ...state,
        players: {
          ...state.players,
          [target.playerId]: {
            ...player,
            leader: { ...player.leader, state: "active" as const },
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

const resolveActivateTargets = (
  state: GameState,
  entry: EffectQueueEntry,
  target: Extract<Effect, { type: "activate" }>["target"],
  savedReferences: EffectExecutionFrame["savedReferences"],
): { ok: true; selectedTargets: CardRef[] } | { ok: false } => {
  if (target.type === "savedFieldObject") {
    const resolved = resolveSavedFieldObjectKoSelection({
      controllerId: entry.controllerId,
      savedReferences,
      state,
      target,
    });
    return resolved.ok
      ? { ok: true, selectedTargets: [...resolved.selectedTargets] }
      : { ok: false };
  }
  const player = state.players[entry.controllerId];
  if (player === undefined) {
    return { ok: false };
  }
  if (target.type === "myLeader") {
    return {
      ok: true,
      selectedTargets: [
        {
          instanceId: player.leader.instanceId,
          cardId: player.leader.cardId,
          playerId: entry.controllerId,
          zone: player.leader.zone,
        },
      ],
    };
  }
  if (
    target.type === "all" &&
    target.player === "self" &&
    target.zone === "characterArea"
  ) {
    return {
      ok: true,
      selectedTargets: player.characters.map((card) => ({
        instanceId: card.instanceId,
        cardId: card.cardId,
        playerId: entry.controllerId,
        zone: card.zone,
      })),
    };
  }
  return { ok: false };
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
    if (!durationIsActive(state, effect)) {
      return false;
    }
    if (!continuousEffectConditionPasses(state, effect)) {
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
