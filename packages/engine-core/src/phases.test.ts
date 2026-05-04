import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardId, MatchId, PlayerId } from "@optcg/types";

import { createInitialState } from "./initial-state.js";
import { assertGameStateInvariants } from "./invariants.js";
import { respondToMulliganDecision, startMulliganFlow } from "./mulligan.js";
import {
  advanceDonPhase,
  advanceDrawPhase,
  advanceEndPhase,
  advanceRefreshPhase,
  enterMainPhase,
} from "./phases.js";

const toMatchId = (value: string): MatchId => value as MatchId;
const toPlayerId = (value: string): PlayerId => value as PlayerId;
const toCardId = (value: string): CardId => value as CardId;

const p1 = toPlayerId("p1");
const p2 = toPlayerId("p2");

const must = <T>(value: T | undefined, label: string): T => {
  assert.ok(value !== undefined, `missing ${label}`);
  return value;
};

const eventPayload = (event: {
  payload: unknown;
}): { phase?: string; playerId?: PlayerId } =>
  event.payload as { phase?: string; playerId?: PlayerId };

const createInput = () => ({
  matchId: toMatchId("match-phase-1"),
  firstPlayerId: p1,
  rngSeed: "seed-phase-1",
  playerOrder: [p1, p2] as const,
  leaderCardIds: {
    [p1]: toCardId("leader-red"),
    [p2]: toCardId("leader-blue"),
  },
  leaderLifeCounts: {
    [p1]: 2,
    [p2]: 2,
  },
  deckCardIds: {
    [p1]: ["p1-a", "p1-b", "p1-c", "p1-d", "p1-e", "p1-f", "p1-g", "p1-h"].map(
      toCardId,
    ),
    [p2]: ["p2-a", "p2-b", "p2-c", "p2-d", "p2-e", "p2-f", "p2-g", "p2-h"].map(
      toCardId,
    ),
  },
  donDeckCardIds: {
    [p1]: ["p1-don-1", "p1-don-2", "p1-don-3"].map(toCardId),
    [p2]: ["p2-don-1", "p2-don-2", "p2-don-3"].map(toCardId),
  },
  shuffleDecks: false,
});

const createActiveState = () => {
  const setup = createInitialState(createInput());
  const started = startMulliganFlow(setup);
  const first = respondToMulliganDecision(started.state, {
    type: "respondToDecision",
    decisionId: must(started.state.pendingDecision, "first decision").id,
    response: { type: "mulligan", keep: true },
  });
  return respondToMulliganDecision(first.state, {
    type: "respondToDecision",
    decisionId: must(first.state.pendingDecision, "second decision").id,
    response: { type: "mulligan", keep: true },
  }).state;
};

test("first-player first-turn draw skip", () => {
  const refresh = advanceRefreshPhase(createActiveState());
  const draw = advanceDrawPhase(refresh.state);
  const player = must(draw.state.players[p1], "p1");
  assert.equal(draw.state.turn.phase, "don");
  assert.equal(player.hand.length, 5);
  assert.equal(
    draw.events.some((event) => event.type === "cardDrawn"),
    false,
  );
});

test("normal draw on non-skipped draw phase", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p2;
  state.turn.globalTurn = 2;
  state.turn.playerTurnCounts[p2] = 1;
  state.turn.phase = "draw";
  const beforeHand = must(state.players[p2], "p2").hand.length;

  const draw = advanceDrawPhase(state);
  const player = must(draw.state.players[p2], "p2");
  assert.equal(player.hand.length, beforeHand + 1);
  assert.equal(
    draw.events.some((event) => event.type === "cardDrawn"),
    true,
  );
});

test("first-player one-DON!! first turn and normal two-DON!! later turns", () => {
  const firstTurn = createActiveState();
  firstTurn.turn.phase = "don";
  const first = advanceDonPhase(firstTurn);
  assert.equal(must(first.state.players[p1], "p1").costArea.length, 1);

  const laterTurn = createActiveState();
  laterTurn.turn.phase = "don";
  laterTurn.turn.globalTurn = 3;
  const later = advanceDonPhase(laterTurn);
  assert.equal(must(later.state.players[p1], "p1").costArea.length, 2);
});

test("attached DON!! refresh return and readying", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const readyDon = must(player.donDeck[0], "don");
  player.donDeck = player.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  player.costArea.push({
    ...readyDon,
    zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
    state: "rested",
  });
  player.leader.attachedDon = [readyDon.instanceId];
  player.leader.state = "rested";
  state.turn.phase = "refresh";

  const refresh = advanceRefreshPhase(state);
  const nextPlayer = must(refresh.state.players[p1], "p1 after");
  assert.deepEqual(nextPlayer.leader.attachedDon, []);
  assert.equal(nextPlayer.leader.state, "active");
  assert.equal(nextPlayer.costArea[0]?.state, "active");
  assert.equal(
    refresh.events.some((event) => event.type === "donReturned"),
    true,
  );
});

test("end-phase turn handoff and sequence/hash changes", () => {
  const state = createActiveState();
  state.turn.phase = "end";
  const seqBefore = state.seq;

  const ended = advanceEndPhase(state);
  assert.equal(ended.state.turn.phase, "refresh");
  assert.equal(ended.state.turn.turnPlayerId, p2);
  assert.equal(ended.state.turn.globalTurn, 2);
  assert.equal(ended.state.turn.playerTurnCounts[p2], 1);
  assert.equal(must(ended.state.players[p2], "p2").turnCount, 1);
  assert.equal(
    ended.state.seq,
    ((seqBefore as number) + 1) as typeof state.seq,
  );
  assert.notEqual(ended.stateHash, "");
});

test("refresh phase does not emit a duplicate start after end-phase handoff", () => {
  const state = createActiveState();
  state.turn.phase = "end";

  const ended = advanceEndPhase(state);
  const refreshed = advanceRefreshPhase(ended.state);
  const refreshStarts = [...ended.events, ...refreshed.events].filter(
    (event) =>
      event.type === "phaseStarted" &&
      eventPayload(event).phase === "refresh" &&
      eventPayload(event).playerId === p2,
  );

  assert.equal(refreshStarts.length, 1);
});

test("rule-processing event is created at the accepted transition sequence", () => {
  const state = createActiveState();
  state.turn.phase = "don";

  const result = advanceDonPhase(state);
  const ruleProcessing = must(
    result.events.find((event) => event.type === "ruleProcessingChecked"),
    "rule-processing event",
  );

  assert.equal(ruleProcessing.createdAtStateSeq, result.state.seq);
});

test("invariant checks run after phase transitions", () => {
  const state = createActiveState();
  state.turn.phase = "don";
  const result = advanceDonPhase(state);

  assert.doesNotThrow(() => {
    assertGameStateInvariants(result.state);
  });
  assert.equal(
    result.events.some((event) => event.type === "ruleProcessingChecked"),
    true,
  );
});

test("refresh -> draw -> don -> main progression helper sequence", () => {
  const active = createActiveState();
  const refresh = advanceRefreshPhase(active);
  const draw = advanceDrawPhase(refresh.state);
  const don = advanceDonPhase(draw.state);
  const main = enterMainPhase(don.state);

  assert.equal(main.state.turn.phase, "main");
  assert.equal(main.errors, undefined);
});
