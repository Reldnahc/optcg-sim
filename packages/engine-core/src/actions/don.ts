import type {
  Action,
  CardInstance,
  CardRef,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
} from "@optcg/types";

import {
  createEvent,
  illegalAction,
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import { applyRuleProcessingCheckpoint } from "../rules/rule-processing.js";
import { assertGameStateInvariants } from "../state/invariants.js";
import { isMatchActive, targetMatchesCard, toCardRef } from "./state.js";

const getAttachTargets = (state: GameState, playerId: PlayerId): CardRef[] => {
  const player = state.players[playerId];
  if (player === undefined) {
    return [];
  }
  return [
    toCardRef(player.leader, playerId),
    ...player.characters.map((card) => toCardRef(card, playerId)),
  ];
};

export const getAttachDonLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  if (
    !isMatchActive(state) ||
    state.pendingDecision !== undefined ||
    state.turn.phase !== "main" ||
    state.turn.turnPlayerId !== playerId ||
    state.battle !== undefined
  ) {
    return [];
  }
  const player = state.players[playerId];
  if (player === undefined) {
    return [];
  }
  const actions: LegalAction[] = [];
  const activeDon = player.costArea.filter((card) => card.state === "active");
  const targets = getAttachTargets(state, playerId);
  for (const don of activeDon) {
    for (const target of targets) {
      actions.push({
        type: "attachDon",
        donInstanceId: don.instanceId,
        target,
      });
    }
  }
  return actions;
};

export const applyAttachDon = (
  state: GameState,
  action: Extract<Action, { type: "attachDon" }>,
): EngineResult => {
  if (!isMatchActive(state)) {
    return illegalAction(
      state,
      "attachDon is only legal while match is active.",
    );
  }
  if (state.turn.phase !== "main") {
    return illegalAction(state, "attachDon requires main phase.");
  }
  const turnPlayerId = state.turn.turnPlayerId;
  if (action.target.playerId !== turnPlayerId) {
    return illegalAction(state, "attachDon target must belong to turn player.");
  }
  const player = state.players[turnPlayerId];
  if (player === undefined) {
    return illegalAction(state, "Turn player does not exist.");
  }

  const donIndex = player.costArea.findIndex(
    (card) =>
      card.instanceId === action.donInstanceId &&
      card.state === "active" &&
      card.owner === turnPlayerId &&
      card.controller === turnPlayerId,
  );
  if (donIndex < 0) {
    return illegalAction(
      state,
      "attachDon requires an active DON!! in turn player's cost area.",
    );
  }
  const donor = player.costArea[donIndex];
  if (donor === undefined) {
    return illegalAction(state, "attachDon donor not found.");
  }

  const isLeaderTarget =
    player.leader.instanceId === action.target.instanceId &&
    targetMatchesCard(action.target, player.leader);
  const targetCharacterIndex = player.characters.findIndex(
    (character) =>
      character.instanceId === action.target.instanceId &&
      targetMatchesCard(action.target, character),
  );
  if (!isLeaderTarget && targetCharacterIndex < 0) {
    return illegalAction(
      state,
      "attachDon target must be turn player's leader or character.",
    );
  }
  const nextLeader = isLeaderTarget
    ? {
        ...player.leader,
        attachedDon: [...player.leader.attachedDon, donor.instanceId],
      }
    : player.leader;
  const nextCharacters = player.characters.map((character, index) =>
    index === targetCharacterIndex
      ? {
          ...character,
          attachedDon: [...character.attachedDon, donor.instanceId],
        }
      : character,
  );

  const updatedDon: CardInstance = { ...donor };
  delete updatedDon.state;
  const nextCostArea = player.costArea.map((card, index) =>
    index === donIndex ? updatedDon : card,
  );

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    players: {
      ...state.players,
      [turnPlayerId]: {
        ...player,
        leader: nextLeader,
        characters: nextCharacters,
        costArea: nextCostArea,
      },
    },
  };
  const events: EngineEvent[] = [
    createEvent(
      state,
      1,
      "donAttached",
      {
        playerId: turnPlayerId,
        donInstanceId: donor.instanceId,
        targetInstanceId: action.target.instanceId,
      },
      { type: "replayOnly" },
    ),
  ];
  const nextWithRules = applyRuleProcessingCheckpoint({
    state: nextState,
    events,
    phase: "main",
    createEvent: (seqOffset, type, payload, visibility) =>
      createEvent(state, seqOffset, type, payload, visibility),
  });
  nextWithRules.eventJournal = [...state.eventJournal, ...events];
  assertGameStateInvariants(nextWithRules);
  return toEngineResult(nextWithRules, events);
};
