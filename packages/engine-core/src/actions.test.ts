import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  EngineEvent,
  EngineEventId,
  MatchId,
  PlayerId,
  ResolvedCard,
  StateSeq,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";
import { createInitialState } from "./initial-state.js";
import { respondToMulliganDecision, startMulliganFlow } from "./mulligan.js";
import { applyRuleProcessingCheckpoint } from "./rule-processing.js";
import {
  applyAction,
  getLegalActions,
  resolveSupportedVanillaBattle,
} from "./actions.js";

const toMatchId = (value: string): MatchId => value as MatchId;
const toPlayerId = (value: string): PlayerId => value as PlayerId;
const toCardId = (value: string): CardId => value as CardId;
const toEngineEventId = (value: string): EngineEventId =>
  value as EngineEventId;
const toStateSeq = (value: number): StateSeq => value as StateSeq;

const p1 = toPlayerId("p1");
const p2 = toPlayerId("p2");

const must = <T>(value: T | undefined, label: string): T => {
  assert.ok(value !== undefined, `missing ${label}`);
  return value;
};

const hasPlayCardAction = (
  legal: ReturnType<typeof getLegalActions>,
  card: CardInstance,
): boolean =>
  legal.some(
    (action) =>
      action.type === "playCard" && action.cardInstanceId === card.instanceId,
  );

const createInput = () => ({
  matchId: toMatchId("match-actions-1"),
  firstPlayerId: p1,
  rngSeed: "seed-actions-1",
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
    manifestHash: "manifest-actions-1",
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

const resolvedCard = (params: {
  cardId: CardId;
  category: "leader" | "character" | "don" | "stage" | "event";
  cost?: number;
  power?: number;
  counter?: number;
  printedKeywords?: ("rush" | "rushCharacter" | "doubleAttack")[];
}): ResolvedCard => {
  const base = {
    cardId: params.cardId,
    language: "en",
    name: String(params.cardId),
    category: params.category,
    set: "TEST",
    setName: "Test Set",
    released: true,
    colors: ["red"],
    attributes: [],
    types: [],
    printedKeywords: params.printedKeywords ?? [],
    variants: [],
    legality: {},
    officialFaq: [],
    errata: [],
    sourceTextHash: "source-hash",
    behaviorHash: "behavior-hash",
    support: {
      cardId: params.cardId,
      status: "vanilla-confirmed",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
    ...(params.power !== undefined ? { power: params.power } : {}),
    ...(params.cost !== undefined ? { cost: params.cost } : {}),
    ...(params.counter !== undefined ? { counter: params.counter } : {}),
  } satisfies ResolvedCard;
  return base;
};

const setupMainPlayState = () => {
  const state = createActiveState();
  state.turn.phase = "main";
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  p1State.costArea = p1State.donDeck.slice(0, 3).map((card, index) => ({
    ...card,
    zone: { zone: "costArea", playerId: p1, slot: "cost", index },
    state: "active",
  }));
  p1State.donDeck = p1State.donDeck.slice(3).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  p2State.costArea = p2State.donDeck.slice(0, 3).map((card, index) => ({
    ...card,
    zone: { zone: "costArea", playerId: p2, slot: "cost", index },
    state: "active",
  }));
  p2State.donDeck = p2State.donDeck.slice(3).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p2, slot: "donDeck", index },
  }));
  return state;
};

const withAttackManifest = (state: ReturnType<typeof createActiveState>) => {
  state.cardManifest.cards[toCardId("leader-red")] = resolvedCard({
    cardId: toCardId("leader-red"),
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[toCardId("leader-blue")] = resolvedCard({
    cardId: toCardId("leader-blue"),
    category: "leader",
    power: 5000,
  });
  for (const cardId of [
    "p1-a",
    "p1-b",
    "p1-c",
    "p1-d",
    "p1-e",
    "p1-f",
    "p1-g",
    "p1-h",
    "p2-a",
    "p2-b",
    "p2-c",
    "p2-d",
    "p2-e",
    "p2-f",
    "p2-g",
    "p2-h",
  ]) {
    state.cardManifest.cards[toCardId(cardId)] = resolvedCard({
      cardId: toCardId(cardId),
      category: "character",
      power: 3000,
    });
  }
};

const setupAttackState = () => {
  const state = createActiveState();
  withAttackManifest(state);
  state.turn.phase = "main";
  state.turn.globalTurn = 3;
  state.turn.turnPlayerId = p1;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  p1State.leader.state = "active";
  p2State.leader.state = "active";
  p1State.characters = [
    {
      ...must(p1State.hand[0], "p1 hand"),
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 0,
      },
      state: "active",
      attachedDon: [],
      turnPlayed: 1,
    },
  ];
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  p2State.characters = [
    {
      ...must(p2State.hand[0], "p2 hand"),
      zone: {
        zone: "characterArea",
        playerId: p2,
        slot: "character",
        index: 0,
      },
      state: "rested",
      attachedDon: [],
      turnPlayed: 1,
    },
  ];
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  return state;
};

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

test("getLegalActions returns main-phase actions for turn player and concession-only for non-turn player", () => {
  const state = createActiveState();
  state.turn.phase = "main";
  const turnPlayer = must(state.players[p1], "p1");
  const attachedDon = must(turnPlayer.donDeck[0], "p1 don");
  turnPlayer.donDeck = turnPlayer.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  turnPlayer.costArea = [
    {
      ...attachedDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "active",
    },
  ];
  turnPlayer.characters = [
    {
      ...must(turnPlayer.hand[0], "p1 hand card"),
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 0,
      },
      state: "active",
      attachedDon: [],
    },
  ];
  turnPlayer.hand = turnPlayer.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

  const forTurnPlayer = getLegalActions(state, p1);
  assert.equal(
    forTurnPlayer.some((action) => action.type === "endMainPhase"),
    true,
  );
  assert.equal(
    forTurnPlayer.some((action) => action.type === "concede"),
    true,
  );
  assert.equal(
    forTurnPlayer.filter((action) => action.type === "attachDon").length,
    2,
  );

  const forNonTurnPlayer = getLegalActions(state, p2);
  assert.deepEqual(forNonTurnPlayer, [{ type: "concede", playerId: p2 }]);
});

