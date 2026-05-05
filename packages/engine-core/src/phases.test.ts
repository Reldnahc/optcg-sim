import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  EngineEvent,
  EngineResult,
  MatchId,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import { getLegalActions } from "./actions.js";
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

const resolvedVanillaCard = (
  cardId: CardId,
  category: "leader" | "character" | "stage",
): ResolvedCard => ({
  cardId,
  language: "en",
  name: String(cardId),
  category,
  set: "TEST",
  setName: "Test Set",
  released: true,
  colors: ["red"],
  attributes: [],
  types: [],
  printedKeywords: [],
  variants: [],
  legality: {},
  officialFaq: [],
  errata: [],
  sourceTextHash: "source-hash",
  behaviorHash: "behavior-hash",
  support: {
    cardId,
    status: "vanilla-confirmed",
    tested: true,
    rulesVersion: "r1",
    cardDataVersion: "fixture",
    sourceTextHash: "source-hash",
    behaviorHash: "behavior-hash",
  },
});

const seedKnownTriggerFreeBoardManifest = (
  state: ReturnType<typeof createActiveState>,
): void => {
  const cards: Record<CardId, ResolvedCard> = {};
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  cards[p1State.leader.cardId] = resolvedVanillaCard(
    p1State.leader.cardId,
    "leader",
  );
  cards[p2State.leader.cardId] = resolvedVanillaCard(
    p2State.leader.cardId,
    "leader",
  );
  for (const card of p1State.characters) {
    cards[card.cardId] = resolvedVanillaCard(card.cardId, "character");
  }
  for (const card of p2State.characters) {
    cards[card.cardId] = resolvedVanillaCard(card.cardId, "character");
  }
  if (p1State.stage !== undefined) {
    cards[p1State.stage.cardId] = resolvedVanillaCard(
      p1State.stage.cardId,
      "stage",
    );
  }
  if (p2State.stage !== undefined) {
    cards[p2State.stage.cardId] = resolvedVanillaCard(
      p2State.stage.cardId,
      "stage",
    );
  }
  state.cardManifest.cards = cards;
};

const assertStrictlyIncreasingEventSeq = (
  events: readonly EngineEvent[],
  label: string,
): void => {
  let previous: EngineEvent | undefined;
  for (const event of events) {
    if (previous !== undefined) {
      assert.ok(
        event.seq > previous.seq,
        `${label} seq ${String(event.seq)} must be greater than ${String(
          previous.seq,
        )}`,
      );
    }
    previous = event;
  }
};

const assertUniqueEventIds = (
  events: readonly EngineEvent[],
  label: string,
): void => {
  assert.equal(
    new Set(events.map((event) => event.id)).size,
    events.length,
    `${label} event ids must be unique`,
  );
};

