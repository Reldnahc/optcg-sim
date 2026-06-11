import type {
  CardInstance,
  EngineError,
  EngineEvent,
  GameState,
  PlayerId,
  ReplacementProcess,
} from "@optcg/types";

import { appendEvent } from "../action-results.js";
import {
  KO_TRASH_MOVEMENT_REASON,
  moveConcreteCardsToTrash,
} from "../concrete-card-movement.js";
import { moveFieldCardToOwnerDeckBottom } from "../movement/field-to-deck.js";
import { moveFieldCardToOwnerHand } from "../movement/field-to-hand.js";
import { moveFieldCardToOwnerLife } from "../movement/field-to-life.js";
import { applyFieldRemovalProtection } from "./field-removal-protection.js";
import {
  fieldRemovalProcessTargets,
  withoutFieldRemovalProcessTargets,
} from "./field-removal-targets.js";

export type FieldRemovalExecutionFailureReason =
  | "unsupported-effect-shape"
  | "missing-card"
  | "stale-target"
  | "missing-source-controller"
  | "unsupported-field-removal-destination"
  | "ambiguous-field-removal-source"
  | "malformed-field-removal-protection";

interface FieldRemovalExecutionErrorDetails {
  reason: FieldRemovalExecutionFailureReason;
}

type LocatedCard = {
  playerId: PlayerId;
  zone:
    | "leaderArea"
    | "characterArea"
    | "stageArea"
    | "hand"
    | "deck"
    | "trash"
    | "costArea"
    | "donDeck"
    | "life";
  card: CardInstance;
};

const fieldRemovalExecutionError = (
  effectId: string,
  reason: FieldRemovalExecutionFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies FieldRemovalExecutionErrorDetails,
});

const findCardByInstanceId = (
  state: GameState,
  instanceId: CardInstance["instanceId"],
): LocatedCard | null => {
  for (const [playerId, player] of Object.entries(state.players) as [
    PlayerId,
    GameState["players"][PlayerId],
  ][]) {
    if (player.leader.instanceId === instanceId) {
      return { playerId, zone: "leaderArea", card: player.leader };
    }

    const collections = [
      ["characterArea", player.characters],
      ["stageArea", player.stage === undefined ? [] : [player.stage]],
      ["hand", player.hand],
      ["deck", player.deck],
      ["trash", player.trash],
      ["costArea", player.costArea],
      ["donDeck", player.donDeck],
      ["life", player.life.map((lifeCard) => lifeCard.card)],
    ] as const;

    for (const [zone, cards] of collections) {
      const card = cards.find(
        (candidate) => candidate.instanceId === instanceId,
      );
      if (card !== undefined) {
        return { playerId, zone, card };
      }
    }
  }
  return null;
};

const fieldRemovalMoveDestination = (
  process: ReplacementProcess,
):
  | { destination: "deckBottom" }
  | { destination: "hand" }
  | {
      destination: "life";
      faceUp?: boolean;
      position: "top" | "bottom";
    }
  | null => {
  if (process.type !== "moveZone") {
    return null;
  }
  const payload = process.payload;
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  if (!("fieldRemovalAttempt" in payload)) {
    return null;
  }
  const attempt = payload.fieldRemovalAttempt;
  if (
    typeof attempt === "object" &&
    attempt !== null &&
    "classification" in attempt
  ) {
    if (attempt.classification === "moveFromFieldToHand") {
      return { destination: "hand" };
    }
    if (attempt.classification === "moveFromFieldToDeckBottom") {
      return { destination: "deckBottom" };
    }
    if (attempt.classification === "moveFromFieldToLife") {
      const destination =
        "fieldRemovalDestination" in payload
          ? payload.fieldRemovalDestination
          : undefined;
      if (
        typeof destination === "object" &&
        destination !== null &&
        "zone" in destination &&
        destination.zone === "life" &&
        "position" in destination &&
        (destination.position === "top" || destination.position === "bottom")
      ) {
        return {
          destination: "life",
          position: destination.position,
          ...("faceUp" in destination && typeof destination.faceUp === "boolean"
            ? { faceUp: destination.faceUp }
            : {}),
        };
      }
    }
  }
  return null;
};