test("getLegalActions outside main phase still includes concession", () => {
  const state = createActiveState();
  state.turn.phase = "draw";

  assert.deepEqual(getLegalActions(state, p1), [
    { type: "concede", playerId: p1 },
  ]);
  assert.deepEqual(getLegalActions(state, p2), [
    { type: "concede", playerId: p2 },
  ]);
});

test("getLegalActions suppresses phase actions while a decision is pending", () => {
  const setup = createInitialState(createInput());
  const pending = startMulliganFlow(setup).state;
  pending.status = { type: "active" };
  pending.turn.phase = "main";

  assert.deepEqual(getLegalActions(pending, p1), [
    { type: "concede", playerId: p1 },
  ]);
});

test("getLegalActions includes playCard for supported vanilla Character and Stage in turn-player hand", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.hand[0], "character");
  const stage = must(p1State.hand[1], "stage");
  const unsupported = must(p1State.hand[2], "unsupported");

  state.cardManifest.cards[character.cardId] = resolvedCard({
    cardId: character.cardId,
    category: "character",
    cost: 1,
    power: 2000,
  });
  state.cardManifest.cards[stage.cardId] = resolvedCard({
    cardId: stage.cardId,
    category: "stage",
    cost: 1,
  });
  state.cardManifest.cards[unsupported.cardId] = {
    ...resolvedCard({
      cardId: unsupported.cardId,
      category: "character",
      cost: 1,
      power: 1000,
    }),
    support: {
      ...resolvedCard({
        cardId: unsupported.cardId,
        category: "character",
      }).support,
      status: "unsupported",
    },
  };

  const legal = getLegalActions(state, p1);
  assert.equal(hasPlayCardAction(legal, character), true);
  assert.equal(hasPlayCardAction(legal, stage), true);
  assert.equal(hasPlayCardAction(legal, unsupported), false);
  assert.equal(hasPlayCardAction(getLegalActions(state, p2), character), false);
});

test("getLegalActions omits playCard when card play preconditions fail", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.hand[0], "character");
  const highCost = must(p1State.hand[1], "high-cost character");
  const stage = must(p1State.hand[2], "stage");
  const missingManifest = must(p1State.hand[3], "missing manifest");

  state.cardManifest.cards[character.cardId] = resolvedCard({
    cardId: character.cardId,
    category: "character",
    cost: 1,
    power: 2000,
  });
  state.cardManifest.cards[highCost.cardId] = resolvedCard({
    cardId: highCost.cardId,
    category: "character",
    cost: 4,
    power: 2000,
  });
  state.cardManifest.cards[stage.cardId] = resolvedCard({
    cardId: stage.cardId,
    category: "stage",
    cost: 1,
  });
  p1State.costArea = p1State.costArea.slice(0, 3).map((card, index) => ({
    ...card,
    zone: { zone: "costArea", playerId: p1, slot: "cost", index },
    state: index === 0 ? "active" : "rested",
  }));
  const legal = getLegalActions(state, p1);
  assert.equal(hasPlayCardAction(legal, character), true);
  assert.equal(hasPlayCardAction(legal, highCost), false);
  assert.equal(hasPlayCardAction(legal, missingManifest), false);

  const fullCharacters = setupMainPlayState();
  const fullP1 = must(fullCharacters.players[p1], "full p1");
  const fullCharacter = must(fullP1.hand[0], "full character");
  fullCharacters.cardManifest.cards[fullCharacter.cardId] = resolvedCard({
    cardId: fullCharacter.cardId,
    category: "character",
    cost: 1,
    power: 2000,
  });
  fullP1.characters = Array.from({ length: 5 }, (_, index) => ({
    ...fullCharacter,
    instanceId:
      `${String(fullCharacter.instanceId)}:full:${String(index)}` as CardInstance["instanceId"],
    zone: { zone: "characterArea", playerId: p1, slot: "character", index },
    state: "active",
  }));
  assert.equal(
    hasPlayCardAction(getLegalActions(fullCharacters, p1), fullCharacter),
    false,
  );

  const occupiedStage = setupMainPlayState();
  const stageP1 = must(occupiedStage.players[p1], "stage p1");
  const stageCard = must(stageP1.hand[1], "stage card");
  occupiedStage.cardManifest.cards[stageCard.cardId] = resolvedCard({
    cardId: stageCard.cardId,
    category: "stage",
    cost: 1,
  });
  stageP1.stage = {
    ...stageCard,
    instanceId:
      `${String(stageCard.instanceId)}:existing` as CardInstance["instanceId"],
    zone: { zone: "stageArea", playerId: p1, slot: "stage", index: 0 },
    state: "active",
  };
  assert.equal(
    hasPlayCardAction(getLegalActions(occupiedStage, p1), stageCard),
    false,
  );

  const battleState = setupMainPlayState();
  const battleP1 = must(battleState.players[p1], "battle p1");
  const battleCard = must(battleP1.hand[0], "battle card");
  battleState.cardManifest.cards[battleCard.cardId] = resolvedCard({
    cardId: battleCard.cardId,
    category: "character",
    cost: 1,
    power: 2000,
  });
  const leaderRef = {
    instanceId: battleP1.leader.instanceId,
    cardId: battleP1.leader.cardId,
    playerId: p1,
  };
  battleState.battle = {
    attacker: leaderRef,
    originalTarget: leaderRef,
    currentTarget: leaderRef,
    step: "counter",
    damageCount: 1,
  };
  assert.equal(
    hasPlayCardAction(getLegalActions(battleState, p1), battleCard),
    false,
  );
});