const assertTransitionEventSequencing = (
  result: EngineResult,
  previousJournalLength: number,
  label: string,
): void => {
  const appendedJournalEvents = result.state.eventJournal.slice(
    previousJournalLength,
  );

  assert.deepEqual(
    appendedJournalEvents.map((event) => event.id),
    result.events.map((event) => event.id),
    `${label} events should match appended journal entries`,
  );
  assertStrictlyIncreasingEventSeq(result.events, `${label} result.events`);
  assertUniqueEventIds(result.events, `${label} result.events`);
  assertStrictlyIncreasingEventSeq(
    appendedJournalEvents,
    `${label} eventJournal`,
  );
};

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
  cardManifest: {
    manifestHash: "manifest-phases-1",
    source: "manual-test" as const,
    cardDataVersion: "fixture",
    effectDefinitionsVersion: "fixture",
    customHandlerVersion: "fixture",
    banlistVersion: "fixture",
    createdAt: "2026-05-04T00:00:00.000Z",
    cards: {},
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

test("refresh-to-draw transition emits unique ordered events", () => {
  const state = createActiveState();
  const result = advanceRefreshPhase(state);

  assert.equal(result.state.turn.phase, "draw");
  assertTransitionEventSequencing(
    result,
    state.eventJournal.length,
    "refresh-to-draw transition",
  );
});

test("draw-to-don transition emits unique ordered events", () => {
  const state = createActiveState();
  const refresh = advanceRefreshPhase(state);
  const result = advanceDrawPhase(refresh.state);

  assert.equal(result.state.turn.phase, "don");
  assertTransitionEventSequencing(
    result,
    refresh.state.eventJournal.length,
    "draw-to-don transition",
  );
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
  seedKnownTriggerFreeBoardManifest(active);
  const refresh = advanceRefreshPhase(active);
  const draw = advanceDrawPhase(refresh.state);
  const don = advanceDonPhase(draw.state);
  const main = enterMainPhase(don.state);

  assert.equal(main.state.turn.phase, "main");
  assert.equal(main.errors, undefined);
});

test("enterMainPhase accepts known trigger-free path and exposes ordinary main actions", () => {
  const state = createActiveState();
  seedKnownTriggerFreeBoardManifest(state);
  state.turn.phase = "don";

  const beforeHash = JSON.stringify(state);
  const result = enterMainPhase(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.turn.phase, "main");
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(
    result.events.some((event) => event.type === "phaseStarted"),
    true,
  );
  assert.equal(
    getLegalActions(result.state, p1).some(
      (action) => action.type === "endMainPhase",
    ),
    true,
  );
  assert.notEqual(JSON.stringify(result.state), beforeHash);
});

test("enterMainPhase rejects when effectQueue is non-empty without mutation or events", () => {
  const state = createActiveState();
  seedKnownTriggerFreeBoardManifest(state);
  state.turn.phase = "don";
  state.effectQueue = [{ id: "q1" } as never];
  const before = JSON.stringify(state);

  const result = enterMainPhase(state);

  assert.equal(result.errors?.[0]?.type, "effectRuntimeError");
  assert.equal(result.events.length, 0);
  assert.equal(result.state.turn.phase, "don");
  assert.equal(JSON.stringify(state), before);
});

test("enterMainPhase rejects when deferredTriggers is non-empty without mutation or events", () => {
  const state = createActiveState();
  seedKnownTriggerFreeBoardManifest(state);
  state.turn.phase = "don";
  state.deferredTriggers = [{ timingWindowId: "w1" } as never];
  const before = JSON.stringify(state);

  const result = enterMainPhase(state);

  assert.equal(result.errors?.[0]?.type, "effectRuntimeError");
  assert.equal(result.events.length, 0);
  assert.equal(result.state.turn.phase, "don");
  assert.equal(JSON.stringify(state), before);
});

test("enterMainPhase rejects when on-board manifest card has effectText", () => {
  const state = createActiveState();
  seedKnownTriggerFreeBoardManifest(state);
  state.turn.phase = "don";
  const leader = must(state.players[p1], "p1").leader;
  state.cardManifest.cards[leader.cardId] = {
    ...must(state.cardManifest.cards[leader.cardId], "leader manifest"),
    effectText: "[Start of Main Phase] draw 1",
  };
  const before = JSON.stringify(state);

  const result = enterMainPhase(state);
  assert.equal(result.errors?.[0]?.type, "effectRuntimeError");
  assert.equal(result.events.length, 0);
  assert.equal(JSON.stringify(state), before);
});

test("enterMainPhase rejects when on-board manifest card has triggerText", () => {
  const state = createActiveState();
  seedKnownTriggerFreeBoardManifest(state);
  state.turn.phase = "don";
  const leader = must(state.players[p1], "p1").leader;
  state.cardManifest.cards[leader.cardId] = {
    ...must(state.cardManifest.cards[leader.cardId], "leader manifest"),
    triggerText: "[Trigger] something",
  };
  const before = JSON.stringify(state);

  const result = enterMainPhase(state);
  assert.equal(result.errors?.[0]?.type, "effectRuntimeError");
  assert.equal(result.events.length, 0);
  assert.equal(JSON.stringify(state), before);
});

test("enterMainPhase rejects missing or unsupported manifest metadata", () => {
  const state = createActiveState();
  seedKnownTriggerFreeBoardManifest(state);
  state.turn.phase = "don";
  const leader = must(state.players[p1], "p1").leader;
  const leaderCardId = leader.cardId;
  const nextCards = { ...state.cardManifest.cards };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { [leaderCardId]: _removed, ...withoutLeader } = nextCards;
  state.cardManifest.cards = withoutLeader;

  const missing = enterMainPhase(state);
  assert.equal(missing.errors?.[0]?.type, "effectRuntimeError");
  assert.equal(missing.events.length, 0);
  assert.equal(missing.state.turn.phase, "don");

  seedKnownTriggerFreeBoardManifest(state);
  state.cardManifest.cards[leader.cardId] = {
    ...must(state.cardManifest.cards[leader.cardId], "leader manifest"),
    support: {
      ...must(
        state.cardManifest.cards[leader.cardId],
        "leader manifest support",
      ).support,
      status: "implemented-dsl",
    },
  };
  const nonVanilla = enterMainPhase(state);
  assert.equal(nonVanilla.errors?.[0]?.type, "effectRuntimeError");

  seedKnownTriggerFreeBoardManifest(state);
  state.cardManifest.cards[leader.cardId] = {
    ...must(state.cardManifest.cards[leader.cardId], "leader manifest"),
    support: {
      ...must(
        state.cardManifest.cards[leader.cardId],
        "leader manifest support",
      ).support,
      effectDefinitionId: "effect-1",
    },
  };
  const effectDefinition = enterMainPhase(state);
  assert.equal(effectDefinition.errors?.[0]?.type, "effectRuntimeError");

  seedKnownTriggerFreeBoardManifest(state);
  state.cardManifest.cards[leader.cardId] = {
    ...must(state.cardManifest.cards[leader.cardId], "leader manifest"),
    support: {
      ...must(
        state.cardManifest.cards[leader.cardId],
        "leader manifest support",
      ).support,
      customHandlerIds: ["handler-1"],
    },
  };
  const customHandler = enterMainPhase(state);
  assert.equal(customHandler.errors?.[0]?.type, "effectRuntimeError");
});

test("enterMainPhase is deterministic for accepted known trigger-free progression", () => {
  const stateA = createActiveState();
  seedKnownTriggerFreeBoardManifest(stateA);
  stateA.turn.phase = "don";
  const stateB = createActiveState();
  seedKnownTriggerFreeBoardManifest(stateB);
  stateB.turn.phase = "don";

  const resultA = enterMainPhase(stateA);
  const resultB = enterMainPhase(stateB);

  assert.deepEqual(
    resultA.events.map((event) => event.type),
    resultB.events.map((event) => event.type),
  );
  assert.equal(resultA.stateHash, resultB.stateHash);
});
