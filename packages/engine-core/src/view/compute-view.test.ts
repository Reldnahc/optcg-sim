import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  ContinuousEffectRecord,
  MatchCardManifest,
  MatchId,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import { hashCanonicalStateValue } from "../state/canonical-state.js";
import { computeView } from "./compute-view.js";
import { createInitialState } from "../setup/initial-state.js";

const toMatchId = (value: string): MatchId => value as MatchId;
const toPlayerId = (value: string): PlayerId => value as PlayerId;
const toCardId = (value: string): CardId => value as CardId;

const p1 = toPlayerId("p1");
const p2 = toPlayerId("p2");

const must = <T>(value: T | undefined, label: string): T => {
  assert.ok(value !== undefined, `missing ${label}`);
  return value;
};
type EngineInternalBattleState = NonNullable<
  ReturnType<typeof createState>["battle"]
> & { counterPower?: number; damageProcess?: unknown };

const resolvedCard = (params: {
  cardId: CardId;
  category: "leader" | "character" | "don";
  power?: number;
  printedKeywords?: ResolvedCard["printedKeywords"];
  types?: string[];
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
    types: params.types ?? [],
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
      types: ["Test Pirates"],
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

const battleRef = (card: CardInstance) => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId: card.controller,
});

const setMainTurnAfterFirstTurn = (
  state: ReturnType<typeof createState>,
  turnPlayerId: PlayerId = p1,
) => {
  state.turn.phase = "main";
  state.turn.turnPlayerId = turnPlayerId;
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
};

const continuousPowerEffectRecord = (
  state: ReturnType<typeof createState>,
  options?: {
    id?: string;
    source?: CardInstance;
    modifier?: ContinuousEffectRecord["modifier"];
    duration?: ContinuousEffectRecord["duration"];
    condition?: ContinuousEffectRecord["condition"];
  },
): ContinuousEffectRecord => {
  const source = options?.source ?? must(state.players[p1], "p1 state").leader;
  const sourceCategory =
    source.zone.zone === "leaderArea" ? "leader" : "character";
  const record: ContinuousEffectRecord = {
    id: options?.id ?? "continuous-power-1000",
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
      power: 5000,
      keywords: [],
    },
    controller: p1,
    modifier: options?.modifier ?? {
      layer: "powerAdd",
      target: { type: "self" },
      operation: { type: "addPower", value: 1000 },
    },
    duration: options?.duration ?? { type: "permanent" },
    createdBy: { type: "ruleProcess", name: "compute-view-test" },
    createdAtStateSeq: state.seq,
  };
  if (options?.condition !== undefined) {
    record.condition = options.condition;
  }
  return record;
};

const assertRejectsUnsupportedContinuousEffect = (
  effect: ContinuousEffectRecord,
) => {
  const state = createState();
  state.continuousEffects = [effect];

  assert.throws(() => computeView(state), {
    name: "TypeError",
    message: `Unsupported continuous effect ${effect.id}: only unconditional self +1000 powerAdd modifiers with permanent or whileSourceOnField duration are supported by computeView.`,
  });
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

test("applies permanent self +1000 powerAdd continuous modifier only to source current power", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  p1State.characters = [withCharacter(p1, toCardId("char-vanilla"), 0)];
  const sourceCardBefore = structuredClone(p1State.leader);
  const manifestCardBefore = structuredClone(
    must(state.cardManifest.cards[p1State.leader.cardId], "source manifest"),
  );
  const beforeHash = hashCanonicalStateValue(state);
  const eventJournalBefore = structuredClone(state.eventJournal);

  state.continuousEffects = [
    continuousPowerEffectRecord(state, {
      id: "supported-permanent-power",
      duration: { type: "permanent" },
    }),
  ];

  const stateWithRecordHash = hashCanonicalStateValue(state);
  const firstView = computeView(state);
  const secondView = computeView(state);
  const sourceView = must(
    firstView.cards[p1State.leader.instanceId],
    "source leader view",
  );
  const p1Character = must(p1State.characters[0], "p1 character");

  assert.equal(sourceView.basePower, 5000);
  assert.equal(sourceView.currentPower, 6000);
  assert.equal(firstView.cards[p1Character.instanceId]?.currentPower, 3000);
  assert.equal(firstView.cards[p2State.leader.instanceId]?.currentPower, 5000);
  assert.equal(secondView.cards[p1State.leader.instanceId]?.currentPower, 6000);
  assert.deepEqual(p1State.leader, sourceCardBefore);
  assert.deepEqual(
    state.cardManifest.cards[p1State.leader.cardId],
    manifestCardBefore,
  );
  assert.equal(hashCanonicalStateValue(state), stateWithRecordHash);
  assert.notEqual(beforeHash, stateWithRecordHash);
  assert.deepEqual(state.eventJournal, eventJournalBefore);
});

