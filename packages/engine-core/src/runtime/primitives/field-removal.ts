import type {
  CardInstance,
  EngineError,
  EngineEvent,
  GameState,
  PlayerId,
  ReplacementProcess,
} from "@optcg/types";

import { appendEvent } from "../../action-results.js";
import {
  KO_TRASH_MOVEMENT_REASON,
  moveConcreteCardsToTrash,
} from "../../concrete-card-movement.js";
import { moveFieldCardToOwnerHand } from "../../movement/field-to-hand.js";
import {
  detectSupportedFieldRemovalReplacementCandidate,
  normalizeFieldRemovalProcess,
  pauseFieldRemovalReplacementProcess,
} from "../../replacement/field-removal-process.js";
import { applyFieldRemovalProtection } from "../../replacement/field-removal-protection.js";

export type SelectedTargetFieldRemovalExecutionFailureReason =
  | "unsupported-effect-shape"
  | "missing-card"
  | "stale-target"
  | "missing-source-controller"
  | "unsupported-field-removal-destination"
  | "ambiguous-field-removal-source"
  | "malformed-field-removal-protection";

interface SelectedTargetFieldRemovalExecutionErrorDetails {
  reason: SelectedTargetFieldRemovalExecutionFailureReason;
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

const selectedTargetFieldRemovalExecutionError = (
  effectId: string,
  reason: SelectedTargetFieldRemovalExecutionFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies SelectedTargetFieldRemovalExecutionErrorDetails,
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

const isMoveFromFieldToHandProcess = (process: ReplacementProcess): boolean => {
  if (process.type !== "moveZone") {
    return false;
  }
  const payload = process.payload;
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  if (!("fieldRemovalAttempt" in payload)) {
    return false;
  }
  const attempt = payload.fieldRemovalAttempt;
  return (
    typeof attempt === "object" &&
    attempt !== null &&
    "classification" in attempt &&
    attempt.classification === "moveFromFieldToHand"
  );
};

const executeUnreplacedSelectedTargetMoveToHandProcess = (
  state: GameState,
  events: EngineEvent[],
  effectId: string,
  process: ReplacementProcess,
): { state: GameState } | { error: EngineError } => {
  const target = process.target;
  if (!isMoveFromFieldToHandProcess(process) || target === undefined) {
    return {
      error: selectedTargetFieldRemovalExecutionError(
        effectId,
        "unsupported-effect-shape",
      ),
    };
  }

  const located = findCardByInstanceId(state, target.instanceId);
  if (
    located === null ||
    (located.zone !== "characterArea" && located.zone !== "stageArea")
  ) {
    return {
      error: selectedTargetFieldRemovalExecutionError(effectId, "stale-target"),
    };
  }

  const protection = applyFieldRemovalProtection(state, located.card, process);
  if (!protection.ok) {
    return {
      error: selectedTargetFieldRemovalExecutionError(
        effectId,
        protection.reason,
      ),
    };
  }
  if (protection.prevented) {
    return { state };
  }

  return moveFieldCardToOwnerHand({
    card: located.card,
    causedBy: process.causedBy,
    events,
    playerId: located.playerId,
    sourceZone: located.zone,
    state,
  });
};

const executeUnreplacedSelectedTargetKoFieldRemovalProcess = (
  state: GameState,
  events: EngineEvent[],
  effectId: string,
  process: ReplacementProcess,
): { state: GameState } | { error: EngineError } => {
  const target = process.target;
  if (process.type !== "ko" || target === undefined) {
    return {
      error: selectedTargetFieldRemovalExecutionError(
        effectId,
        "unsupported-effect-shape",
      ),
    };
  }

  const located = findCardByInstanceId(state, target.instanceId);
  if (
    located === null ||
    (located.zone !== "characterArea" && located.zone !== "stageArea")
  ) {
    return {
      error: selectedTargetFieldRemovalExecutionError(effectId, "stale-target"),
    };
  }

  const player = state.players[located.playerId];
  if (player === undefined) {
    return {
      error: selectedTargetFieldRemovalExecutionError(effectId, "missing-card"),
    };
  }

  const protection = applyFieldRemovalProtection(state, located.card, process);
  if (!protection.ok) {
    return {
      error: selectedTargetFieldRemovalExecutionError(
        effectId,
        protection.reason,
      ),
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
  if (process.type === "moveZone") {
    return executeUnreplacedSelectedTargetMoveToHandProcess(
      state,
      events,
      effectId,
      process,
    );
  }

  return executeUnreplacedSelectedTargetKoFieldRemovalProcess(
    state,
    events,
    effectId,
    process,
  );
};

export const executeUnreplacedSelectedTargetKoProcess =
  executeUnreplacedSelectedTargetFieldRemovalProcess;

export const executeSelectedTargetFieldRemovalReplacementProcess = (
  state: GameState,
  events: EngineEvent[],
  effectId: string,
  process: ReplacementProcess,
): { state: GameState; paused?: true } | { error: EngineError } => {
  const currentProcess = normalizeFieldRemovalProcess(state, process);
  const detected = detectSupportedFieldRemovalReplacementCandidate(
    state,
    currentProcess,
  );
  if (!detected.ok) {
    return { error: detected.error };
  }
  const candidates =
    detected.candidates ??
    (detected.candidate === undefined ? [] : [detected.candidate]);
  if (candidates.length === 0) {
    return executeUnreplacedSelectedTargetFieldRemovalProcess(
      state,
      events,
      effectId,
      currentProcess,
    );
  }

  return pauseFieldRemovalReplacementProcess(
    state,
    events,
    currentProcess,
    candidates,
  );
};
