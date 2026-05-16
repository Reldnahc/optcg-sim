import { expect, test } from "vitest";

import type {
  CardId,
  CardRef,
  EngineEvent,
  EngineEventId,
  InstanceId,
  MatchId,
  OpponentVisibleState,
  PlayerId,
  PlayerView,
  PublicBattleState,
  PublicCardView,
  PublicDecision,
  PublicLegalAction,
  PublicLifeView,
  PublicPendingDecision,
  PublicRevealRecord,
  PublicTurnState,
  SpectatorEvent,
  SpectatorPolicy,
  SpectatorRevealRecord,
  SpectatorView,
  SpectatorVisiblePlayerState,
  StateSeq,
  VisiblePlayerState,
} from "./index.js";

type HasNoKey<T, K extends PropertyKey> = K extends keyof T ? never : true;

const cardRef = (suffix: string, playerId: PlayerId): CardRef => ({
  instanceId: `instance-${suffix}` as InstanceId,
  cardId: `OP01-${suffix}` as CardId,
  playerId,
  zone: { zone: "characterArea", playerId },
});

test("TYP-002A canonical player and spectator view DTO contracts compile", () => {
  const playerA = "player-a" as PlayerId;
  const playerB = "player-b" as PlayerId;
  const seq = 1 as StateSeq;
  const policy: SpectatorPolicy = {
    mode: "live-filtered",
    allowHandRevealAfterGame: false,
  };
  const publicCard: PublicCardView = {
    instanceId: "instance-1" as InstanceId,
    cardId: "OP01-001" as CardId,
    owner: playerA,
    controller: playerA,
    zone: { zone: "leaderArea", playerId: playerA },
    state: "active",
    attachedDonCount: 0,
  };
  const life: PublicLifeView = { count: 5, faceUpCards: [] };
  const turn: PublicTurnState = {
    globalTurn: 1,
    playerTurnCounts: { [playerA]: 1, [playerB]: 0 },
    turnPlayerId: playerA,
    phase: "main",
  };
  const battle: PublicBattleState = {
    attacker: cardRef("002", playerA),
    originalTarget: cardRef("003", playerB),
    currentTarget: cardRef("003", playerB),
    step: "block",
    damageCount: 1,
  };
  const self: VisiblePlayerState = {
    playerId: playerA,
    deckCount: 48,
    donDeckCount: 10,
    hand: [publicCard],
    trash: [],
    leader: publicCard,
    characters: [],
    costArea: [],
    life,
    hasMulliganed: false,
    turnCount: 1,
  };
  const opponent: OpponentVisibleState = {
    playerId: playerB,
    deckCount: 48,
    donDeckCount: 10,
    handCount: 5,
    trash: [],
    leader: { ...publicCard, owner: playerB, controller: playerB },
    characters: [],
    costArea: [],
    life,
    hasMulliganed: false,
    turnCount: 0,
  };
  const spectatorPlayer: SpectatorVisiblePlayerState = {
    ...opponent,
    playerId: playerA,
  };
  const decision: PublicPendingDecision = {
    id: "decision-1" as PublicDecision["id"],
    type: "chooseQuantity",
    playerId: playerA,
    prompt: "Choose how many cards to draw.",
    causedBy: { type: "playerAction", actionId: "action-1" },
    mode: "upTo",
    min: 0,
    max: 2,
  };
  const legalAction: PublicLegalAction = {
    type: "respondToDecision",
    decisionId: decision.id,
  };
  const reveal: PublicRevealRecord = {
    id: "reveal-1",
    cards: [cardRef("004", playerA)],
    visibility: "public",
    origin: { zone: "deck", playerId: playerA },
    createdAtStateSeq: seq,
    cleanupPolicy: "returnToOrigin",
  };
  const event: EngineEvent = {
    id: "event-1" as EngineEventId,
    seq: 1,
    type: "phaseStarted",
    payload: {},
    visibility: { type: "public" },
    createdAtStateSeq: seq,
  };
  const playerView: PlayerView = {
    matchId: "match-1" as MatchId,
    playerId: playerA,
    stateSeq: seq,
    actionSeq: 1,
    turn,
    self,
    opponent,
    battle,
    pendingDecision: decision,
    legalActions: [legalAction],
    revealedCards: [reveal],
    events: [event],
    timers: {
      activePlayerId: playerA,
      players: {
        [playerA]: { remainingMs: 120_000, isRunning: true },
        [playerB]: { remainingMs: 120_000, isRunning: false },
      },
    },
  };
  const spectatorView: SpectatorView = {
    matchId: playerView.matchId,
    stateSeq: seq,
    actionSeq: 1,
    spectatorPolicy: policy,
    turn,
    players: {
      [playerA]: spectatorPlayer,
      [playerB]: { ...spectatorPlayer, playerId: playerB },
    },
    battle,
    revealedCards: [
      {
        ...reveal,
        visibility: "public",
      } satisfies SpectatorRevealRecord,
    ],
    events: [
      {
        ...event,
        visibility: { type: "public" },
      } satisfies SpectatorEvent,
    ],
    timers: playerView.timers,
  };

  expect(playerView.legalActions).toHaveLength(1);
  expect(playerView.pendingDecision?.type).toBe("chooseQuantity");
  if (playerView.pendingDecision?.type !== "chooseQuantity") {
    throw new Error("expected chooseQuantity public decision");
  }
  expect(playerView.pendingDecision.max).toBe(2);
  expect(playerView.pendingDecision.mode).toBe("upTo");
  expect(spectatorView.spectatorPolicy.mode).toBe("live-filtered");
});

