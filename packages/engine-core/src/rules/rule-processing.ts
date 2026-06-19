import type { EngineEvent, GameState, PlayerId } from "@optcg/types";

type EventFactory = (
  seqOffset: number,
  type: EngineEvent["type"],
  payload: unknown,
  visibility?: EngineEvent["visibility"],
) => EngineEvent;

interface RuleProcessingInput {
  state: GameState;
  events: EngineEvent[];
  phase: GameState["turn"]["phase"];
  createEvent: EventFactory;
  immediateLosers?: readonly PlayerId[];
}

const isAlreadyTerminal = (state: GameState): boolean =>
  state.status.type === "completed" || state.status.type === "gameOver";

const opponentOf = (state: GameState, playerId: PlayerId): PlayerId | null => {
  const playerIds = Object.keys(state.players) as PlayerId[];
  return playerIds.find((candidate) => candidate !== playerId) ?? null;
};

const hasDelayedDeckOutLoss = (state: GameState, playerId: PlayerId): boolean =>
  state.ruleModifiers?.some(
    (modifier) =>
      modifier.type === "deckOutLossTiming" && modifier.playerId === playerId,
  ) === true;

const hasDeckOutWin = (state: GameState, playerId: PlayerId): boolean =>
  state.ruleModifiers?.some(
    (modifier) =>
      modifier.type === "deckOutWin" && modifier.playerId === playerId,
  ) === true;

const hasPendingDeckOutLoss = (
  state: GameState,
  playerId: PlayerId,
  turn: number,
): boolean =>
  state.pendingRuleLosses?.some(
    (loss) => loss.playerId === playerId && loss.turn === turn,
  ) === true;

const appendEvent = (
  events: EngineEvent[],
  createEvent: EventFactory,
  type: EngineEvent["type"],
  payload: unknown,
  visibility: EngineEvent["visibility"],
): void => {
  events.push(createEvent(events.length + 1, type, payload, visibility));
};

export const applyRuleProcessingCheckpoint = ({
  state,
  events,
  phase,
  createEvent,
  immediateLosers = [],
}: RuleProcessingInput): GameState => {
  if (isAlreadyTerminal(state)) {
    appendEvent(
      events,
      createEvent,
      "ruleProcessingChecked",
      { phase, result: "alreadyTerminal" },
      { type: "replayOnly" },
    );
    return state;
  }

  const winners = new Set<PlayerId>();
  const losers = new Set<PlayerId>(immediateLosers);
  const nextPendingRuleLosses = [...(state.pendingRuleLosses ?? [])];
  for (const [playerId, player] of Object.entries(state.players) as [
    PlayerId,
    GameState["players"][PlayerId],
  ][]) {
    if (player.deck.length !== 0) {
      continue;
    }
    if (hasDeckOutWin(state, playerId)) {
      winners.add(playerId);
      continue;
    }
    if (!hasDelayedDeckOutLoss(state, playerId)) {
      losers.add(playerId);
      continue;
    }
    if (phase === "end") {
      losers.add(playerId);
      continue;
    }
    if (!hasPendingDeckOutLoss(state, playerId, state.turn.globalTurn)) {
      nextPendingRuleLosses.push({
        type: "deckOut",
        playerId,
        turn: state.turn.globalTurn,
      });
    }
  }
  if (phase === "end") {
    for (const loss of nextPendingRuleLosses) {
      if (loss.turn === state.turn.globalTurn) {
        losers.add(loss.playerId);
      }
    }
  }

  if (winners.size === 0 && losers.size === 0) {
    const nextState =
      nextPendingRuleLosses.length === (state.pendingRuleLosses?.length ?? 0)
        ? state
        : { ...state, pendingRuleLosses: nextPendingRuleLosses };
    appendEvent(
      events,
      createEvent,
      "ruleProcessingChecked",
      { phase, result: "ok" },
      { type: "replayOnly" },
    );
    return nextState;
  }

  const winnerList = [...winners].sort();
  if (winnerList.length > 0) {
    const soleWinner = winnerList[0];
    const winner =
      winnerList.length === 1 && soleWinner !== undefined ? soleWinner : "draw";
    const nextState: GameState = {
      ...state,
      status: { type: "completed", winner },
    };
    appendEvent(
      events,
      createEvent,
      "ruleProcessingChecked",
      { phase, result: "gameEnded", winners: winnerList, winner },
      { type: "replayOnly" },
    );
    appendEvent(
      events,
      createEvent,
      "gameEnded",
      { reason: "ruleProcessing", winners: winnerList, winner },
      { type: "public" },
    );
    return nextState;
  }

  const loserList = [...losers].sort();
  const primaryLoser = loserList[0];
  const winner =
    loserList.length > 1
      ? "draw"
      : primaryLoser === undefined
        ? "draw"
        : (opponentOf(state, primaryLoser) ?? "draw");
  const nextState: GameState = {
    ...state,
    status: { type: "completed", winner },
  };
  appendEvent(
    events,
    createEvent,
    "ruleProcessingChecked",
    { phase, result: "gameEnded", losers: loserList, winner },
    { type: "replayOnly" },
  );
  appendEvent(
    events,
    createEvent,
    "gameEnded",
    { reason: "ruleProcessing", losers: loserList, winner },
    { type: "public" },
  );
  return nextState;
};