const executeUnreplacedSingleMoveZoneProcess = (
  state: GameState,
  events: EngineEvent[],
  effectId: string,
  process: ReplacementProcess,
  target: NonNullable<ReplacementProcess["target"]>,
): { state: GameState } | { error: EngineError } => {
  const destination = fieldRemovalMoveDestination(process);
  if (destination === null) {
    return {
      error: fieldRemovalExecutionError(effectId, "unsupported-effect-shape"),
    };
  }

  const located = findCardByInstanceId(state, target.instanceId);
  if (
    located === null ||
    (located.zone !== "characterArea" && located.zone !== "stageArea")
  ) {
    return {
      error: fieldRemovalExecutionError(effectId, "stale-target"),
    };
  }

  const protection = applyFieldRemovalProtection(state, located.card, {
    ...process,
    target,
  });
  if (!protection.ok) {
    return {
      error: fieldRemovalExecutionError(effectId, protection.reason),
    };
  }
  if (protection.prevented) {
    return { state };
  }

  if (destination.destination === "hand") {
    return moveFieldCardToOwnerHand({
      card: located.card,
      causedBy: process.causedBy,
      events,
      playerId: located.playerId,
      sourceZone: located.zone,
      state,
    });
  }
  if (destination.destination === "life") {
    return moveFieldCardToOwnerLife({
      card: located.card,
      causedBy: process.causedBy,
      events,
      playerId: located.playerId,
      position: destination.position,
      sourceZone: located.zone,
      state,
      ...(destination.faceUp === undefined
        ? {}
        : { faceUp: destination.faceUp }),
    });
  }
  return moveFieldCardToOwnerDeckBottom({
    card: located.card,
    causedBy: process.causedBy,
    events,
    playerId: located.playerId,
    sourceZone: located.zone,
    state,
  });
};

const executeUnreplacedSingleKoProcess = (
  state: GameState,
  events: EngineEvent[],
  effectId: string,
  process: ReplacementProcess,
  target: NonNullable<ReplacementProcess["target"]>,
): { state: GameState } | { error: EngineError } => {
  if (process.type !== "ko") {
    return {
      error: fieldRemovalExecutionError(effectId, "unsupported-effect-shape"),
    };
  }

  const located = findCardByInstanceId(state, target.instanceId);
  if (
    located === null ||
    (located.zone !== "characterArea" && located.zone !== "stageArea")
  ) {
    return {
      error: fieldRemovalExecutionError(effectId, "stale-target"),
    };
  }

  const player = state.players[located.playerId];
  if (player === undefined) {
    return {
      error: fieldRemovalExecutionError(effectId, "missing-card"),
    };
  }

  const protection = applyFieldRemovalProtection(state, located.card, {
    ...process,
    target,
  });
  if (!protection.ok) {
    return {
      error: fieldRemovalExecutionError(effectId, protection.reason),
    };
  }
  if (protection.prevented) {
    return { state };
  }

  const attachedDonIds = new Set(located.card.attachedDon);
  const nextCostArea = player.costArea.map((card) =>
    attachedDonIds.has(card.instanceId)
      ? { ...card, state: "rested" as const }
      : card,
  );

  const stateWithRestedAttachedDon = {
    ...state,
    players: {
      ...state.players,
      [located.playerId]: {
        ...player,
        costArea: nextCostArea,
      },
    },
  };

  appendEvent(stateWithRestedAttachedDon, events, "cardKOd", {
    playerId: located.playerId,
    instanceId: located.card.instanceId,
  });
  const movedResult = moveConcreteCardsToTrash(
    stateWithRestedAttachedDon,
    events,
    [located.card],
    {
      cardMovedPayloadShape: "zoneRefs",
      clearAttachedDon: true,
      emitCardTrashed: false,
      includeCardIdentityInCardMoved: true,
      playerId: located.playerId,
      reason: KO_TRASH_MOVEMENT_REASON,
      sourceZone: located.zone,
    },
  );
  for (const donId of located.card.attachedDon) {
    appendEvent(
      movedResult.state,
      events,
      "donReturned",
      { playerId: located.playerId, donInstanceId: donId, state: "rested" },
      { type: "replayOnly" },
    );
  }

  return { state: movedResult.state };
};

export const executeUnreplacedSelectedTargetFieldRemovalProcess = (
  state: GameState,
  events: EngineEvent[],
  effectId: string,
  process: ReplacementProcess,
): { state: GameState } | { error: EngineError } => {
  const targets = fieldRemovalProcessTargets(process);
  if (targets.length === 0) {
    return {
      error: fieldRemovalExecutionError(effectId, "unsupported-effect-shape"),
    };
  }

  let nextState = state;
  for (const target of targets) {
    const result =
      process.type === "moveZone"
        ? executeUnreplacedSingleMoveZoneProcess(
            nextState,
            events,
            effectId,
            process,
            target,
          )
        : executeUnreplacedSingleKoProcess(
            nextState,
            events,
            effectId,
            process,
            target,
          );
    if ("error" in result) {
      return result;
    }
    nextState = result.state;
  }
  return { state: nextState };
};

export const executeUnreplacedSelectedTargetKoProcess =
  executeUnreplacedSelectedTargetFieldRemovalProcess;

export const continueUncoveredFieldRemovalTargets = (
  state: GameState,
  events: EngineEvent[],
  effectId: string,
  process: ReplacementProcess,
  coveredTargets: readonly NonNullable<ReplacementProcess["target"]>[],
): { state: GameState } | { error: EngineError } => {
  const uncoveredProcess = withoutFieldRemovalProcessTargets(
    process,
    coveredTargets,
  );
  return fieldRemovalProcessTargets(uncoveredProcess).length === 0
    ? { state }
    : executeUnreplacedSelectedTargetFieldRemovalProcess(
        state,
        events,
        effectId,
        uncoveredProcess,
      );
};