test("basePowerSet changes computed base before powerAdd without mutating manifest power", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  p1State.characters = [withCharacter(p1, toCardId("char-vanilla"), 0)];
  const target = must(p1State.characters[0], "target character");
  const manifestBefore = structuredClone(
    must(state.cardManifest.cards[target.cardId], "target manifest"),
  );
  state.continuousEffects = [
    continuousPowerEffectRecord(state, {
      id: "base-power-set",
      modifier: {
        layer: "basePowerSet",
        target: {
          type: "all",
          zone: "characterArea",
          player: "self",
          filter: { categories: ["character"], typesAny: ["Test Pirates"] },
        },
        operation: { type: "setBasePower", value: 5000 },
      },
      duration: { type: "whileSourceOnField" },
    }),
    continuousPowerEffectRecord(state, {
      id: "power-add-after-base-set",
      source: target,
      modifier: {
        layer: "powerAdd",
        target: { type: "self" },
        operation: { type: "addPower", value: 2000 },
      },
      duration: { type: "thisTurn" },
    }),
  ];

  const view = computeView(state);

  assert.equal(view.cards[target.instanceId]?.basePower, 5000);
  assert.equal(view.cards[target.instanceId]?.currentPower, 7000);
  assert.deepEqual(state.cardManifest.cards[target.cardId], manifestBefore);
});

test("applies whileSourceOnField self +1000 powerAdd modifier while leader or character source remains live", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  p1State.characters = [withCharacter(p1, toCardId("char-vanilla"), 0)];
  const source = must(p1State.characters[0], "p1 source character");
  state.continuousEffects = [
    continuousPowerEffectRecord(state, {
      duration: { type: "whileSourceOnField" },
    }),
    continuousPowerEffectRecord(state, {
      source,
      duration: { type: "whileSourceOnField" },
    }),
  ];
  const after = computeView(state);
  assert.equal(after.cards[p1State.leader.instanceId]?.currentPower, 6000);
  assert.equal(after.cards[source.instanceId]?.currentPower, 4000);
});

test("omits stale or identity-changed whileSourceOnField modifier without mutating canonical state", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  p1State.characters = [withCharacter(p1, toCardId("char-vanilla"), 0)];
  const source = must(p1State.characters[0], "p1 original source character");
  state.continuousEffects = [
    continuousPowerEffectRecord(state, {
      source,
      duration: { type: "whileSourceOnField" },
    }),
  ];
  p1State.characters = [];
  const beforeHash = hashCanonicalStateValue(state);
  const eventJournalBefore = structuredClone(state.eventJournal);
  const continuousEffectsBefore = structuredClone(state.continuousEffects);
  assert.equal(computeView(state).cards[source.instanceId], undefined);
  assert.deepEqual(state.continuousEffects, continuousEffectsBefore);
  assert.equal(hashCanonicalStateValue(state), beforeHash);
  assert.deepEqual(state.eventJournal, eventJournalBefore);
  const identityState = createState();
  const identityP1 = must(identityState.players[p1], "identity p1 state");
  identityP1.characters = [withCharacter(p1, toCardId("char-vanilla"), 0)];
  const identitySource = must(identityP1.characters[0], "identity source");
  identityState.continuousEffects = [
    continuousPowerEffectRecord(identityState, {
      source: identitySource,
      duration: { type: "whileSourceOnField" },
    }),
  ];
  identitySource.cardId = toCardId("char-rush");
  assert.equal(
    computeView(identityState).cards[identitySource.instanceId]?.currentPower,
    3000,
  );
});

const unsupportedContinuousEffectCases: Array<{
  label: string;
  createEffect: (
    state: ReturnType<typeof createState>,
  ) => ContinuousEffectRecord;
}> = [
  {
    label: "base cost set modifier",
    createEffect: (state) =>
      continuousPowerEffectRecord(state, {
        id: "unsupported-base-cost-set",
        modifier: {
          layer: "baseCostSet",
          target: { type: "self" },
          operation: { type: "setBaseCost", value: 1 },
        },
      }),
  },
  {
    label: "keyword modifier with unsupported target",
    createEffect: (state) =>
      continuousPowerEffectRecord(state, {
        id: "unsupported-keyword-add",
        modifier: {
          layer: "keywordAdd",
          target: { type: "myLeader" },
          operation: { type: "addKeyword", keyword: "unblockable" },
        },
      }),
  },
  {
    label: "protection modifier",
    createEffect: (state) => {
      const base = continuousPowerEffectRecord(state, {
        id: "unsupported-protection",
      });
      return {
        ...base,
        modifier: {
          layer: "protection",
          target: { type: "self" },
          operation: {
            type: "protection",
            protection: { process: "ko", source: base.source },
          },
        },
      };
    },
  },
  {
    label: "non-self target",
    createEffect: (state) =>
      continuousPowerEffectRecord(state, {
        id: "unsupported-non-self-target",
        modifier: {
          layer: "powerAdd",
          target: { type: "myLeader" },
          operation: { type: "addPower", value: 1000 },
        },
      }),
  },
  {
    label: "conditional modifier",
    createEffect: (state) =>
      continuousPowerEffectRecord(state, {
        id: "unsupported-condition",
        condition: { type: "yourTurn" },
      }),
  },
  {
    label: "unsupported duration",
    createEffect: (state) =>
      continuousPowerEffectRecord(state, {
        id: "unsupported-duration",
        duration: { type: "thisAction" },
      }),
  },
];

