import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  MatchCardManifest,
  MatchId,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import { computeView } from "./compute-view.js";
import { createInitialState } from "./initial-state.js";

const toMatchId = (value: string): MatchId => value as MatchId;
const toPlayerId = (value: string): PlayerId => value as PlayerId;
const toCardId = (value: string): CardId => value as CardId;

const p1 = toPlayerId("p1");
const p2 = toPlayerId("p2");

const must = <T>(value: T | undefined, label: string): T => {
  assert.ok(value !== undefined, `missing ${label}`);
  return value;
};

const resolvedCard = (params: {
  cardId: CardId;
  category: "leader" | "character" | "don";
  power?: number;
  printedKeywords?: ResolvedCard["printedKeywords"];
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

const createManifest = (): MatchCardManifest => {
  const cardsById = {
    [toCardId("leader-red")]: resolvedCard({
      cardId: toCardId("leader-red"),
      category: "leader",
      power: 5000,
    }),
    [toCardId("leader-blue")]: resolvedCard({
      cardId: toCardId("leader-blue"),
      category: "leader",
      power: 5000,
    }),
    [toCardId("char-vanilla")]: resolvedCard({
      cardId: toCardId("char-vanilla"),
      category: "character",
      power: 3000,
    }),
    [toCardId("char-rush")]: resolvedCard({
      cardId: toCardId("char-rush"),
      category: "character",
      power: 3000,
      printedKeywords: ["rush"],
    }),
    [toCardId("char-rush-character")]: resolvedCard({
      cardId: toCardId("char-rush-character"),
      category: "character",
      power: 3000,
      printedKeywords: ["rushCharacter"],
    }),
    [toCardId("char-blocker")]: resolvedCard({
      cardId: toCardId("char-blocker"),
      category: "character",
      power: 3000,
      printedKeywords: ["blocker"],
    }),
    [toCardId("don-1")]: resolvedCard({
      cardId: toCardId("don-1"),
      category: "don",
    }),
  } as MatchCardManifest["cards"];

  return {
    manifestHash: "manifest-hash",
    source: "manual-test",
    cardDataVersion: "fixture",
    effectDefinitionsVersion: "fixture",
    customHandlerVersion: "fixture",
    banlistVersion: "fixture",
    createdAt: "2026-05-04T00:00:00.000Z",
    cards: cardsById,
  };
};

const createState = () =>
  createInitialState({
    matchId: toMatchId("match-compute-view-1"),
    firstPlayerId: p1,
    rngSeed: "seed-compute-view-1",
    playerOrder: [p1, p2],
    leaderCardIds: {
      [p1]: toCardId("leader-red"),
      [p2]: toCardId("leader-blue"),
    },
    leaderLifeCounts: {
      [p1]: 0,
      [p2]: 0,
    },
    deckCardIds: {
      [p1]: [
        "char-vanilla",
        "char-rush",
        "char-rush-character",
        "char-vanilla",
        "char-vanilla",
      ].map(toCardId),
      [p2]: [
        "char-vanilla",
        "char-rush",
        "char-rush-character",
        "char-vanilla",
        "char-vanilla",
      ].map(toCardId),
    },
    donDeckCardIds: {
      [p1]: ["don-1", "don-1", "don-1", "don-1", "don-1"].map(toCardId),
      [p2]: ["don-1", "don-1", "don-1", "don-1", "don-1"].map(toCardId),
    },
    cardManifest: createManifest(),
    shuffleDecks: false,
  });

const withCharacter = (
  playerId: PlayerId,
  cardId: CardId,
  index: number,
  options?: { state?: CardInstance["state"]; turnPlayed?: number },
): CardInstance => {
  const card: CardInstance = {
    instanceId:
      `${playerId}:char:${String(index)}:${cardId}` as CardInstance["instanceId"],
    cardId,
    owner: playerId,
    controller: playerId,
    zone: { zone: "characterArea", playerId, slot: "character", index },
    state: options?.state ?? "active",
    attachedDon: [],
  };
  if (options?.turnPlayed !== undefined) {
    card.turnPlayed = options.turnPlayed;
  }
  return card;
};

test("computes base/current power from manifest with attached DON!! during controller turn", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  state.turn.phase = "main";
  state.turn.turnPlayerId = p1;
  p1State.leader.attachedDon = ["p1:don:1" as CardInstance["instanceId"]];
  p1State.characters = [withCharacter(p1, toCardId("char-vanilla"), 0)];
  must(p1State.characters[0], "p1 character").attachedDon = [
    "p1:don:2" as CardInstance["instanceId"],
    "p1:don:3" as CardInstance["instanceId"],
  ];

  const view = computeView(state);
  const leaderView = must(
    view.cards[p1State.leader.instanceId],
    "p1 leader view",
  );
  const p1Character = must(p1State.characters[0], "p1 character");
  const characterView = must(
    view.cards[p1Character.instanceId],
    "p1 character view",
  );
  assert.equal(leaderView.basePower, 5000);
  assert.equal(leaderView.currentPower, 6000);
  assert.equal(characterView.basePower, 3000);
  assert.equal(characterView.currentPower, 5000);
});

test("attached DON!! does not modify current power outside controller turn", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  state.turn.phase = "main";
  state.turn.turnPlayerId = p2;
  p1State.leader.attachedDon = ["p1:don:1" as CardInstance["instanceId"]];

  const view = computeView(state);
  const leaderView = must(
    view.cards[p1State.leader.instanceId],
    "p1 leader view",
  );
  assert.equal(leaderView.basePower, 5000);
  assert.equal(leaderView.currentPower, 5000);
});

