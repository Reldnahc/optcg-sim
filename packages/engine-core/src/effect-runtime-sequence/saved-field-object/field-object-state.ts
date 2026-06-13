import type {
  CardInstance,
  CardRef,
  ContinuousEffectRecord,
  EngineEvent,
  EffectQueueEntry,
  GameState,
  PlayerId,
} from "@optcg/types";

import { appendEvent } from "../../action-results.js";
import { getOpponentId } from "../../actions/state.js";
import {
  applyRestProtection,
  type RestProtectionAttempt,
} from "../../replacement/field-removal-protection.js";
import {
  continuousEffectConditionPasses,
  durationIsActive,
} from "../../view/compute-view-continuous.js";
import { canBecomeActive } from "../../runtime/continuous/state-transition-guards.js";

const refsEqual = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId;

type CardRestedSourceKind = "attack" | "blocker" | "cost" | "effect" | "rule";

export interface RestFieldObjectEventOptions {
  readonly events: EngineEvent[];
  readonly eventState?: GameState;
  readonly sourceControllerId?: PlayerId;
  readonly sourceKind?: CardRestedSourceKind;
}

const cardRestedCategory = (
  target: CardRef,
): "leader" | "character" | "stage" | undefined => {
  if (target.zone?.zone === "leaderArea") {
    return "leader";
  }
  if (target.zone?.zone === "characterArea") {
    return "character";
  }
  if (target.zone?.zone === "stageArea") {
    return "stage";
  }
  return undefined;
};

const appendCardRestedEvent = (
  state: GameState,
  target: CardRef,
  options: RestFieldObjectEventOptions | undefined,
): void => {
  const category = cardRestedCategory(target);
  if (category === undefined || options === undefined) {
    return;
  }
  appendEvent(
    options.eventState ?? state,
    options.events,
    "cardRested",
    {
      playerId: target.playerId,
      instanceId: target.instanceId,
      cardId: target.cardId,
      category,
      ...(options.sourceKind === undefined
        ? {}
        : { sourceKind: options.sourceKind }),
      ...(options.sourceControllerId === undefined
        ? {}
        : { sourceControllerId: options.sourceControllerId }),
    },
    { type: "public" },
  );
};

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
  eventOptions?: RestFieldObjectEventOptions,
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
    if (rested.changed) {
      appendCardRestedEvent(state, target, eventOptions);
    }
    nextState = rested.state;
    changed ||= rested.changed;
  }
  return { changed, state: nextState };
};

export const findFieldObjectByRef = (
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

export const restProtectionAttemptFromEntry = (
  entry: EffectQueueEntry,
): RestProtectionAttempt => ({
  sourceKind: "cardEffect",
  sourceControllerId: entry.controllerId,
  sourceCardId: entry.source.cardId,
  sourceCardCategory: entry.sourceSnapshot.category,
});

export const activateFieldObject = (
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
    if (!canBecomeActive(state, player.leader)) {
      return { changed: false, state };
    }
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
      if (!canBecomeActive(state, card)) {
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
      if (!canBecomeActive(state, card)) {
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
