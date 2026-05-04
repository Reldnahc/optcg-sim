import type {
  Action,
  CardInstance,
  CardRef,
  EngineError,
  EngineEvent,
  EngineEventId,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
  StateSeq,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";
import { assertGameStateInvariants } from "./invariants.js";
import { advanceEndPhase } from "./phases.js";

const toStateSeq = (value: number): StateSeq => value as StateSeq;
const toEngineEventId = (value: string): EngineEventId =>
  value as EngineEventId;

const toEngineResult = (
  state: GameState,
  events: EngineEvent[],
  errors?: readonly [EngineError, ...EngineError[]],
): EngineResult => {
  const result: EngineResult = {
    state,
    events,
    stateHash: hashCanonicalStateValue(state),
  };
  if (state.pendingDecision !== undefined) {
    result.decisions = [state.pendingDecision];
  }
  if (errors !== undefined) {
    result.errors = [...errors];
  }
  return result;
};

const illegalAction = (state: GameState, reason: string): EngineResult =>
  toEngineResult(state, [], [{ type: "illegalAction", reason }]);

const createEvent = (
  state: GameState,
  seqOffset: number,
  type: EngineEvent["type"],
  payload: unknown,
  visibility: EngineEvent["visibility"] = { type: "public" },
): EngineEvent => ({
  id: toEngineEventId(
    `event:${String(state.seq)}:${String(seqOffset)}:${type}`,
  ),
  seq: state.eventJournal.length + seqOffset,
  type,
  payload,
  visibility,
  causedBy: { type: "ruleProcess", name: "turnFlow" },
  createdAtStateSeq: toStateSeq(state.seq + 1),
});

const appendRuleProcessingChecked = (
  state: GameState,
  events: EngineEvent[],
  phase: GameState["turn"]["phase"],
): void => {
  events.push(
    createEvent(
      state,
      events.length + 1,
      "ruleProcessingChecked",
      { phase, result: "ok" },
      { type: "replayOnly" },
    ),
  );
};

const rebaseEvents = (
  state: GameState,
  events: EngineEvent[],
  seqOffset: number,
): EngineEvent[] =>
  events.map((event, index) => ({
    ...event,
    id: toEngineEventId(
      `event:${String(state.seq)}:${String(seqOffset + index)}:${event.type}`,
    ),
    seq: state.eventJournal.length + seqOffset + index,
    createdAtStateSeq: toStateSeq(state.seq + 1),
  }));

const getOpponentId = (
  state: GameState,
  playerId: PlayerId,
): PlayerId | null => {
  const playerIds = Object.keys(state.players) as PlayerId[];
  return playerIds.find((candidate) => candidate !== playerId) ?? null;
};

const toCardRef = (card: CardInstance, playerId: PlayerId): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

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

const isMatchActive = (state: GameState): boolean =>
  state.status.type === "active";

const canConcede = (state: GameState): boolean =>
  state.status.type !== "completed" && state.status.type !== "gameOver";

const zonesEqual = (
  left: NonNullable<CardRef["zone"]>,
  right: CardRef["zone"],
): boolean =>
  right !== undefined &&
  left.zone === right.zone &&
  left.playerId === right.playerId &&
  left.index === right.index &&
  left.slot === right.slot;

const targetMatchesCard = (target: CardRef, card: CardInstance): boolean =>
  target.cardId === card.cardId &&
  (target.zone === undefined || zonesEqual(target.zone, card.zone));

export const getLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  if (!isMatchActive(state) || state.players[playerId] === undefined) {
    return [];
  }

  const actions: LegalAction[] = [{ type: "concede", playerId }];
  if (state.pendingDecision !== undefined) {
    return actions;
  }
  if (state.turn.phase !== "main" || state.turn.turnPlayerId !== playerId) {
    return actions;
  }

  actions.push({ type: "endMainPhase" });
  const player = state.players[playerId];
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

const applyConcede = (
  state: GameState,
  action: Extract<Action, { type: "concede" }>,
): EngineResult => {
  if (!canConcede(state)) {
    return illegalAction(
      state,
      "Concede is only legal before match completion.",
    );
  }
  if (state.players[action.playerId] === undefined) {
    return illegalAction(state, "Conceding player does not exist.");
  }
  const opponentId = getOpponentId(state, action.playerId);
  if (opponentId === null) {
    return illegalAction(state, "Concede requires exactly two players.");
  }

  const events: EngineEvent[] = [
    createEvent(
      state,
      1,
      "gameEnded",
      { winner: opponentId, loser: action.playerId, reason: "concede" },
      { type: "public" },
    ),
  ];
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    status: { type: "completed", winner: opponentId },
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};

const applyEndMainPhase = (state: GameState): EngineResult => {
  if (!isMatchActive(state)) {
    return illegalAction(
      state,
      "endMainPhase is only legal while match is active.",
    );
  }
  if (state.turn.phase !== "main") {
    return illegalAction(state, "endMainPhase requires main phase.");
  }

  const transitionEvents: EngineEvent[] = [
    createEvent(state, 1, "phaseEnded", {
      phase: "main",
      playerId: state.turn.turnPlayerId,
    }),
    createEvent(state, 2, "phaseStarted", {
      phase: "end",
      playerId: state.turn.turnPlayerId,
    }),
  ];
  appendRuleProcessingChecked(state, transitionEvents, "end");

  const preEndState: GameState = {
    ...state,
    actionSeq: state.actionSeq + 1,
    turn: { ...state.turn, phase: "end" },
  };
  assertGameStateInvariants(preEndState);

  const endResult = advanceEndPhase(preEndState);
  if (endResult.errors !== undefined) {
    return endResult;
  }
  const events = [
    ...transitionEvents,
    ...rebaseEvents(state, endResult.events, transitionEvents.length + 1),
  ];
  const nextState: GameState = {
    ...endResult.state,
    eventJournal: [...state.eventJournal, ...events],
  };
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};

const applyAttachDon = (
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
  appendRuleProcessingChecked(state, events, "main");
  nextState.eventJournal = [...state.eventJournal, ...events];
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};

export const applyAction = (state: GameState, action: Action): EngineResult => {
  if (action.type === "concede") {
    return applyConcede(state, action);
  }
  if (state.pendingDecision !== undefined) {
    return illegalAction(
      state,
      "Phase actions are illegal while a decision is pending.",
    );
  }
  if (action.type === "endMainPhase") {
    return applyEndMainPhase(state);
  }
  if (action.type === "attachDon") {
    return applyAttachDon(state, action);
  }
  return illegalAction(state, `Unsupported action type: ${action.type}`);
};