test("first player cannot attack on first turn", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  state.turn.phase = "main";
  state.turn.globalTurn = 1;
  state.turn.turnPlayerId = p1;
  state.turn.playerTurnCounts[p1] = 1;
  state.turn.playerTurnCounts[p2] = 0;

  const view = computeView(state);
  assert.deepEqual(view.legalAttackTargets[p1State.leader.instanceId], []);
});

test("second player cannot attack on first turn", () => {
  const state = createState();
  const p2State = must(state.players[p2], "p2 state");
  state.turn.phase = "main";
  state.turn.globalTurn = 2;
  state.turn.turnPlayerId = p2;
  state.turn.playerTurnCounts[p1] = 1;
  state.turn.playerTurnCounts[p2] = 1;

  const view = computeView(state);
  assert.deepEqual(view.legalAttackTargets[p2State.leader.instanceId], []);
});

test("played-this-turn character cannot attack without rush keyword", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  state.turn.phase = "main";
  state.turn.turnPlayerId = p1;
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  p1State.characters = [
    withCharacter(p1, toCardId("char-vanilla"), 0, { turnPlayed: 3 }),
  ];

  const view = computeView(state);
  assert.deepEqual(
    view.legalAttackTargets[
      must(p1State.characters[0], "p1 character").instanceId
    ],
    [],
  );
});

test("rush allows played-this-turn character to attack leader and rested characters", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  state.turn.phase = "main";
  state.turn.turnPlayerId = p1;
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  p1State.characters = [
    withCharacter(p1, toCardId("char-rush"), 0, { turnPlayed: 3 }),
  ];
  p2State.characters = [
    withCharacter(p2, toCardId("char-vanilla"), 0, { state: "rested" }),
    withCharacter(p2, toCardId("char-vanilla"), 1, { state: "active" }),
  ];

  const view = computeView(state);
  const p1Character = must(p1State.characters[0], "p1 character");
  const p2Character0 = must(p2State.characters[0], "p2 rested character");
  assert.deepEqual(view.legalAttackTargets[p1Character.instanceId], [
    p2State.leader.instanceId,
    p2Character0.instanceId,
  ]);
});

test("rushCharacter allows played-this-turn character to attack rested characters but not leader", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  state.turn.phase = "main";
  state.turn.turnPlayerId = p1;
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  p1State.characters = [
    withCharacter(p1, toCardId("char-rush-character"), 0, {
      turnPlayed: 3,
    }),
  ];
  p2State.characters = [
    withCharacter(p2, toCardId("char-vanilla"), 0, { state: "rested" }),
  ];

  const view = computeView(state);
  assert.deepEqual(
    view.legalAttackTargets[
      must(p1State.characters[0], "p1 character").instanceId
    ],
    [must(p2State.characters[0], "p2 rested character").instanceId],
  );
});

test("legal target lists include opponent leader and rested opponent characters only", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  state.turn.phase = "main";
  state.turn.turnPlayerId = p1;
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  p1State.characters = [withCharacter(p1, toCardId("char-vanilla"), 0)];
  p2State.characters = [
    withCharacter(p2, toCardId("char-vanilla"), 0, { state: "rested" }),
    withCharacter(p2, toCardId("char-vanilla"), 1, { state: "active" }),
  ];

  const view = computeView(state);
  assert.deepEqual(
    view.legalAttackTargets[
      must(p1State.characters[0], "p1 character").instanceId
    ],
    [
      p2State.leader.instanceId,
      must(p2State.characters[0], "p2 rested character").instanceId,
    ],
  );
});

test("fails closed when leader or character combat metadata is missing", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  state.turn.phase = "main";
  state.turn.turnPlayerId = p1;
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  p1State.characters = [withCharacter(p1, toCardId("char-vanilla"), 0)];
  const brokenManifest = {
    ...state.cardManifest,
    cards: { ...state.cardManifest.cards },
  };
  const brokenLeader = {
    ...must(brokenManifest.cards[toCardId("leader-red")], "leader-red"),
  };
  delete brokenLeader.power;
  brokenManifest.cards[toCardId("leader-red")] = brokenLeader;
  state.cardManifest = brokenManifest;

  assert.throws(() => computeView(state), /missing.*power/i);
});

