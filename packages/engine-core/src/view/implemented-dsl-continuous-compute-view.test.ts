import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  EffectDefinition,
  EffectDslFieldRemovalProtection,
  MatchCardManifest,
  MatchId,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

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

const resolvedCard = (params: {
  cardId: CardId;
  category: "leader" | "character" | "don";
  name?: string;
  power?: number;
}): ResolvedCard =>
  ({
    cardId: params.cardId,
    language: "en",
    name: params.name ?? String(params.cardId),
    category: params.category,
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
      cardId: params.cardId,
      status: "vanilla-confirmed",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
    ...(params.power !== undefined ? { power: params.power } : {}),
  }) satisfies ResolvedCard;

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
    [toCardId("don-1")]: resolvedCard({
      cardId: toCardId("don-1"),
      category: "don",
    }),
  },
});

const createState = () =>
  createInitialState({
    matchId: toMatchId("match-implemented-dsl-continuous-compute-view"),
    firstPlayerId: p1,
    rngSeed: "seed-implemented-dsl-continuous-compute-view",
    playerOrder: [p1, p2],
    leaderCardIds: {
      [p1]: toCardId("leader-red"),
      [p2]: toCardId("leader-blue"),
    },
    leaderLifeCounts: { [p1]: 0, [p2]: 0 },
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

const withCharacter = (
  playerId: PlayerId,
  cardId: CardId,
  index: number,
): CardInstance => ({
  instanceId:
    `${playerId}:char:${String(index)}:${cardId}` as CardInstance["instanceId"],
  cardId,
  owner: playerId,
  controller: playerId,
  zone: { zone: "characterArea", playerId, slot: "character", index },
  state: "active",
  attachedDon: [],
});

const addTrashMarkers = (
  state: ReturnType<typeof createState>,
  playerId: PlayerId,
  count: number,
): void => {
  const player = must(state.players[playerId], "trash marker player");
  player.trash = Array.from({ length: count }, (_, index) => {
    const cardId = toCardId(
      `trash-marker-${String(playerId)}-${String(index)}`,
    );
    state.cardManifest.cards[cardId] = resolvedCard({
      cardId,
      category: "character",
      power: 1000,
    });
    return {
      instanceId:
        `trash:${String(playerId)}:${String(index)}` as CardInstance["instanceId"],
      cardId,
      owner: playerId,
      controller: playerId,
      zone: { zone: "trash", playerId, slot: "trash", index },
      state: "active" as const,
      attachedDon: [],
    };
  });
};

const reviewedDslProtection = (): EffectDslFieldRemovalProtection => ({
  process: "fieldRemoval",
  fieldRemoval: {
    processFamily: "fieldRemoval",
    classification: "moveFromFieldToTrash",
    sourceKind: "cardEffect",
    sourceControllerRelation: "opponentControlled",
    targetScope: "thisCard",
    exclusions: {
      battleKO: "excluded",
      ruleProcessTrash: "excluded",
      controllerCost: "excluded",
      controllerOwnedEffect: "excluded",
      ambiguousCustomRemoval: "failClosed",
    },
  },
});

const permanentKeywordProtectionDefinition = (
  cardId: CardId,
): EffectDefinition => ({
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: "perm:keyword+protection" as never,
      category: "permanent",
      trigger: { type: "permanent" },
      condition: { type: "trashCount", player: "self", op: "gte", value: 7 },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "giveKeyword",
              target: { type: "self" },
              keyword: "blocker",
              duration: { type: "permanent" },
            },
          },
          {
            connector: "always",
            effect: {
              type: "giveProtection",
              target: { type: "self" },
              protection: reviewedDslProtection(),
              duration: { type: "permanent" },
            },
          },
        ],
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

const mixedPermanentAndOnKODrawDefinition = (
  cardId: CardId,
): EffectDefinition => ({
  ...permanentKeywordProtectionDefinition(cardId),
  effects: [
    ...permanentKeywordProtectionDefinition(cardId).effects,
    {
      id: "onko:draw:1" as never,
      category: "auto",
      trigger: { type: "onKO" },
      sourcePresencePolicy: "resolveFromDestinationZone",
      effect: { type: "draw", count: 1, player: "self" },
    },
  ],
});

const permanentLeaderPowerDefinition = (cardId: CardId): EffectDefinition => ({
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: "perm:leader-power" as never,
      category: "permanent",
      trigger: { type: "permanent" },
      condition: { type: "trashCount", player: "self", op: "gte", value: 19 },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "modifyPower",
        target: { type: "myLeader" },
        value: 1000,
        duration: {
          type: "whileConditionTrue",
          condition: {
            type: "trashCount",
            player: "self",
            op: "gte",
            value: 19,
          },
        },
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

const permanentOpponentTurnBasePowerDefinition = (
  cardId: CardId,
): EffectDefinition => ({
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: "perm:opponent-turn-base-power" as never,
      category: "permanent",
      trigger: { type: "permanent" },
      condition: { type: "opponentTurn" },
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "setBasePower",
              target: {
                type: "all",
                zone: "characterArea",
                player: "self",
                filter: { categories: ["character"], names: ["Ohm"] },
              },
              value: 6000,
              duration: {
                type: "whileConditionTrue",
                condition: { type: "opponentTurn" },
              },
            },
          },
          {
            connector: "always",
            effect: {
              type: "setBasePower",
              target: { type: "self" },
              value: 6000,
              duration: {
                type: "whileConditionTrue",
                condition: { type: "opponentTurn" },
              },
            },
          },
        ],
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

test("reviewed permanent implemented-dsl keyword applies at threshold through computeView", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [source];
  addTrashMarkers(state, p1, 7);
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "source card"),
    support: {
      cardId: source.cardId,
      status: "implemented-dsl",
      effectDefinitionId: "def:perm:compute",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitions = {
    "def:perm:compute": permanentKeywordProtectionDefinition(source.cardId),
  };

  const view = computeView(state);
  assert.equal(
    view.cards[source.instanceId]?.keywords.includes("blocker"),
    true,
  );
});

test("reviewed permanent implemented-dsl keyword does not apply below threshold through computeView", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [source];
  addTrashMarkers(state, p1, 6);
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "source card"),
    support: {
      cardId: source.cardId,
      status: "implemented-dsl",
      effectDefinitionId: "def:perm:compute",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitions = {
    "def:perm:compute": permanentKeywordProtectionDefinition(source.cardId),
  };

  const view = computeView(state);
  assert.equal(
    view.cards[source.instanceId]?.keywords.includes("blocker"),
    false,
  );
});

