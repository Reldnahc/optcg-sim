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

import { computeView } from "../../view/compute-view.js";
import {
  deriveImplementedDslHandContinuousEffects,
  deriveImplementedDslPermanentContinuousEffects,
} from "./continuous.js";
import { createInitialState } from "../../setup/initial-state.js";

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
  ...(params.cost === undefined ? {} : { cost: params.cost }),
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
    [toCardId("char-cost-source")]: resolvedCard({
      cardId: toCardId("char-cost-source"),
      category: "character",
      cost: 3,
      power: 3000,
    }),
    [toCardId("char-other")]: resolvedCard({
      cardId: toCardId("char-other"),
      category: "character",
      cost: 5,
      power: 5000,
    }),
    [toCardId("don-1")]: resolvedCard({
      cardId: toCardId("don-1"),
      category: "don",
    }),
  },
});

const createState = () =>
  createInitialState({
    matchId: toMatchId("match-effect-runtime-continuous-play-cost"),
    firstPlayerId: p1,
    rngSeed: "seed-effect-runtime-continuous-play-cost",
    playerOrder: [p1, p2],
    leaderCardIds: {
      [p1]: toCardId("leader-red"),
      [p2]: toCardId("leader-blue"),
    },
    leaderLifeCounts: { [p1]: 0, [p2]: 0 },
    deckCardIds: {
      [p1]: [
        "char-cost-source",
        "char-other",
        "char-other",
        "char-other",
        "char-other",
      ].map(toCardId),
      [p2]: [
        "char-other",
        "char-other",
        "char-other",
        "char-other",
        "char-other",
      ].map(toCardId),
    },
    donDeckCardIds: {
      [p1]: ["don-1", "don-1", "don-1"].map(toCardId),
      [p2]: ["don-1", "don-1", "don-1"].map(toCardId),
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

const reviewedHandCostDefinition = (cardId: CardId): EffectDefinition => ({
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: "perm:hand-self-cost" as EffectDefinition["effects"][number]["id"],
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "modifyCost",
        player: "self",
        sourceZone: "hand",
        target: { type: "self" },
        value: -2,
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

const reviewedFilteredHandCostDefinition = (
  cardId: CardId,
): EffectDefinition => ({
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: "perm:filtered-hand-cost" as EffectDefinition["effects"][number]["id"],
      category: "permanent",
      trigger: { type: "permanent" },
      effect: {
        type: "modifyCost",
        player: "self",
        sourceZone: "hand",
        filter: { colorsAny: ["blue"], categories: ["event"] },
        value: -1,
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
  definition: EffectDefinition,
): void => {
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "source card"),
    support: {
      cardId: source.cardId,
      status: "implemented-dsl",
      effectDefinitionId: "def:perm:hand-self-cost",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitions = {
    "def:perm:hand-self-cost": definition,
  };
};

test("hand-only self cost modifiers do not affect this card on the field", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const fieldSource = withCharacter(p1, toCardId("char-cost-source"), 0);
  const handSource: CardInstance = {
    ...withCharacter(p1, toCardId("char-cost-source"), 1),
    instanceId: "p1:hand:0:char-cost-source" as CardInstance["instanceId"],
    zone: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
  };
  p1State.characters = [fieldSource];
  p1State.hand = [handSource];
  p2State.hand = [];
  installPermanentDslCandidate(
    state,
    fieldSource,
    reviewedHandCostDefinition(fieldSource.cardId),
  );

  const view = computeView(state);
  const fieldRecords = deriveImplementedDslPermanentContinuousEffects(state);
  const handCostRecords = deriveImplementedDslHandContinuousEffects(state);

  assert.equal(view.cards[fieldSource.instanceId]?.baseCost, 3);
  assert.equal(view.cards[fieldSource.instanceId]?.currentCost, 3);
  assert.deepEqual(fieldRecords, []);
  assert.equal(handCostRecords.length, 1);
  const handCostRecord = must(handCostRecords[0], "hand cost record");
  assert.equal(handCostRecord.source.instanceId, handSource.instanceId);
  assert.equal(handCostRecord.source.zone?.zone, "hand");
  assert.deepEqual(handCostRecord.modifier.operation, {
    type: "addCost",
    value: -2,
  });
});

test("field-sourced hand cost modifiers support category and color filters", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("char-cost-source"), 0);
  p1State.characters = [source];
  installPermanentDslCandidate(
    state,
    source,
    reviewedFilteredHandCostDefinition(source.cardId),
  );

  const records = deriveImplementedDslPermanentContinuousEffects(state);

  assert.equal(records.length, 1);
  const record = must(records[0], "filtered hand cost record");
  assert.deepEqual(record.modifier, {
    layer: "costAdd",
    target: {
      type: "allMatching",
      zone: "hand",
      player: "self",
      filter: { colorsAny: ["blue"], categories: ["event"] },
    },
    operation: { type: "addCost", value: -1 },
  });
});
