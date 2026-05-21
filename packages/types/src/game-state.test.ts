import { expect, test } from "vitest";

import type * as Types from "./index.js";
import type {
  AtomicMutation,
  CardId,
  CardInstance,
  CardRef,
  CustomHandler,
  DecisionId,
  EffectId,
  EngineError,
  EngineEvent,
  EngineEventId,
  EngineResult,
  EngineStepResult,
  GameState,
  MatchId,
  MulliganDecision,
  PlayerId,
  PlayerState,
  PlayerView,
  SpectatorView,
  SetupContinuationState,
  StateHashInput,
  StateSeq,
} from "./index.js";

test("TYP-001G canonical game state and engine/result contracts compile", () => {
  const playerA = "player-a" as PlayerId;
  const playerB = "player-b" as PlayerId;
  const seq = 1 as StateSeq;
  const source: CardRef = {
    instanceId: "instance-1" as CardRef["instanceId"],
    cardId: "OP01-001" as CardId,
    playerId: playerA,
    zone: { zone: "leaderArea", playerId: playerA },
  };
  const event: EngineEvent = {
    id: "event-1" as EngineEventId,
    seq: 1,
    type: "phaseStarted",
    payload: {},
    visibility: { type: "public" },
    createdAtStateSeq: seq,
  };
  const playerState: PlayerState = {
    playerId: playerA,
    deck: [],
    donDeck: [],
    hand: [],
    trash: [],
    leader: {
      instanceId: "leader-1" as CardRef["instanceId"],
      cardId: "OP01-001" as CardId,
      owner: playerA,
      controller: playerA,
      zone: { zone: "leaderArea", playerId: playerA },
      attachedDon: [],
    },
    characters: [],
    costArea: [],
    life: [],
    hasMulliganed: false,
    turnCount: 1,
  };
  const pendingDecision: MulliganDecision = {
    id: "decision-1" as DecisionId,
    type: "mulligan",
    playerId: playerA,
    prompt: "Mulligan?",
    causedBy: { type: "playerAction", actionId: "action-1" },
    visibility: { type: "private", playerId: playerA },
    options: ["keep", "mulligan"],
  };
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
    seq,
    actionSeq: 1,
    turn: {
      globalTurn: 1,
      playerTurnCounts: { [playerA]: 1, [playerB]: 0 },
      turnPlayerId: playerA,
      phase: "main",
    },
    cardManifest: {
      manifestHash: "manifest-hash-1",
      source: "manual-test",
      cardDataVersion: "cards-v1",
      effectDefinitionsVersion: "effects-v1",
      customHandlerVersion: "handlers-v1",
      banlistVersion: "banlist-v1",
      createdAt: "2026-05-04T00:00:00.000Z",
      cards: {},
    },
    players: {
      [playerA]: playerState,
      [playerB]: { ...playerState, playerId: playerB },
    },
    timers: {
      players: {
        [playerA]: { playerId: playerA, remainingMs: 120_000, isRunning: true },
        [playerB]: {
          playerId: playerB,
          remainingMs: 120_000,
          isRunning: false,
        },
      },
    },
    pendingDecision,
    oncePerTurn: [],
    effectQueue: [],
    effectExecutionFrames: [],
    deferredTriggers: [],
    continuousEffects: [],
    replacementState: [],
    revealedCards: [],
    rng: {
      algorithm: "test-fixed",
      internalState: "rng-state",
      callCount: 0,
    },
    eventJournal: [event],
    audit: [
      { type: "test", createdAt: "2026-05-03T00:00:00.000Z", payload: {} },
    ],
  };
  const stepResult: EngineStepResult = { state, events: [event] };
  const engineError: EngineError = {
    type: "unsupportedCard",
    cardId: source.cardId,
    status: "unsupported",
  };
  const engineResult: EngineResult = {
    state,
    events: [event],
    decisions: [pendingDecision],
    errors: [engineError],
    stateHash: "hash-1",
  };
  const hashInput: StateHashInput = {
    state,
    includeHidden: true,
    normalizeTransientIds: true,
  };
  const mutation: AtomicMutation = (nextState) => ({
    state: nextState,
    events: [],
  });
  const handler: CustomHandler = {
    id: "handler-1",
    cardId: source.cardId,
    effectId: "effect-1",
    execute: (handlerState) => ({
      state: handlerState,
      events: [],
      stateHash: "hash-2",
    }),
  };

  expect(stepResult.events).toHaveLength(1);
  expect(engineResult.stateHash).toBe("hash-1");
  expect(hashInput.includeHidden).toBe(true);
  expect(mutation(state).state.matchId).toBe(state.matchId);
  expect(
    handler.execute(state, {
      source,
      controllerId: playerA,
      causedBy: { type: "playerAction", actionId: "action-2" },
      execution: {
        effectId: "effect-1" as EffectId,
        source,
        transientSets: {},
        selections: {},
      },
    }).stateHash,
  ).toBe("hash-2");
});

