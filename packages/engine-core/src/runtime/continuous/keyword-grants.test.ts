import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  ContinuousEffectRecord,
  Keyword,
  MatchCardManifest,
  MatchId,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import { hashCanonicalStateValue } from "../../state/canonical-state.js";
import { computeView } from "../../compute-view.js";
import { createInitialState } from "../../initial-state.js";

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
}): ResolvedCard => ({
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
});

const createManifest = (): MatchCardManifest => ({
  manifestHash: "manifest-hash",
  source: "manual-test",
  cardDataVersion: "fixture",
  effectDefinitionsVersion: "fixture",
  customHandlerVersion: "fixture",
  banlistVersion: "fixture",
  createdAt: "2026-05-04T00:00:00.000Z",
  cards: {
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
    [toCardId("char-alt")]: resolvedCard({
      cardId: toCardId("char-alt"),
      category: "character",
      power: 3000,
    }),
    [toCardId("trash-marker")]: resolvedCard({
      cardId: toCardId("trash-marker"),
      category: "character",
      power: 1000,
    }),
    [toCardId("don-1")]: resolvedCard({
      cardId: toCardId("don-1"),
      category: "don",
    }),
  },
});

const createState = () =>
  createInitialState({
    matchId: toMatchId("match-continuous-keyword-grants"),
    firstPlayerId: p1,
    rngSeed: "seed-continuous-keyword-grants",
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
        "char-vanilla",
        "char-vanilla",
        "char-vanilla",
        "char-vanilla",
      ].map(toCardId),
      [p2]: [
        "char-vanilla",
        "char-vanilla",
        "char-vanilla",
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

const withCharacter = (playerId: PlayerId, index: number): CardInstance => ({
  instanceId:
    `${playerId}:char:${String(index)}:char-vanilla` as CardInstance["instanceId"],
  cardId: toCardId("char-vanilla"),
  owner: playerId,
  controller: playerId,
  zone: { zone: "characterArea", playerId, slot: "character", index },
  state: "active",
  attachedDon: [],
});

const battleRef = (card: CardInstance) => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId: card.controller,
});

const addTrashMarker = (
  state: ReturnType<typeof createState>,
  playerId: PlayerId,
): void => {
  const player = must(state.players[playerId], "trash marker player");
  player.trash = [
    {
      instanceId:
        `${playerId}:trash:0:trash-marker` as CardInstance["instanceId"],
      cardId: toCardId("trash-marker"),
      owner: playerId,
      controller: playerId,
      zone: { zone: "trash", playerId, slot: "trash", index: 0 },
      state: "active",
      attachedDon: [],
    },
  ];
};

const continuousKeywordEffectRecord = (
  state: ReturnType<typeof createState>,
  keyword: Keyword,
  options: {
    id?: string;
    source: CardInstance;
    condition?: ContinuousEffectRecord["condition"];
  },
): ContinuousEffectRecord => {
  const source = options.source;
  const sourceCategory =
    source.zone.zone === "leaderArea" ? "leader" : "character";
  const record: ContinuousEffectRecord = {
    id: options.id ?? `continuous-keyword-${keyword}`,
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: source.controller,
      zone: source.zone,
    },
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: source.owner,
      controllerId: source.controller,
      zone: source.zone,
      category: sourceCategory,
      colors: ["red"],
      power: sourceCategory === "leader" ? 5000 : 3000,
      keywords: [],
    },
    controller: source.controller,
    modifier: {
      layer: "keywordAdd",
      target: { type: "self" },
      operation: { type: "addKeyword", keyword },
    },
    duration: { type: "whileSourceOnField" },
    createdBy: { type: "ruleProcess", name: "continuous-keyword-test" },
    createdAtStateSeq: state.seq,
  };
  if (options.condition !== undefined) {
    record.condition = options.condition;
  }
  return record;
};

const allowlistedKeywordGrantCases: Keyword[] = [
  "blocker",
  "banish",
  "rush",
  "rushCharacter",
  "doubleAttack",
  "unblockable",
];