test("applyAction playCard rejects direct costPayment on initial action", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 1,
    power: 1000,
  });
  const before = JSON.stringify(state);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
    costPayment: { optionId: "restDon", selectedDonInstanceIds: [] },
  });
  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});

test("applyAction playCard rejects forged card instance references without mutation", () => {
  const state = setupMainPlayState();
  const before = JSON.stringify(state);

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: "forged-card" as CardInstance["instanceId"],
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});

test("applyAction playCard rejects nonzero cards without enough active DON!!", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 2,
    power: 2000,
  });
  p1State.costArea = p1State.costArea.slice(0, 1);
  const before = JSON.stringify(state);

  assert.equal(hasPlayCardAction(getLegalActions(state, p1), card), false);
  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(JSON.stringify(state), before);
});

test("nonzero playCard creates payCost decision and legal decision responses for decision player only", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 2,
    power: 3000,
  });

  const first = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  assert.equal(first.errors, undefined);
  assert.equal(first.state.pendingDecision?.type, "payCost");
  assert.deepEqual(
    first.events.map((event) => event.type),
    ["cardRevealed", "decisionCreated"],
  );
  assert.deepEqual(
    first.events.map((event) => event.visibility),
    [{ type: "public" }, { type: "public" }],
  );

  const legalForP1 = getLegalActions(first.state, p1);
  const legalForP2 = getLegalActions(first.state, p2);
  assert.equal(
    legalForP1.some((action) => action.type === "respondToDecision"),
    true,
  );
  assert.equal(
    legalForP2.some((action) => action.type === "respondToDecision"),
    false,
  );
});

test("valid respondToDecision payment resolves nonzero Character play", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 2,
    power: 3000,
  });
  const opened = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "decision");
  const selected = must(
    must(opened.state.players[p1], "p1").costArea[0],
    "don0",
  );
  const selected2 = must(
    must(opened.state.players[p1], "p1").costArea[1],
    "don1",
  );

  const resolved = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  const resolvedP1 = must(resolved.state.players[p1], "p1");
  const played = must(resolvedP1.characters[0], "played character");
  assert.equal(played.instanceId, card.instanceId);
  assert.equal(played.turnPlayed, state.turn.globalTurn);
  assert.equal(
    resolvedP1.costArea.filter((don) => don.state === "rested").length >= 2,
    true,
  );
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    [
      "costPaid",
      "decisionResolved",
      "cardMoved",
      "cardPlayed",
      "ruleProcessingChecked",
    ],
  );
  assert.deepEqual(
    resolved.events.map((event) => event.visibility),
    [
      { type: "public" },
      { type: "public" },
      { type: "public" },
      { type: "public" },
      { type: "replayOnly" },
    ],
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("valid respondToDecision payment resolves nonzero Stage play", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const stage = must(p1State.hand[1], "stage");
  state.cardManifest.cards[stage.cardId] = resolvedCard({
    cardId: stage.cardId,
    category: "stage",
    cost: 2,
  });
  const opened = applyAction(state, {
    type: "playCard",
    cardInstanceId: stage.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "decision");
  const selected = must(
    must(opened.state.players[p1], "p1").costArea[0],
    "don0",
  );
  const selected2 = must(
    must(opened.state.players[p1], "p1").costArea[1],
    "don1",
  );

  const resolved = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(
    must(resolved.state.players[p1], "p1").stage?.instanceId,
    stage.instanceId,
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("zero-cost playCard resolves directly for Character without payCost decision", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.hand[0], "character");
  state.cardManifest.cards[character.cardId] = resolvedCard({
    cardId: character.cardId,
    category: "character",
    cost: 0,
    power: 2000,
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: character.instanceId,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  const played = must(
    must(result.state.players[p1], "p1").characters[0],
    "played",
  );
  assert.equal(played.instanceId, character.instanceId);
  assert.equal(played.turnPlayed, state.turn.globalTurn);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardRevealed", "cardMoved", "cardPlayed", "ruleProcessingChecked"],
  );
});

test("zero-cost playCard resolves directly for Stage without payCost decision", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const stage = must(p1State.hand[1], "stage");
  state.cardManifest.cards[stage.cardId] = resolvedCard({
    cardId: stage.cardId,
    category: "stage",
    cost: 0,
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: stage.instanceId,
  });
  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(
    must(result.state.players[p1], "p1").stage?.instanceId,
    stage.instanceId,
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardRevealed", "cardMoved", "cardPlayed", "ruleProcessingChecked"],
  );
  assert.deepEqual(
    result.events.map((event) => event.visibility),
    [
      { type: "public" },
      { type: "public" },
      { type: "public" },
      { type: "replayOnly" },
    ],
  );
});

test("respondToDecision rejects duplicate/forged DON!! selections without mutation", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 2,
    power: 2000,
  });
  const opened = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "decision");
  const validDon = must(
    must(opened.state.players[p1], "p1").costArea[0],
    "don",
  );
  const before = JSON.stringify(opened.state);

  const duplicate = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [validDon.instanceId, validDon.instanceId],
    },
  });
  assert.equal(duplicate.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(opened.state), before);

  const forged = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [
        validDon.instanceId,
        "forged-don" as CardInstance["instanceId"],
      ],
    },
  });
  assert.equal(forged.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(opened.state), before);
});