test("TYP-001G rejects stale EngineResult and out-of-scope exports/behavior", () => {
  const player = "player-a" as PlayerId;
  const seq = 1 as StateSeq;
  const event: EngineEvent = {
    id: "event-1" as EngineEventId,
    seq: 1,
    type: "phaseStarted",
    payload: {},
    visibility: { type: "public" },
    createdAtStateSeq: seq,
  };
  const leader: CardInstance = {
    instanceId: "leader-1" as CardRef["instanceId"],
    cardId: "OP01-001" as CardId,
    owner: player,
    controller: player,
    zone: { zone: "leaderArea", playerId: player },
    attachedDon: [],
  };
  const playerState: PlayerState = {
    playerId: player,
    deck: [],
    donDeck: [],
    hand: [],
    trash: [],
    leader,
    characters: [],
    costArea: [],
    life: [],
    hasMulliganed: false,
    turnCount: 1,
  };
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
    seq,
    actionSeq: 1,
    turn: {
      globalTurn: 1,
      playerTurnCounts: { [player]: 1 },
      turnPlayerId: player,
      phase: "main",
    },
    cardManifest: {
      manifestHash: "manifest-hash-1",
      source: "manual-test",
      cardDataVersion: "cards-v1",
      effectDefinitionsVersion: "effects-v1",
      customHandlerVersion: "handlers-v1",
      banlistVersion: "banlist-v1",
      createdAt: "2026-05-04T00:00:00.000Z",
      cards: {},
    },
    players: { [player]: playerState },
    timers: {
      players: {
        [player]: { playerId: player, remainingMs: 120_000, isRunning: true },
      },
    },
    oncePerTurn: [],
    effectQueue: [],
    effectExecutionFrames: [],
    deferredTriggers: [],
    continuousEffects: [],
    replacementState: [],
    revealedCards: [],
    rng: {
      algorithm: "test-fixed",
      internalState: "rng-state",
      callCount: 0,
    },
    eventJournal: [event],
    audit: [],
  };
  const staleEngineResult: EngineResult = {
    state,
    events: [event],
    stateHash: "hash-1",
    // @ts-expect-error canonical EngineResult must not include stale publicEvents.
    publicEvents: [],
  };
  // @ts-expect-error stale draft event contract must not be exported.
  type PublicEffectEventMissing = Types.PublicEffectEvent;
  // @ts-expect-error public action window DTO must not be exported.
  type PublicActionWindowMissing = Types.PublicActionWindow;
  // @ts-expect-error filtering DTO must not be exported.
  type FilteredGameStateMissing = Types.FilteredGameState;
  // @ts-expect-error replay DTO must not be exported.
  type ReplayEventMissing = Types.ReplayEvent;
  // @ts-expect-error hashing behavior function is out of scope.
  type HashStateMissing = Types.hashState;
  // @ts-expect-error mutation behavior function is out of scope.
  type ApplyMutationMissing = Types.applyAtomicMutation;
  // @ts-expect-error replay reconstruction behavior is out of scope.
  type ReconstructReplayStateMissing = Types.reconstructReplayState;
  // @ts-expect-error filtering behavior is out of scope.
  type BuildPublicViewMissing = Types.buildPublicView;
  // @ts-expect-error custom handler execution helper behavior is out of scope.
  type ExecuteCustomHandlerMissing = Types.executeCustomHandler;

  const missingType = <T>(value: T | null): T | null => value;

  void staleEngineResult;
  expect(missingType<PublicEffectEventMissing>(null)).toBeNull();
  expect(missingType<PublicActionWindowMissing>(null)).toBeNull();
  expect(missingType<FilteredGameStateMissing>(null)).toBeNull();
  expect(missingType<ReplayEventMissing>(null)).toBeNull();
  expect(missingType<HashStateMissing>(null)).toBeNull();
  expect(missingType<ApplyMutationMissing>(null)).toBeNull();
  expect(missingType<ReconstructReplayStateMissing>(null)).toBeNull();
  expect(missingType<BuildPublicViewMissing>(null)).toBeNull();
  expect(missingType<ExecuteCustomHandlerMissing>(null)).toBeNull();
});