for (const keyword of allowlistedKeywordGrantCases) {
  test(`conditional continuous keyword grant adds computed ${keyword} only while true and live`, () => {
    const trueState = createState();
    const trueP1 = must(trueState.players[p1], "true p1 state");
    trueP1.characters = [withCharacter(p1, 0)];
    const trueSource = must(trueP1.characters[0], "true source");
    addTrashMarker(trueState, p1);
    trueState.continuousEffects = [
      continuousKeywordEffectRecord(trueState, keyword, {
        source: trueSource,
        condition: { type: "trashCount", player: "self", op: "gte", value: 1 },
      }),
    ];
    const sourceBefore = structuredClone(trueSource);
    const manifestBefore = structuredClone(
      must(trueState.cardManifest.cards[trueSource.cardId], "manifest card"),
    );
    const trueHash = hashCanonicalStateValue(trueState);
    const trueJournal = structuredClone(trueState.eventJournal);

    const trueView = computeView(trueState);

    assert.equal(
      trueView.cards[trueSource.instanceId]?.keywords.includes(keyword),
      true,
    );
    assert.deepEqual(trueSource, sourceBefore);
    assert.deepEqual(
      trueState.cardManifest.cards[trueSource.cardId],
      manifestBefore,
    );
    assert.equal(hashCanonicalStateValue(trueState), trueHash);
    assert.deepEqual(trueState.eventJournal, trueJournal);

    const falseState = createState();
    const falseP1 = must(falseState.players[p1], "false p1 state");
    falseP1.characters = [withCharacter(p1, 0)];
    const falseSource = must(falseP1.characters[0], "false source");
    falseState.continuousEffects = [
      continuousKeywordEffectRecord(falseState, keyword, {
        source: falseSource,
        condition: { type: "trashCount", player: "self", op: "gte", value: 1 },
      }),
    ];
    const falseHash = hashCanonicalStateValue(falseState);
    const falseJournal = structuredClone(falseState.eventJournal);

    const falseView = computeView(falseState);

    assert.equal(
      falseView.cards[falseSource.instanceId]?.keywords.includes(keyword),
      false,
    );
    assert.equal(hashCanonicalStateValue(falseState), falseHash);
    assert.deepEqual(falseState.eventJournal, falseJournal);

    const staleState = createState();
    const staleP1 = must(staleState.players[p1], "stale p1 state");
    staleP1.characters = [withCharacter(p1, 0)];
    const staleSource = must(staleP1.characters[0], "stale source");
    addTrashMarker(staleState, p1);
    staleState.continuousEffects = [
      continuousKeywordEffectRecord(staleState, keyword, {
        source: staleSource,
        condition: { type: "trashCount", player: "self", op: "gte", value: 1 },
      }),
    ];
    staleSource.cardId = toCardId("char-alt");
    const staleHash = hashCanonicalStateValue(staleState);
    const staleJournal = structuredClone(staleState.eventJournal);

    const staleView = computeView(staleState);

    assert.equal(
      staleView.cards[staleSource.instanceId]?.keywords.includes(keyword),
      false,
    );
    assert.equal(hashCanonicalStateValue(staleState), staleHash);
    assert.deepEqual(staleState.eventJournal, staleJournal);
  });
}

test("inactive whileSourceOnField keyword grant with source-dependent condition disappears", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  p1State.characters = [withCharacter(p1, 0)];
  const source = must(p1State.characters[0], "source");
  state.continuousEffects = [
    continuousKeywordEffectRecord(state, "blocker", {
      source,
      id: "inactive-attached-don-condition-keyword-grant",
      condition: {
        type: "attachedDonCount",
        target: { type: "self" },
        op: "gte",
        value: 0,
      },
    }),
  ];
  source.cardId = toCardId("char-alt");

  const view = computeView(state);

  assert.equal(
    view.cards[source.instanceId]?.keywords.includes("blocker"),
    false,
  );
});