test("respondToDecision rejects invalid payment variants without mutation", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 2,
    power: 2000,
  });
  const opened = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  const decision = must(opened.state.pendingDecision, "decision");
  const openedP1 = must(opened.state.players[p1], "opened p1");
  const selected = must(openedP1.costArea[0], "don0");
  const selected2 = must(openedP1.costArea[1], "don1");
  const wrongPlayerDon = must(
    must(opened.state.players[p2], "opened p2").costArea[0],
    "p2 don",
  );
  const before = JSON.stringify(opened.state);

  const wrongDecision = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: `${String(decision.id)}:wrong` as typeof decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });
  assert.equal(wrongDecision.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(opened.state), before);

  const insufficient = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId],
    },
  });
  assert.equal(insufficient.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(opened.state), before);

  const wrongPlayerSelection = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, wrongPlayerDon.instanceId],
    },
  });
  assert.equal(wrongPlayerSelection.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(opened.state), before);

  const restedState = {
    ...opened.state,
    players: {
      ...opened.state.players,
      [p1]: {
        ...openedP1,
        costArea: openedP1.costArea.map((don) =>
          don.instanceId === selected.instanceId
            ? { ...don, state: "rested" }
            : don,
        ),
      },
    },
  };
  const restedBefore = JSON.stringify(restedState);
  const rested = applyAction(restedState, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });
  assert.equal(rested.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(restedState), restedBefore);

  const attachedState = {
    ...opened.state,
    players: {
      ...opened.state.players,
      [p1]: {
        ...openedP1,
        leader: {
          ...openedP1.leader,
          attachedDon: [selected.instanceId],
        },
        costArea: openedP1.costArea
          .filter((don) => don.instanceId !== selected.instanceId)
          .map((don, index) => ({
            ...don,
            zone: { zone: "costArea", playerId: p1, slot: "cost", index },
          })),
      },
    },
  };
  const attachedBefore = JSON.stringify(attachedState);
  const attached = applyAction(attachedState, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });
  assert.equal(attached.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(attachedState), attachedBefore);

  const staleState = {
    ...opened.state,
    players: {
      ...opened.state.players,
      [p1]: {
        ...openedP1,
        hand: openedP1.hand
          .filter((handCard) => handCard.instanceId !== card.instanceId)
          .map((handCard, index) => ({
            ...handCard,
            zone: { zone: "hand", playerId: p1, slot: "hand", index },
          })),
      },
    },
  };
  const staleBefore = JSON.stringify(staleState);
  const stale = applyAction(staleState, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [selected.instanceId, selected2.instanceId],
    },
  });
  assert.equal(stale.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(staleState), staleBefore);
});

test("applyAction attaches active DON!! to own leader/character during main phase", () => {
  const state = createActiveState();
  state.turn.phase = "main";
  const turnPlayer = must(state.players[p1], "p1");
  const don = must(turnPlayer.donDeck[0], "don");
  turnPlayer.donDeck = turnPlayer.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  turnPlayer.costArea = [
    {
      ...don,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "active",
    },
  ];
  turnPlayer.characters = [
    {
      ...must(turnPlayer.hand[0], "p1 hand card"),
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 0,
      },
      state: "active",
      attachedDon: [],
    },
  ];
  turnPlayer.hand = turnPlayer.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  const targetCharacter = must(turnPlayer.characters[0], "target character");

  const result = applyAction(state, {
    type: "attachDon",
    donInstanceId: don.instanceId,
    target: {
      instanceId: targetCharacter.instanceId,
      cardId: targetCharacter.cardId,
      playerId: p1,
    },
  });

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    must(result.state.players[p1], "p1").characters[0]?.attachedDon,
    [don.instanceId],
  );
  assert.equal(
    must(result.state.players[p1], "p1").costArea[0]?.state,
    undefined,
  );
});

