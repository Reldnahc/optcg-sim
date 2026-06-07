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
  power?: number;
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
    ...(params.category === "don" ? {} : { cost: 1 }),
    ...(params.power === undefined ? {} : { power: params.power }),
  } satisfies ResolvedCard;
  return base;
};

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
    matchId: toMatchId("match-effect-runtime-continuous-dynamic"),
    firstPlayerId: p1,
    rngSeed: "seed-effect-runtime-continuous-dynamic",
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

const reviewedPermanentDefinition = (cardId: CardId): EffectDefinition => ({
  cardId,
  implementationStatus: "implemented-dsl",
  effects: [
    {
      id: "perm:distinct-names" as EffectDefinition["effects"][number]["id"],
      category: "permanent",
      trigger: { type: "permanent" },
      condition: { type: "yourTurn" },
      effect: {
        type: "modifyPower",
        target: { type: "self" },
        value: {
          type: "countDistinctMatchingFieldNames",
          player: "self",
          zone: "characterArea",
          filter: { categories: ["character"], custom: "differentNames" },
          multiplier: 1000,
        },
        duration: {
          type: "whileConditionTrue",
          condition: { type: "yourTurn" },
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

test("derived DSL dynamic power counts distinct matching field names", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1");
  const source = withCharacter(p1, toCardId("distinct-source"), 0);
  const alpha = withCharacter(p1, toCardId("distinct-alpha"), 1);
  const beta = withCharacter(p1, toCardId("distinct-beta"), 2);
  const alphaDuplicate = withCharacter(p1, toCardId("distinct-alpha"), 3);
  p1State.characters = [source, alpha, beta, alphaDuplicate];
  for (const card of p1State.characters) {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
      power: 1000,
    });
  }
  state.cardManifest.cards[source.cardId] = {
    ...must(state.cardManifest.cards[source.cardId], "source card"),
    support: {
      cardId: source.cardId,
      status: "implemented-dsl",
      effectDefinitionId: "def:perm:distinct",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitions = {
    "def:perm:distinct": reviewedPermanentDefinition(source.cardId),
  };

  const view = computeView(state);

  assert.equal(view.cards[source.instanceId]?.currentPower, 4000);
});
