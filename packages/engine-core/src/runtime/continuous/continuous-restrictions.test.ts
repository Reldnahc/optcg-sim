import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  EffectDefinition,
  MatchCardManifest,
  MatchId,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import { createInitialState } from "../../setup/initial-state.js";
import { computeView } from "../../view/compute-view.js";

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
  cost?: number;
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
  ...(params.cost === undefined ? {} : { cost: params.cost }),
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
  ...(params.power === undefined ? {} : { power: params.power }),
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
    [toCardId("char-rush")]: resolvedCard({
      cardId: toCardId("char-rush"),
      category: "character",
      power: 3000,
      printedKeywords: ["rush"],
    }),
    [toCardId("char-vanilla")]: resolvedCard({
      cardId: toCardId("char-vanilla"),
      category: "character",
      power: 3000,
    }),
    [toCardId("don-1")]: resolvedCard({
      cardId: toCardId("don-1"),
      category: "don",
    }),
  },
});

const createState = () =>
  createInitialState({
    matchId: toMatchId("match-continuous-restrictions"),
    firstPlayerId: p1,
    rngSeed: "seed-continuous-restrictions",
    playerOrder: [p1, p2],
    leaderCardIds: {
      [p1]: toCardId("leader-red"),
      [p2]: toCardId("leader-blue"),
    },
    leaderLifeCounts: { [p1]: 0, [p2]: 0 },
    deckCardIds: {
      [p1]: [
        "char-rush",
        "char-vanilla",
        "char-rush",
        "char-vanilla",
        "char-rush",
      ].map(toCardId),
      [p2]: [
        "char-vanilla",
        "char-rush",
        "char-vanilla",
        "char-rush",
        "char-vanilla",
      ].map(toCardId),
    },
    donDeckCardIds: {
      [p1]: ["don-1", "don-1"].map(toCardId),
      [p2]: ["don-1", "don-1"].map(toCardId),
    },
    cardManifest: createManifest(),
    shuffleDecks: false,
  });

const withCharacter = (
  playerId: PlayerId,
  cardId: CardId,
  index: number,
  state: CardInstance["state"] = "active",
): CardInstance => ({
  instanceId:
    `${playerId}:char:${String(index)}:${cardId}` as CardInstance["instanceId"],
  cardId,
  owner: playerId,
  controller: playerId,
  zone: { zone: "characterArea", playerId, slot: "character", index },
  state,
  attachedDon: [],
});

const setMainTurnAfterFirstTurn = (
  state: ReturnType<typeof createState>,
): void => {
  state.turn.phase = "main";
  state.turn.turnPlayerId = p1;
  state.turn.globalTurn = 3;
  state.turn.playerTurnCounts[p1] = 2;
  state.turn.playerTurnCounts[p2] = 1;
};

const cannotAttackDefinition = (cardId: CardId): EffectDefinition => ({
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: "perm:cannot-attack" as EffectDefinition["effects"][number]["id"],
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "cannotAttack",
        target: { type: "self" },
        duration: { type: "whileSourceOnField" },
      },
    },
  ],
  metadata: {
    sourceTextHash: "source-hash",
    rulesVersion: "r1",
    effectDefinitionsVersion: "fixture",
    tested: true,
    reviewer: "reviewer",
  },
});

const installPermanentDslCandidate = (
  state: ReturnType<typeof createState>,
  source: CardInstance,
): void => {
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "source card"),
    support: {
      cardId: source.cardId,
      status: "implemented-dsl",
      effectDefinitionId: "def:perm:cannot-attack",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitions = {
    "def:perm:cannot-attack": cannotAttackDefinition(source.cardId),
  };
};

const allCostThreeOrFourCannotAttackDefinition = (
  cardId: CardId,
): EffectDefinition => ({
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: "perm:any-player-cost-attack-restriction" as EffectDefinition["effects"][number]["id"],
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "cannotAttack",
        target: {
          type: "all",
          player: "anyPlayer",
          zone: "characterArea",
          filter: {
            categories: ["character"],
            anyOf: [
              { cost: { op: "eq", value: 3 } },
              { cost: { op: "eq", value: 4 } },
            ],
          },
        },
        duration: { type: "whileSourceOnField" },
      },
    },
  ],
  metadata: {
    sourceTextHash: "source-hash",
    rulesVersion: "r1",
    effectDefinitionsVersion: "fixture",
    tested: true,
    reviewer: "reviewer",
  },
});

test.each([
  ["leader", "leader-red"],
  ["character", "char-rush"],
] as const)(
  "derived DSL permanent self cannotAttack restriction disables %s attacks",
  (_category, cardIdText) => {
    const state = createState();
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    setMainTurnAfterFirstTurn(state);
    p2State.characters = [
      withCharacter(p2, toCardId("char-vanilla"), 0, "rested"),
    ];
    const source =
      cardIdText === "leader-red"
        ? p1State.leader
        : withCharacter(p1, toCardId(cardIdText), 0);
    if (source.zone.zone === "characterArea") {
      p1State.characters = [source];
    }
    installPermanentDslCandidate(state, source);

    const view = computeView(state);

    assert.deepEqual(view.legalAttackTargets[source.instanceId], []);
    assert.deepEqual(view.cards[source.instanceId]?.restrictions, [
      "cannot-attack",
    ]);
  },
);

test("derived DSL any-player cost-filtered cannotAttack restriction applies to both fields", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  setMainTurnAfterFirstTurn(state);

  state.cardManifest.cards[toCardId("char-cost-3")] = resolvedCard({
    cardId: toCardId("char-cost-3"),
    category: "character",
    cost: 3,
    power: 3000,
  });
  state.cardManifest.cards[toCardId("char-cost-4")] = resolvedCard({
    cardId: toCardId("char-cost-4"),
    category: "character",
    cost: 4,
    power: 4000,
  });
  state.cardManifest.cards[toCardId("char-cost-5")] = resolvedCard({
    cardId: toCardId("char-cost-5"),
    category: "character",
    cost: 5,
    power: 5000,
  });

  const source = p1State.leader;
  const costThree = withCharacter(p1, toCardId("char-cost-3"), 0);
  const costFive = withCharacter(p1, toCardId("char-cost-5"), 1);
  const opponentCostFour = withCharacter(p2, toCardId("char-cost-4"), 0);
  p1State.characters = [costThree, costFive];
  p2State.characters = [opponentCostFour];
  state.cardManifest.effectDefinitions = {
    "def:perm:any-player-cost-attack-restriction":
      allCostThreeOrFourCannotAttackDefinition(source.cardId),
  };
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "source card"),
    support: {
      cardId: source.cardId,
      status: "implemented-dsl",
      effectDefinitionId: "def:perm:any-player-cost-attack-restriction",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };

  const view = computeView(state);

  assert.deepEqual(view.legalAttackTargets[costThree.instanceId], []);
  assert.notDeepEqual(view.legalAttackTargets[costFive.instanceId], []);
  assert.deepEqual(view.cards[costThree.instanceId]?.restrictions, [
    "cannot-attack",
  ]);
  assert.deepEqual(view.cards[opponentCostFour.instanceId]?.restrictions, [
    "cannot-attack",
  ]);
});