test("applyAction rejects illegal attachDon variants", () => {
  const base = createActiveState();
  base.turn.phase = "main";
  const p1State = must(base.players[p1], "p1");
  const p2State = must(base.players[p2], "p2");
  const don = must(p1State.donDeck[0], "don");
  p1State.donDeck = p1State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  p1State.costArea = [
    {
      ...don,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "active",
    },
  ];

  const wrongPlayer = applyAction(base, {
    type: "attachDon",
    donInstanceId: don.instanceId,
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });
  assert.equal(wrongPlayer.errors?.[0]?.type, "illegalAction");

  const wrongPhase = createActiveState();
  const wrongPhaseP1 = must(wrongPhase.players[p1], "wrong-phase p1");
  const wrongPhaseDon = must(wrongPhaseP1.donDeck[0], "wrong-phase don");
  wrongPhaseP1.donDeck = wrongPhaseP1.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  wrongPhaseP1.costArea = [
    {
      ...wrongPhaseDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "active",
    },
  ];
  wrongPhase.turn.phase = "draw";
  const wrongPhaseResult = applyAction(wrongPhase, {
    type: "attachDon",
    donInstanceId: wrongPhaseDon.instanceId,
    target: {
      instanceId: wrongPhaseP1.leader.instanceId,
      cardId: wrongPhaseP1.leader.cardId,
      playerId: p1,
    },
  });
  assert.equal(wrongPhaseResult.errors?.[0]?.type, "illegalAction");

  const restedDon = createActiveState();
  restedDon.turn.phase = "main";
  const restedP1 = must(restedDon.players[p1], "rested p1");
  const restedDonCard = must(restedP1.donDeck[0], "rested don");
  restedP1.donDeck = restedP1.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  restedP1.costArea = [
    {
      ...restedDonCard,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "rested",
    },
  ];
  const restedResult = applyAction(restedDon, {
    type: "attachDon",
    donInstanceId: restedDonCard.instanceId,
    target: {
      instanceId: restedP1.leader.instanceId,
      cardId: restedP1.leader.cardId,
      playerId: p1,
    },
  });
  assert.equal(restedResult.errors?.[0]?.type, "illegalAction");

  const invalidTarget = applyAction(base, {
    type: "attachDon",
    donInstanceId: don.instanceId,
    target: {
      instanceId: don.instanceId,
      cardId: don.cardId,
      playerId: p1,
    },
  });
  assert.equal(invalidTarget.errors?.[0]?.type, "illegalAction");

  const malformedTargetCardId = applyAction(base, {
    type: "attachDon",
    donInstanceId: don.instanceId,
    target: {
      instanceId: p1State.leader.instanceId,
      cardId: toCardId("forged-leader"),
      playerId: p1,
    },
  });
  assert.equal(malformedTargetCardId.errors?.[0]?.type, "illegalAction");

  const malformedTargetZone = applyAction(base, {
    type: "attachDon",
    donInstanceId: don.instanceId,
    target: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
      zone: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
    },
  });
  assert.equal(malformedTargetZone.errors?.[0]?.type, "illegalAction");
});

test("applyAction endMainPhase transitions to next turn refresh", () => {
  const state = createActiveState();
  state.turn.phase = "main";
  const seqBefore = state.seq;
  const actionSeqBefore = state.actionSeq;
  const journalLengthBefore = state.eventJournal.length;

  const result = applyAction(state, { type: "endMainPhase" });
  assert.equal(result.errors, undefined);
  assert.equal(result.state.turn.phase, "refresh");
  assert.equal(result.state.turn.turnPlayerId, p2);
  assert.equal(
    result.state.seq,
    ((seqBefore as number) + 1) as typeof state.seq,
  );
  assert.equal(result.state.actionSeq, actionSeqBefore + 1);
  assert.equal(
    result.state.eventJournal.length,
    journalLengthBefore + result.events.length,
  );
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
  assert.equal(
    result.events.every(
      (event) => event.createdAtStateSeq === result.state.seq,
    ),
    true,
  );
});

test("applyAction concede immediately completes match for opponent", () => {
  const state = createActiveState();
  state.turn.phase = "draw";

  const result = applyAction(state, { type: "concede", playerId: p1 });
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.state.status, { type: "completed", winner: p2 });
});

test("applyAction concession during a pending decision clears the decision", () => {
  const setup = createInitialState(createInput());
  const state = startMulliganFlow(setup).state;
  const result = applyAction(state, { type: "concede", playerId: p1 });

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.state.status, { type: "completed", winner: p2 });
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.decisions, undefined);
});

test("illegal actions return errors and do not mutate input state", () => {
  const state = createActiveState();
  const before = JSON.stringify(state);

  const result = applyAction(state, {
    type: "attachDon",
    donInstanceId: "missing-don" as never,
    target: {
      instanceId: must(state.players[p1], "p1").leader.instanceId,
      cardId: must(state.players[p1], "p1").leader.cardId,
      playerId: p1,
    },
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});

test("pending decisions reject non-concession applyAction requests without mutation", () => {
  const setup = createInitialState(createInput());
  const state = startMulliganFlow(setup).state;
  state.status = { type: "active" };
  state.turn.phase = "main";
  const before = JSON.stringify(state);

  const result = applyAction(state, { type: "endMainPhase" });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});

test("getLegalActions includes Leader-to-Leader declareAttack for turn player", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");

  const legal = getLegalActions(state, p1);
  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === p1State.leader.instanceId &&
        action.target.instanceId === p2State.leader.instanceId,
    ),
    true,
  );
});

