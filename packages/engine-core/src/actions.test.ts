import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  MatchId,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";
import { createInitialState } from "./initial-state.js";
import { respondToMulliganDecision, startMulliganFlow } from "./mulligan.js";
import { applyAction, getLegalActions } from "./actions.js";

const toMatchId = (value: string): MatchId => value as MatchId;
const toPlayerId = (value: string): PlayerId => value as PlayerId;
const toCardId = (value: string): CardId => value as CardId;

const p1 = toPlayerId("p1");
const p2 = toPlayerId("p2");

const must = <T>(value: T | undefined, label: string): T => {
  assert.ok(value !== undefined, `missing ${label}`);
  return value;
};

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
  category: "leader" | "character" | "don";
  power?: number;
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
  } satisfies ResolvedCard;
  return base;
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

test("accepted declareAttack rests attacker, creates battle, and emits only attackDeclared battle start", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const target = p2State.leader;

  const beforeLifeP1 = p1State.life.length;
  const beforeLifeP2 = p2State.life.length;
  const beforeTrashP1 = p1State.trash.length;
  const beforeTrashP2 = p2State.trash.length;

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
  assert.deepEqual(result.state.battle, {
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
      zone: attacker.zone,
    },
    originalTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
      zone: target.zone,
    },
    currentTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
      zone: target.zone,
    },
    step: "attack",
    damageCount: 1,
  });
  assert.equal(
    result.events.some((event) => event.type === "attackDeclared"),
    true,
  );
  assert.equal(
    result.events.some(
      (event) => event.type === "damageDealt" || event.type === "cardKOd",
    ),
    false,
  );
  assert.equal(must(result.state.players[p1], "p1").life.length, beforeLifeP1);
  assert.equal(must(result.state.players[p2], "p2").life.length, beforeLifeP2);
  assert.equal(
    must(result.state.players[p1], "p1").trash.length,
    beforeTrashP1,
  );
  assert.equal(
    must(result.state.players[p2], "p2").trash.length,
    beforeTrashP2,
  );
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