test("SUP-003I game state accepts optional setup continuation and keeps view contracts private", () => {
  const playerA = "player-a" as PlayerId;
  const playerB = "player-b" as PlayerId;
  const seq = 1 as StateSeq;
  const event: EngineEvent = {
    id: "event-1" as EngineEventId,
    seq: 1,
    type: "phaseStarted",
    payload: {},
    visibility: { type: "public" },
    createdAtStateSeq: seq,
  };
  const leader: CardInstance = {
    instanceId: "leader-1" as CardRef["instanceId"],
    cardId: "OP01-001" as CardId,
    owner: playerA,
    controller: playerA,
    zone: { zone: "leaderArea", playerId: playerA },
    attachedDon: [],
  };
  const playerState: PlayerState = {
    playerId: playerA,
    deck: [],
    donDeck: [],
    hand: [],
    trash: [],
    leader,
    characters: [],
    costArea: [],
    life: [],
    hasMulliganed: false,
    turnCount: 1,
  };
  const state: GameState = {
    matchId: "match-1" as MatchId,
    status: { type: "setup" },
    version: {
      specVersion: "v6",
      rulesVersion: "rules-v1",
      engineVersion: "engine-v1",
      cardDataVersion: "cards-v1",
      effectDefinitionsVersion: "effects-v1",
      customHandlerVersion: "handlers-v1",
      banlistVersion: "banlist-v1",
    },
    seq,
    actionSeq: 1,
    turn: {
      globalTurn: 1,
      playerTurnCounts: { [playerA]: 0, [playerB]: 0 },
      turnPlayerId: playerA,
      phase: "main",
    },
    cardManifest: {
      manifestHash: "manifest-hash-1",
      source: "manual-test",
      cardDataVersion: "cards-v1",
      effectDefinitionsVersion: "effects-v1",
      customHandlerVersion: "handlers-v1",
      banlistVersion: "banlist-v1",
      createdAt: "2026-05-21T00:00:00.000Z",
      cards: {},
    },
    players: {
      [playerA]: playerState,
      [playerB]: { ...playerState, playerId: playerB },
    },
    timers: {
      players: {
        [playerA]: { playerId: playerA, remainingMs: 120_000, isRunning: true },
        [playerB]: {
          playerId: playerB,
          remainingMs: 120_000,
          isRunning: false,
        },
      },
    },
    setupContinuation: {
      playerOrder: [playerA, playerB],
      firstPlayerId: playerA,
      leaderLifeCounts: {
        [playerA]: 5,
        [playerB]: 5,
      },
      shuffleDecks: true,
      nextStartOfGamePlanIndex: 1,
    },
    oncePerTurn: [],
    effectQueue: [],
    effectExecutionFrames: [],
    deferredTriggers: [],
    continuousEffects: [],
    replacementState: [],
    revealedCards: [],
    rng: {
      algorithm: "test-fixed",
      internalState: "rng-state",
      callCount: 0,
    },
    eventJournal: [event],
    audit: [],
  };

  const stateWithoutSetup = { ...state };
  delete stateWithoutSetup.setupContinuation;
  const noSetupContinuationNeeded: GameState = stateWithoutSetup;

  const missingPlayerOrder = {
    firstPlayerId: playerA,
    leaderLifeCounts: { [playerA]: 5, [playerB]: 5 },
    shuffleDecks: true,
    nextStartOfGamePlanIndex: 0,
  };
  // @ts-expect-error setup continuation requires playerOrder tuple.
  state.setupContinuation = missingPlayerOrder;
  state.setupContinuation = {
    ...state.setupContinuation,
    // @ts-expect-error playerOrder must be a two-player tuple.
    playerOrder: [playerA],
  };
  const missingLeaderLifeCounts: SetupContinuationState = {
    playerOrder: [playerA, playerB],
    firstPlayerId: playerA,
    // @ts-expect-error leaderLifeCounts is required.
    leaderLifeCounts: undefined,
    shuffleDecks: true,
    nextStartOfGamePlanIndex: 0,
  };
  const nonBooleanShuffleMode: SetupContinuationState = {
    playerOrder: [playerA, playerB],
    firstPlayerId: playerA,
    leaderLifeCounts: { [playerA]: 5, [playerB]: 5 },
    // @ts-expect-error shuffleDecks must be boolean.
    shuffleDecks: "yes",
    nextStartOfGamePlanIndex: 0,
  };
  const nonNumberPlanIndex: SetupContinuationState = {
    playerOrder: [playerA, playerB],
    firstPlayerId: playerA,
    leaderLifeCounts: { [playerA]: 5, [playerB]: 5 },
    shuffleDecks: true,
    // @ts-expect-error nextStartOfGamePlanIndex must be a number.
    nextStartOfGamePlanIndex: "1",
  };

  // @ts-expect-error PlayerView must not expose setup continuation internals.
  type PlayerViewLeak = PlayerView["setupContinuation"];
  // @ts-expect-error SpectatorView must not expose setup continuation internals.
  type SpectatorViewLeak = SpectatorView["setupContinuation"];
  void (null as unknown as PlayerViewLeak);
  void (null as unknown as SpectatorViewLeak);
  void missingLeaderLifeCounts;
  void nonBooleanShuffleMode;
  void nonNumberPlanIndex;
  expect(noSetupContinuationNeeded.setupContinuation).toBeUndefined();
});