test("getLegalActions includes Character-to-rested-Character declareAttack and excludes active characters", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  p2State.characters.push({
    ...must(p2State.hand[0], "p2 hand active"),
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 1 },
    state: "active",
    attachedDon: [],
    turnPlayed: 1,
  });

  const attacker = must(p1State.characters[0], "attacker");
  const restedTarget = must(p2State.characters[0], "rested target");
  const activeTarget = must(p2State.characters[1], "active target");
  const legal = getLegalActions(state, p1);

  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === attacker.instanceId &&
        action.target.instanceId === restedTarget.instanceId,
    ),
    true,
  );
  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === attacker.instanceId &&
        action.target.instanceId === activeTarget.instanceId,
    ),
    false,
  );
});

test("supported declareAttack resolves vanilla battle internally without continuation action", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const target = p2State.leader;

  const beforeLifeP1 = p1State.life.length;
  const beforeLifeP2 = p2State.life.length;
  const beforeTrashP1 = p1State.trash.length;
  const beforeTrashP2 = p2State.trash.length;
  const seqBefore = state.seq;
  const actionSeqBefore = state.actionSeq;

  const result = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });

  assert.equal(result.errors, undefined);
  assert.equal(must(result.state.players[p1], "p1").leader.state, "rested");
  assert.equal(result.state.battle, undefined);
  assert.equal(
    result.events.some((event) => event.type === "attackDeclared"),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "damageDealt"),
    true,
  );
  assert.equal(must(result.state.players[p1], "p1").life.length, beforeLifeP1);
  assert.equal(
    must(result.state.players[p2], "p2").life.length,
    beforeLifeP2 - 1,
  );
  assert.equal(
    must(result.state.players[p1], "p1").trash.length,
    beforeTrashP1,
  );
  assert.equal(
    must(result.state.players[p2], "p2").trash.length,
    beforeTrashP2,
  );
  assert.deepEqual(
    result.state.eventJournal.slice(-result.events.length),
    result.events,
  );
  assert.deepEqual(
    result.events.map((event) => event.seq),
    [...new Set(result.events.map((event) => event.seq))],
  );
  assert.equal(
    result.state.seq,
    ((seqBefore as number) + 1) as typeof state.seq,
  );
  assert.equal(result.state.actionSeq, actionSeqBefore + 1);
  assert.equal(
    result.events.every(
      (event) => event.createdAtStateSeq === result.state.seq,
    ),
    true,
  );
});

test("resolveSupportedVanillaBattle rejects when no active battle", () => {
  const state = setupAttackState();
  const before = JSON.stringify(state);
  const result = resolveSupportedVanillaBattle(state);
  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});

test("leader damage at 0 life completes the match for the attacker", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  p2State.life = [];
  state.battle = {
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    originalTarget: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
    currentTarget: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
    step: "attack",
    damageCount: 1,
  };
  const result = resolveSupportedVanillaBattle(state);
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.state.status, { type: "completed", winner: p1 });
  assert.equal(
    result.events.some((event) => event.type === "gameEnded"),
    true,
  );
});

test("rule-processing checkpoint decks out defending player after accepted mutation", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  p2State.deck = [];

  const result = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.state.status, { type: "completed", winner: p1 });
});

test("simultaneous defeat conditions resolve as draw", () => {
  const state = createActiveState();
  state.status = { type: "active" };
  state.turn.phase = "main";
  must(state.players[p1], "p1").deck = [];
  must(state.players[p2], "p2").deck = [];

  const result = applyAction(state, { type: "endMainPhase" });
  assert.equal(result.errors, undefined);
  assert.deepEqual(result.state.status, { type: "completed", winner: "draw" });
});

test("terminal status is not overwritten by later rule-processing checks", () => {
  const state = setupAttackState();
  state.status = { type: "completed", winner: p2 };
  must(state.players[p1], "p1").deck = [];
  must(state.players[p2], "p2").deck = [];
  const before = JSON.stringify(state);
  const events: EngineEvent[] = [];

  const result = applyRuleProcessingCheckpoint({
    state,
    events,
    phase: "main",
    createEvent: (
      seqOffset,
      type,
      payload,
      visibility = { type: "public" },
    ) => ({
      id: toEngineEventId(
        `event:${String(state.seq)}:${String(seqOffset)}:${type}`,
      ),
      seq: state.eventJournal.length + seqOffset,
      type,
      payload,
      visibility,
      causedBy: { type: "ruleProcess", name: "test" },
      createdAtStateSeq: toStateSeq(state.seq + 1),
    }),
  });
  assert.equal(JSON.stringify(result), before);
  assert.deepEqual(result.status, { type: "completed", winner: p2 });
  assert.equal(
    events.some((event) => event.type === "gameEnded"),
    false,
  );
});

test("rejected illegal actions do not run terminal rule processing", () => {
  const state = createActiveState();
  state.turn.phase = "draw";
  must(state.players[p1], "p1").deck = [];
  const before = JSON.stringify(state);

  const result = applyAction(state, { type: "endMainPhase" });
  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(result.state), before);
  assert.equal(
    result.events.some((event) => event.type === "gameEnded"),
    false,
  );
});