for (const { label, createEffect } of unsupportedContinuousEffectCases) {
  test(`fails closed for unsupported continuous effect ${label}`, () => {
    const state = createState();
    assertRejectsUnsupportedContinuousEffect(createEffect(state));
  });
}

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
  setMainTurnAfterFirstTurn(state);
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
  setMainTurnAfterFirstTurn(state);
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
  setMainTurnAfterFirstTurn(state);
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

test("supports implemented-dsl combat body with supported keywords and no effect metadata", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  setMainTurnAfterFirstTurn(state);
  p1State.characters = [
    withCharacter(p1, toCardId("char-rush"), 0, { turnPlayed: 3 }),
  ];
  p2State.characters = [withCharacter(p2, toCardId("char-vanilla"), 0)];
  const manifest = {
    ...state.cardManifest,
    cards: { ...state.cardManifest.cards },
  };
  manifest.cards[toCardId("char-rush")] = {
    ...must(manifest.cards[toCardId("char-rush")], "char-rush"),
    support: {
      ...must(manifest.cards[toCardId("char-rush")], "char-rush").support,
      status: "implemented-dsl",
    },
  };
  state.cardManifest = manifest;

  const view = computeView(state);
  assert.deepEqual(
    view.legalAttackTargets[
      must(p1State.characters[0], "p1 attacker").instanceId
    ],
    [p2State.leader.instanceId],
  );
});