test("computeView accepts mixed implemented-dsl definition with permanent block plus supported On K.O. draw", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [source];
  addTrashMarkers(state, p1, 7);
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "source card"),
    support: {
      cardId: source.cardId,
      status: "implemented-dsl",
      effectDefinitionId: "def:mixed:compute",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitions = {
    "def:mixed:compute": mixedPermanentAndOnKODrawDefinition(source.cardId),
  };

  const view = computeView(state);
  assert.equal(
    view.cards[source.instanceId]?.keywords.includes("blocker"),
    true,
  );
});

test("reviewed permanent implemented-dsl leader power applies only while trash threshold is true", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [source];
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "source card"),
    support: {
      cardId: source.cardId,
      status: "implemented-dsl",
      effectDefinitionId: "def:perm:leader-power",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitions = {
    "def:perm:leader-power": permanentLeaderPowerDefinition(source.cardId),
  };

  addTrashMarkers(state, p1, 18);
  const belowView = computeView(state);
  addTrashMarkers(state, p1, 19);
  const atThresholdView = computeView(state);

  assert.equal(belowView.cards[p1State.leader.instanceId]?.currentPower, 5000);
  assert.equal(
    atThresholdView.cards[p1State.leader.instanceId]?.currentPower,
    6000,
  );
});

test("reviewed permanent implemented-dsl base power applies to named cards and self only on opponent turn", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("self-source"), 0);
  const namedOhm = withCharacter(p1, toCardId("named-ohm"), 1);
  const unrelated = withCharacter(p1, toCardId("unrelated-character"), 2);
  p1State.characters = [source, namedOhm, unrelated];
  state.cardManifest.cards[source.cardId] = {
    ...resolvedCard({
      cardId: source.cardId,
      category: "character",
      name: "Not Ohm",
      power: 3000,
    }),
    support: {
      cardId: source.cardId,
      status: "implemented-dsl",
      effectDefinitionId: "def:perm:opponent-turn-base-power",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.cards[namedOhm.cardId] = resolvedCard({
    cardId: namedOhm.cardId,
    category: "character",
    name: "Ohm",
    power: 3000,
  });
  state.cardManifest.cards[unrelated.cardId] = resolvedCard({
    cardId: unrelated.cardId,
    category: "character",
    name: "Other",
    power: 3000,
  });
  state.cardManifest.effectDefinitions = {
    "def:perm:opponent-turn-base-power":
      permanentOpponentTurnBasePowerDefinition(source.cardId),
  };

  state.turn.turnPlayerId = p1;
  const ownTurnView = computeView(state);
  state.turn.turnPlayerId = p2;
  const opponentTurnView = computeView(state);

  assert.equal(ownTurnView.cards[source.instanceId]?.currentPower, 3000);
  assert.equal(ownTurnView.cards[namedOhm.instanceId]?.currentPower, 3000);
  assert.equal(opponentTurnView.cards[source.instanceId]?.currentPower, 6000);
  assert.equal(opponentTurnView.cards[namedOhm.instanceId]?.currentPower, 6000);
  assert.equal(
    opponentTurnView.cards[unrelated.instanceId]?.currentPower,
    3000,
  );
});

test("computeView derives permanent records without authorizing unrelated non-permanent blocks", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-vanilla"), 0);
  p1State.characters = [source];
  addTrashMarkers(state, p1, 7);
  const mixed = mixedPermanentAndOnKODrawDefinition(source.cardId);
  mixed.effects.push({
    id: "unsupported:onko:custom" as never,
    category: "auto",
    trigger: { type: "onKO" },
    sourcePresencePolicy: "resolveFromDestinationZone",
    effect: { type: "custom", handler: "unsupported-handler" },
  });
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "source card"),
    support: {
      cardId: source.cardId,
      status: "implemented-dsl",
      effectDefinitionId: "def:mixed:unsupported",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitions = {
    "def:mixed:unsupported": mixed,
  };

  const view = computeView(state);
  assert.equal(
    view.cards[source.instanceId]?.keywords.includes("blocker"),
    true,
  );
});