test("terminal rule-processing events and state hash are deterministic", () => {
  const createDeckOutState = () => {
    const state = setupAttackState();
    must(state.players[p2], "p2").deck = [];
    return state;
  };

  const first = applyAction(createDeckOutState(), { type: "endMainPhase" });
  const second = applyAction(createDeckOutState(), { type: "endMainPhase" });

  assert.equal(first.errors, undefined);
  assert.equal(second.errors, undefined);
  assert.deepEqual(first.events, second.events);
  assert.deepEqual(
    first.state.eventJournal.slice(-first.events.length),
    first.events,
  );
  assert.deepEqual(
    first.events.map((event) => event.seq),
    [...new Set(first.events.map((event) => event.seq))],
  );
  assert.deepEqual(
    first.events.map((event) => event.id),
    [...new Set(first.events.map((event) => event.id))],
  );
  assert.equal(first.stateHash, second.stateHash);
});

test("life orientation uses player.life[0] as next damage card", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const expectedLifeCard = must(p2State.life[0], "top life").card.instanceId;
  const result = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });
  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p2], "p2").hand.some(
      (card) => card.instanceId === expectedLifeCard,
    ),
    true,
  );
});

test("public life movement events do not expose life card ids, while private event includes details", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const result = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });
  const publicCardMoved = result.events.find(
    (event) => event.type === "cardMoved" && event.visibility.type === "public",
  );
  const privateCardMoved = result.events.find(
    (event) =>
      event.type === "cardMoved" && event.visibility.type === "private",
  );
  assert.ok(publicCardMoved !== undefined);
  assert.equal(
    "instanceId" in (publicCardMoved.payload as Record<string, unknown>),
    false,
  );
  assert.ok(privateCardMoved !== undefined);
  assert.equal(privateCardMoved.visibility.type, "private");
  assert.equal(privateCardMoved.visibility.playerId, p2);
});

test("equal-or-greater power K.O.s rested character and returns attached DON!! rested", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const don = must(p2State.donDeck[0], "p2 don");
  p2State.donDeck = p2State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p2, slot: "donDeck", index },
  }));
  p2State.costArea = [
    {
      ...don,
      zone: { zone: "costArea", playerId: p2, slot: "cost", index: 0 },
    },
  ];
  target.attachedDon = [don.instanceId];
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
  });
  const result = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });
  assert.equal(result.errors, undefined);
  assert.equal(must(result.state.players[p2], "p2").characters.length, 0);
  assert.equal(must(result.state.players[p2], "p2").trash.length >= 1, true);
  assert.equal(
    must(result.state.players[p2], "p2").costArea.find(
      (card) => card.instanceId === don.instanceId,
    )?.state,
    "rested",
  );
});

test("character K.O. reindexes surviving defender characters", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const survivor = must(p2State.hand[0], "second defender");
  p2State.characters.push({
    ...survivor,
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 1 },
    state: "rested",
    attachedDon: [],
    turnPlayed: 1,
  });
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 3000,
  });
  state.cardManifest.cards[survivor.cardId] = resolvedCard({
    cardId: survivor.cardId,
    category: "character",
    power: 3000,
  });

  const result = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });

  const defender = must(result.state.players[p2], "p2");
  assert.equal(result.errors, undefined);
  assert.equal(defender.characters.length, 1);
  const remainingCharacter = must(defender.characters[0], "remaining defender");
  assert.equal(remainingCharacter.instanceId, survivor.instanceId);
  assert.deepEqual(remainingCharacter.zone, {
    zone: "characterArea",
    playerId: p2,
    slot: "character",
    index: 0,
  });
});

test("lower-power attack causes no K.O. and no life movement", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 2000,
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 7000,
  });
  const beforeLife = p2State.life.length;
  const result = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });
  assert.equal(result.errors, undefined);
  assert.equal(must(result.state.players[p2], "p2").characters.length, 1);
  assert.equal(must(result.state.players[p2], "p2").life.length, beforeLife);
});

test("unsupported trigger/blocker/counter/doubleAttack/banish windows fail closed without mutation", () => {
  const run = (
    mutate: (state: ReturnType<typeof setupAttackState>) => void,
  ) => {
    const state = setupAttackState();
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    state.battle = {
      attacker: {
        instanceId: p1State.leader.instanceId,
        cardId: p1State.leader.cardId,
        playerId: p1,
      },
      originalTarget: {
        instanceId: p2State.leader.instanceId,
        cardId: p2State.leader.cardId,
        playerId: p2,
      },
      currentTarget: {
        instanceId: p2State.leader.instanceId,
        cardId: p2State.leader.cardId,
        playerId: p2,
      },
      step: "attack",
      damageCount: 1,
    };
    mutate(state);
    const before = JSON.stringify(state);
    const result = resolveSupportedVanillaBattle(state);
    assert.equal(result.errors?.[0]?.type, "illegalAction");
    assert.equal(JSON.stringify(state), before);
  };
  run((state) => {
    must(state.players[p2], "p2").life[0] = {
      ...must(must(state.players[p2], "p2").life[0], "life"),
      card: {
        ...must(must(state.players[p2], "p2").life[0], "life").card,
        cardId: toCardId("trigger-life"),
      },
    };
    state.cardManifest.cards[toCardId("trigger-life")] = {
      ...resolvedCard({
        cardId: toCardId("trigger-life"),
        category: "character",
        power: 1000,
      }),
      triggerText: "TRIGGER: do a thing",
    };
  });
  run((state) => {
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    state.battle = {
      attacker: {
        instanceId: p1State.leader.instanceId,
        cardId: p1State.leader.cardId,
        playerId: p1,
      },
      originalTarget: {
        instanceId: p2State.leader.instanceId,
        cardId: p2State.leader.cardId,
        playerId: p2,
      },
      currentTarget: {
        instanceId: p2State.leader.instanceId,
        cardId: p2State.leader.cardId,
        playerId: p2,
      },
      step: "block",
      damageCount: 1,
    };
  });
  run((state) => {
    state.cardManifest.cards[toCardId("leader-red")] = {
      ...resolvedCard({
        cardId: toCardId("leader-red"),
        category: "leader",
        power: 5000,
      }),
      printedKeywords: ["doubleAttack"],
    };
  });
  run((state) => {
    state.cardManifest.cards[toCardId("leader-red")] = {
      ...resolvedCard({
        cardId: toCardId("leader-red"),
        category: "leader",
        power: 5000,
      }),
      printedKeywords: ["banish"],
    };
  });
});