test("implemented-dsl leader with non-combat effect definition can attack normally", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  setMainTurnAfterFirstTurn(state);
  p1State.leader.state = "active";
  const manifest = {
    ...state.cardManifest,
    cards: { ...state.cardManifest.cards },
  };
  manifest.cards[toCardId("leader-red")] = {
    ...must(manifest.cards[toCardId("leader-red")], "leader-red"),
    effectText: "[Activate: Main] Draw 1 card.",
    support: {
      ...must(manifest.cards[toCardId("leader-red")], "leader-red").support,
      status: "implemented-dsl",
      effectDefinitionId: "leader-red:activate-main",
    },
  };
  manifest.effectDefinitions = {
    "leader-red:activate-main": {
      cardId: toCardId("leader-red"),
      implementationStatus: "implemented-dsl",
      effects: [
        {
          id: "leader-red:activate-main:1" as never,
          category: "activate",
          trigger: { type: "activateMain" },
          oncePerTurn: true,
          sourcePresencePolicy: "mustRemainInSameZone",
          effect: { type: "draw", count: 1, player: "self" },
        },
      ],
      metadata: {
        sourceTextHash: "source-hash",
        rulesVersion: "r1",
        effectDefinitionsVersion: "fixture",
        tested: true,
      },
    },
  };
  state.cardManifest = manifest;

  const view = computeView(state);
  assert.deepEqual(view.legalAttackTargets[p1State.leader.instanceId], [
    p2State.leader.instanceId,
  ]);
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
  setMainTurnAfterFirstTurn(state);
  p2State.characters = [withCharacter(p2, toCardId("char-blocker"), 0)];
  state.battle = {
    attacker: battleRef(must(state.players[p1], "p1 state").leader),
    originalTarget: battleRef(p2State.leader),
    currentTarget: battleRef(p2State.leader),
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
  setMainTurnAfterFirstTurn(state);
  p1State.characters = [withCharacter(p1, toCardId("char-blocker"), 0)];
  p2State.characters = [
    withCharacter(p2, toCardId("char-blocker"), 0, { state: "rested" }),
    withCharacter(p2, toCardId("char-vanilla"), 1),
  ];
  state.battle = {
    attacker: battleRef(p1State.leader),
    originalTarget: battleRef(p2State.leader),
    currentTarget: battleRef(p2State.leader),
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
  setMainTurnAfterFirstTurn(state);
  p2State.characters = [withCharacter(p2, toCardId("char-blocker"), 0)];
  state.battle = {
    attacker: battleRef(p1State.leader),
    originalTarget: battleRef(p2State.leader),
    currentTarget: battleRef(p2State.leader),
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

test("battle counter power contributes only during active battle", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  setMainTurnAfterFirstTurn(state);
  p1State.characters = [withCharacter(p1, toCardId("char-vanilla"), 0)];
  p2State.characters = [
    withCharacter(p2, toCardId("char-vanilla"), 0, { state: "rested" }),
  ];
  const target = must(p2State.characters[0], "target");
  const battleWithCounter: EngineInternalBattleState = {
    attacker: battleRef(must(p1State.characters[0], "attacker")),
    originalTarget: battleRef(target),
    currentTarget: battleRef(target),
    step: "counter",
    damageCount: 1,
    counterPower: 2000,
  };
  state.battle = battleWithCounter;

  const duringBattle = computeView(state);
  assert.equal(duringBattle.cards[target.instanceId]?.currentPower, 5000);

  delete state.battle;
  const afterBattle = computeView(state);
  assert.equal(afterBattle.cards[target.instanceId]?.currentPower, 3000);
});

test("composes attached DON!! and self continuous power during controller turn without mutating state", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  state.turn.phase = "main";
  state.turn.turnPlayerId = p1;
  p1State.leader.attachedDon = ["p1:don:1" as CardInstance["instanceId"]];
  p1State.characters = [withCharacter(p1, toCardId("char-vanilla"), 0)];
  const p1Character = must(p1State.characters[0], "p1 character");
  p1Character.attachedDon = [
    "p1:don:2" as CardInstance["instanceId"],
    "p1:don:3" as CardInstance["instanceId"],
  ];
  state.continuousEffects = [
    continuousPowerEffectRecord(state, {
      id: "leader-continuous-power",
      source: p1State.leader,
    }),
  ];
  const beforeHash = hashCanonicalStateValue(state);

  const firstView = computeView(state);
  const secondView = computeView(state);

  assert.equal(firstView.cards[p1State.leader.instanceId]?.currentPower, 7000);
  assert.equal(secondView.cards[p1State.leader.instanceId]?.currentPower, 7000);
  assert.equal(firstView.cards[p1Character.instanceId]?.currentPower, 5000);
  assert.equal(firstView.cards[p2State.leader.instanceId]?.currentPower, 5000);
  assert.equal(hashCanonicalStateValue(state), beforeHash);

  state.turn.turnPlayerId = p2;
  const opponentTurnView = computeView(state);
  assert.equal(
    opponentTurnView.cards[p1State.leader.instanceId]?.currentPower,
    6000,
  );
});

test("composes battle counter and self continuous power only for current target", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  setMainTurnAfterFirstTurn(state);
  p1State.characters = [withCharacter(p1, toCardId("char-vanilla"), 0)];
  p2State.characters = [
    withCharacter(p2, toCardId("char-vanilla"), 0, { state: "rested" }),
    withCharacter(p2, toCardId("char-vanilla"), 1),
  ];
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  const unrelatedDefender = must(p2State.characters[1], "unrelated defender");
  state.continuousEffects = [
    continuousPowerEffectRecord(state, {
      id: "target-continuous-power",
      source: target,
      duration: { type: "whileSourceOnField" },
    }),
  ];
  const battleWithCounter: EngineInternalBattleState = {
    attacker: battleRef(attacker),
    originalTarget: battleRef(target),
    currentTarget: battleRef(target),
    step: "counter",
    damageCount: 1,
    counterPower: 2000,
  };
  state.battle = battleWithCounter;

  const firstView = computeView(state);
  const secondView = computeView(state);

  assert.equal(firstView.cards[target.instanceId]?.currentPower, 6000);
  assert.equal(secondView.cards[target.instanceId]?.currentPower, 6000);
  assert.equal(
    firstView.cards[unrelatedDefender.instanceId]?.currentPower,
    3000,
  );
  assert.equal(firstView.cards[attacker.instanceId]?.currentPower, 3000);
});

test("active defender printed blocker has canBlock false for stale battle refs", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  const p2State = must(state.players[p2], "p2 state");
  setMainTurnAfterFirstTurn(state);
  p2State.characters = [withCharacter(p2, toCardId("char-blocker"), 0)];

  state.battle = {
    attacker: {
      instanceId: "stale-attacker" as CardInstance["instanceId"],
      cardId: toCardId("leader-red"),
      playerId: p1,
    },
    originalTarget: battleRef(p2State.leader),
    currentTarget: battleRef(p2State.leader),
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
    attacker: battleRef(p1State.leader),
    originalTarget: battleRef(p2State.leader),
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

test("fails closed for unsupported Double Attack keyword while blocker metadata is supported", () => {
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