test("fails closed when combat card support status is not vanilla-confirmed", () => {
  const state = createState();
  const brokenManifest = {
    ...state.cardManifest,
    cards: { ...state.cardManifest.cards },
  };
  brokenManifest.cards[toCardId("leader-red")] = {
    ...must(brokenManifest.cards[toCardId("leader-red")], "leader-red"),
    support: {
      ...must(brokenManifest.cards[toCardId("leader-red")], "leader-red")
        .support,
      status: "unsupported",
    },
  };
  state.cardManifest = brokenManifest;

  assert.throws(() => computeView(state), /unsupported.*status/i);
});

test("fails closed when combat card has unsupported printed combat keywords", () => {
  const state = createState();
  const brokenManifest = {
    ...state.cardManifest,
    cards: { ...state.cardManifest.cards },
  };
  brokenManifest.cards[toCardId("leader-red")] = {
    ...must(brokenManifest.cards[toCardId("leader-red")], "leader-red"),
    printedKeywords: ["doubleAttack"],
  };
  state.cardManifest = brokenManifest;

  assert.throws(() => computeView(state), /unsupported.*keyword/i);
});

test("active defender blocker character has canBlock true only during block step", () => {
  const state = createState();
  const p2State = must(state.players[p2], "p2 state");
  state.turn.phase = "main";
  state.turn.turnPlayerId = p1;
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  p2State.characters = [withCharacter(p2, toCardId("char-blocker"), 0)];
  state.battle = {
    attacker: {
      instanceId: must(state.players[p1], "p1 state").leader.instanceId,
      cardId: must(state.players[p1], "p1 state").leader.cardId,
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

  const view = computeView(state);
  assert.equal(
    view.cards[must(p2State.characters[0], "p2 blocker").instanceId]?.canBlock,
    true,
  );
});

test("canBlock remains false for ineligible blocker and non-blocker contexts", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  state.turn.phase = "main";
  state.turn.turnPlayerId = p1;
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  p1State.characters = [withCharacter(p1, toCardId("char-blocker"), 0)];
  p2State.characters = [
    withCharacter(p2, toCardId("char-blocker"), 0, { state: "rested" }),
    withCharacter(p2, toCardId("char-vanilla"), 1),
  ];
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

  const view = computeView(state);
  assert.equal(view.cards[p1State.leader.instanceId]?.canBlock, false);
  assert.equal(
    view.cards[must(p1State.characters[0], "p1 blocker").instanceId]?.canBlock,
    false,
  );
  assert.equal(
    view.cards[must(p2State.characters[0], "p2 rested blocker").instanceId]
      ?.canBlock,
    false,
  );
  assert.equal(
    view.cards[must(p2State.characters[1], "p2 non-blocker").instanceId]
      ?.canBlock,
    false,
  );

  delete state.battle;
  const outOfBattleView = computeView(state);
  assert.equal(
    outOfBattleView.cards[
      must(p2State.characters[0], "p2 rested blocker 2").instanceId
    ]?.canBlock,
    false,
  );
});

test("active defender printed blocker has canBlock false outside block step", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  state.turn.phase = "main";
  state.turn.turnPlayerId = p1;
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  p2State.characters = [withCharacter(p2, toCardId("char-blocker"), 0)];
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

  const inBattleAttackStep = computeView(state);
  assert.equal(
    inBattleAttackStep.cards[
      must(p2State.characters[0], "p2 active blocker").instanceId
    ]?.canBlock,
    false,
  );

  delete state.battle;
  const outOfBattle = computeView(state);
  assert.equal(
    outOfBattle.cards[
      must(p2State.characters[0], "p2 active blocker 2").instanceId
    ]?.canBlock,
    false,
  );
});

test("active defender printed blocker has canBlock false for stale battle refs", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  state.turn.phase = "main";
  state.turn.turnPlayerId = p1;
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  p2State.characters = [withCharacter(p2, toCardId("char-blocker"), 0)];

  state.battle = {
    attacker: {
      instanceId: "stale-attacker" as CardInstance["instanceId"],
      cardId: toCardId("leader-red"),
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
  const staleAttackerView = computeView(state);
  assert.equal(
    staleAttackerView.cards[
      must(p2State.characters[0], "p2 active blocker stale attacker").instanceId
    ]?.canBlock,
    false,
  );

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
      instanceId: "stale-target" as CardInstance["instanceId"],
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
    step: "block",
    damageCount: 1,
  };
  const staleTargetView = computeView(state);
  assert.equal(
    staleTargetView.cards[
      must(p2State.characters[0], "p2 active blocker stale target").instanceId
    ]?.canBlock,
    false,
  );
});

test("fails closed for unsupported unblockable keyword while blocker metadata is supported", () => {
  const state = createState();
  const brokenManifest = {
    ...state.cardManifest,
    cards: { ...state.cardManifest.cards },
  };
  brokenManifest.cards[toCardId("leader-red")] = {
    ...must(brokenManifest.cards[toCardId("leader-red")], "leader-red"),
    printedKeywords: ["unblockable"],
  };
  state.cardManifest = brokenManifest;

  assert.throws(() => computeView(state), /unsupported.*keyword/i);
});
