import { expect, test } from "vitest";

import type {
  CardId,
  EngineResult,
  EngineStepResult,
  GameState,
  InstanceId,
  MatchId,
  PlayerId,
  StateSeq,
} from "./index.js";

test("game-state concern contracts compile", () => {
  const player = "player-1" as PlayerId;
  const state: GameState = {
    matchId: "match-1" as MatchId,
    status: { type: "active" },
    version: {
      specVersion: "v6",
      rulesVersion: "rules-v1",
      engineVersion: "engine-v1",
      cardDataVersion: "cards-v1",
      effectDefinitionsVersion: "effects-v1",
      customHandlerVersion: "handlers-v1",
      banlistVersion: "banlist-v1",
    },
    seq: 1 as StateSeq,
    actionSeq: 1,
    turn: {
      globalTurn: 1,
      playerTurnCounts: { [player]: 1 },
      turnPlayerId: player,
      phase: "main",
    },
    players: {
      [player]: {
        playerId: player,
        deck: [],
        donDeck: [],
        hand: [],
        trash: [],
        leader: {
          instanceId: "leader-1" as InstanceId,
          cardId: "OP01-001" as CardId,
          owner: player,
          controller: player,
          zone: { zone: "leaderArea", playerId: player },
          attachedDon: [],
        },
        characters: [],
        costArea: [],
        life: [],
        hasMulliganed: false,
        turnCount: 1,
      },
    },
    timers: {
      players: {
        [player]: { playerId: player, remainingMs: 1, isRunning: false },
      },
    },
    oncePerTurn: [],
    effectQueue: [],
    deferredTriggers: [],
    continuousEffects: [],
    replacementState: [],
    revealedCards: [],
    rng: { algorithm: "test-fixed", internalState: "state", callCount: 0 },
    eventJournal: [],
    audit: [],
  };
  const stepResult: EngineStepResult = { state, events: [] };
  const result: EngineResult = { state, events: [], stateHash: "hash-1" };

  expect(stepResult.state.matchId).toBe(state.matchId);
  expect(result.stateHash).toBe("hash-1");
});