test("attached DON count condition controls reusable keyword grants", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  p1State.characters = [withCharacter(p1, 0)];
  const source = must(p1State.characters[0], "source");
  state.continuousEffects = [
    continuousKeywordEffectRecord(state, "rush", {
      source,
      condition: {
        type: "attachedDonCount",
        target: { type: "self" },
        op: "gte",
        value: 1,
      },
    }),
  ];

  const withoutDonView = computeView(state);
  source.attachedDon = [must(p1State.donDeck[0], "attached DON").instanceId];
  const withDonView = computeView(state);

  assert.equal(
    withoutDonView.cards[source.instanceId]?.keywords.includes("rush"),
    false,
  );
  assert.equal(
    withDonView.cards[source.instanceId]?.keywords.includes("rush"),
    true,
  );
});

test("conditional blocker grant contributes to computed canBlock without printed keyword mutation", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  state.turn.phase = "main";
  state.turn.globalTurn = 3;
  state.turn.turnPlayerId = p1;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  p2State.characters = [withCharacter(p2, 0)];
  const defender = must(p2State.characters[0], "defender character");
  addTrashMarker(state, p2);
  state.battle = {
    attacker: battleRef(p1State.leader),
    originalTarget: battleRef(p2State.leader),
    currentTarget: battleRef(p2State.leader),
    step: "block",
    damageCount: 1,
  };
  state.continuousEffects = [
    continuousKeywordEffectRecord(state, "blocker", {
      source: defender,
      condition: { type: "trashCount", player: "self", op: "gte", value: 1 },
    }),
  ];

  const view = computeView(state);

  assert.equal(view.cards[defender.instanceId]?.canBlock, true);
  assert.deepEqual(
    must(state.cardManifest.cards[defender.cardId], "defender manifest")
      .printedKeywords,
    [],
  );
});

test("unblockable attacker suppresses computed blocker eligibility", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  state.turn.phase = "main";
  state.turn.globalTurn = 3;
  state.turn.turnPlayerId = p1;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
  p2State.characters = [withCharacter(p2, 0)];
  const defender = must(p2State.characters[0], "defender character");
  state.battle = {
    attacker: battleRef(p1State.leader),
    originalTarget: battleRef(p2State.leader),
    currentTarget: battleRef(p2State.leader),
    step: "block",
    damageCount: 1,
  };
  state.continuousEffects = [
    continuousKeywordEffectRecord(state, "blocker", {
      source: defender,
    }),
    continuousKeywordEffectRecord(state, "unblockable", {
      source: p1State.leader,
      id: "unblockable-attacker",
    }),
  ];

  const view = computeView(state);

  assert.equal(view.cards[defender.instanceId]?.canBlock, false);
  assert.equal(
    view.cards[p1State.leader.instanceId]?.keywords.includes("unblockable"),
    true,
  );
});

test("unsupported conditional keyword grant conditions fail closed without mutation or events", () => {
  const unsupportedCondition = createState();
  const conditionP1 = must(
    unsupportedCondition.players[p1],
    "condition p1 state",
  );
  conditionP1.characters = [withCharacter(p1, 0)];
  const conditionSource = must(conditionP1.characters[0], "condition source");
  unsupportedCondition.continuousEffects = [
    continuousKeywordEffectRecord(unsupportedCondition, "blocker", {
      source: conditionSource,
      id: "unsupported-custom-condition-keyword-grant",
      condition: { type: "custom", check: "private-state" },
    }),
  ];
  const unsupportedConditionBefore = structuredClone(unsupportedCondition);
  const unsupportedConditionHash =
    hashCanonicalStateValue(unsupportedCondition);

  assert.throws(
    () => computeView(unsupportedCondition),
    /unsupported continuous/i,
  );
  assert.deepEqual(unsupportedCondition, unsupportedConditionBefore);
  assert.equal(
    hashCanonicalStateValue(unsupportedCondition),
    unsupportedConditionHash,
  );
});
