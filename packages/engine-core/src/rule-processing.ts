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

  const losers = new Set<PlayerId>(immediateLosers);
  for (const [playerId, player] of Object.entries(state.players) as [
    PlayerId,
    GameState["players"][PlayerId],
  ][]) {
    if (player.deck.length === 0) {
      losers.add(playerId);
    }
  }

  if (losers.size === 0) {
    appendEvent(
      events,
      createEvent,
      "ruleProcessingChecked",
      { phase, result: "ok" },
      { type: "replayOnly" },
    );
    return state;
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