test("TYP-002A player view excludes opponent hidden identities and private internals", () => {
  const noOpponentHandCards: HasNoKey<OpponentVisibleState, "hand"> = true;
  const noOpponentDeckCards: HasNoKey<OpponentVisibleState, "deck"> = true;
  const noOpponentDonDeckCards: HasNoKey<OpponentVisibleState, "donDeck"> =
    true;
  const noRng: HasNoKey<PlayerView, "rng"> = true;
  const noEffectQueue: HasNoKey<PlayerView, "effectQueue"> = true;
  const noEffectExecutionFrames: HasNoKey<PlayerView, "effectExecutionFrames"> =
    true;
  const noAudit: HasNoKey<PlayerView, "audit"> = true;
  const noPrivateDecisionCandidates: HasNoKey<PublicDecision, "candidates"> =
    true;
  const noPrivateDecisionCandidateCount: HasNoKey<
    PublicDecision,
    "candidateCount"
  > = true;
  const noPrivateLegalReason: HasNoKey<PublicLegalAction, "reason"> = true;
  const noQuantityValueInLegalAction: HasNoKey<PublicLegalAction, "quantity"> =
    true;

  expect(noOpponentHandCards).toBe(true);
  expect(noOpponentDeckCards).toBe(true);
  expect(noOpponentDonDeckCards).toBe(true);
  expect(noRng).toBe(true);
  expect(noEffectQueue).toBe(true);
  expect(noEffectExecutionFrames).toBe(true);
  expect(noAudit).toBe(true);
  expect(noPrivateDecisionCandidates).toBe(true);
  expect(noPrivateDecisionCandidateCount).toBe(true);
  expect(noPrivateLegalReason).toBe(true);
  expect(noQuantityValueInLegalAction).toBe(true);
});

test("TYP-002A initial spectator view excludes hidden identities and player-only choices", () => {
  const noSpectatorHandCards: HasNoKey<SpectatorVisiblePlayerState, "hand"> =
    true;
  const noSpectatorDeckCards: HasNoKey<SpectatorVisiblePlayerState, "deck"> =
    true;
  const noSpectatorDonDeckCards: HasNoKey<
    SpectatorVisiblePlayerState,
    "donDeck"
  > = true;
  const noPendingDecision: HasNoKey<SpectatorView, "pendingDecision"> = true;
  const noLegalActions: HasNoKey<SpectatorView, "legalActions"> = true;
  const noRng: HasNoKey<SpectatorView, "rng"> = true;
  const noEffectQueue: HasNoKey<SpectatorView, "effectQueue"> = true;
  const noEffectExecutionFrames: HasNoKey<
    SpectatorView,
    "effectExecutionFrames"
  > = true;
  const noAudit: HasNoKey<SpectatorView, "audit"> = true;
  const player = "player-a" as PlayerId;
  const seq = 1 as StateSeq;
  const spectatorReveal: SpectatorRevealRecord = {
    id: "reveal-1",
    cards: [cardRef("005", player)],
    visibility: "public",
    origin: { zone: "deck", playerId: player },
    createdAtStateSeq: seq,
    cleanupPolicy: "returnToOrigin",
  };
  const spectatorEvent: SpectatorEvent = {
    id: "event-1" as EngineEventId,
    seq: 1,
    type: "phaseStarted",
    payload: {},
    visibility: { type: "public" },
    createdAtStateSeq: seq,
  };
  const privateSpectatorReveal: SpectatorRevealRecord = {
    ...spectatorReveal,
    // @ts-expect-error spectator reveal records must be public-only.
    visibility: "privateToRecipient",
  };
  const privateSpectatorEvent: SpectatorEvent = {
    ...spectatorEvent,
    // @ts-expect-error spectator events must be public-only.
    visibility: { type: "private", playerId: player },
  };

  expect(noSpectatorHandCards).toBe(true);
  expect(noSpectatorDeckCards).toBe(true);
  expect(noSpectatorDonDeckCards).toBe(true);
  expect(noPendingDecision).toBe(true);
  expect(noLegalActions).toBe(true);
  expect(noRng).toBe(true);
  expect(noEffectQueue).toBe(true);
  expect(noEffectExecutionFrames).toBe(true);
  expect(noAudit).toBe(true);
  void privateSpectatorReveal;
  void privateSpectatorEvent;
});