test("applyAction declareAttack fails closed without mutation when vanilla continuation is unsupported", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  p2State.life[0] = {
    ...topLife,
    card: { ...topLife.card, cardId: toCardId("trigger-life") },
  };
  state.cardManifest.cards[toCardId("trigger-life")] = {
    ...resolvedCard({
      cardId: toCardId("trigger-life"),
      category: "character",
      power: 1000,
    }),
    triggerText: "TRIGGER: do a thing",
  };
  const before = JSON.stringify(state);

  const result = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.deepEqual(result.events, []);
});

test("applyAction declareAttack fails closed when defender has counter metadata in hand", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const counterCard = must(p2State.hand[0], "counter card");
  state.cardManifest.cards[counterCard.cardId] = resolvedCard({
    cardId: counterCard.cardId,
    category: "character",
    power: 3000,
    counter: 1000,
  });
  const before = JSON.stringify(state);

  const result = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.deepEqual(result.events, []);
});

test("existing battle suppresses declareAttack legal actions and rejects applyAction", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  state.battle = {
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    originalTarget: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
    currentTarget: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
    step: "attack",
    damageCount: 1,
  };

  assert.deepEqual(getLegalActions(state, p1), [
    { type: "concede", playerId: p1 },
  ]);

  const before = JSON.stringify(state);
  const result = applyAction(state, {
    type: "declareAttack",
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });
  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});

test("declareAttack rejection cases do not mutate input state", () => {
  const base = setupAttackState();
  const p1State = must(base.players[p1], "p1");
  const p2State = must(base.players[p2], "p2");
  const attacker = p1State.leader;
  const target = p2State.leader;

  const run = (
    mutate: (state: ReturnType<typeof setupAttackState>) => void,
    actionOverride?: {
      attacker?: {
        instanceId: CardInstance["instanceId"];
        cardId: CardId;
        playerId: PlayerId;
      };
      target?: {
        instanceId: CardInstance["instanceId"];
        cardId: CardId;
        playerId: PlayerId;
      };
    },
  ) => {
    const state = setupAttackState();
    mutate(state);
    const before = JSON.stringify(state);
    const result = applyAction(state, {
      type: "declareAttack",
      attacker: actionOverride?.attacker ?? {
        instanceId: attacker.instanceId,
        cardId: attacker.cardId,
        playerId: p1,
      },
      target: actionOverride?.target ?? {
        instanceId: target.instanceId,
        cardId: target.cardId,
        playerId: p2,
      },
    });
    assert.equal(result.errors?.[0]?.type, "illegalAction");
    assert.equal(JSON.stringify(state), before);
  };

  run((state) => {
    state.turn.phase = "draw";
  });
  run(() => {}, {
    attacker: {
      instanceId: must(base.players[p2], "p2 for attacker").leader.instanceId,
      cardId: must(base.players[p2], "p2 for attacker").leader.cardId,
      playerId: p2,
    },
  });
  run((state) => {
    must(state.players[p1], "rest p1").leader.state = "rested";
  });
  run((state) => {
    state.turn.globalTurn = 1;
    state.turn.playerTurnCounts[p1] = 1;
    state.turn.playerTurnCounts[p2] = 0;
  });
  run(
    (state) => {
      const character = must(
        must(state.players[p1], "p1 char").characters[0],
        "char",
      );
      character.turnPlayed = state.turn.globalTurn;
    },
    {
      attacker: {
        instanceId: must(
          must(base.players[p1], "p1 char ref").characters[0],
          "p1 char ref card",
        ).instanceId,
        cardId: must(
          must(base.players[p1], "p1 char ref").characters[0],
          "p1 char ref card",
        ).cardId,
        playerId: p1,
      },
    },
  );
  run((state) => {
    state.cardManifest.cards[toCardId("leader-red")] = {
      ...resolvedCard({
        cardId: toCardId("leader-red"),
        category: "leader",
        power: 5000,
      }),
      printedKeywords: ["doubleAttack"],
    };
  });
  run(() => {}, {
    attacker: {
      instanceId: attacker.instanceId,
      cardId: toCardId("forged-attacker"),
      playerId: p1,
    },
  });
  run(() => {}, {
    target: {
      instanceId: target.instanceId,
      cardId: toCardId("forged-target"),
      playerId: p2,
    },
  });
});
