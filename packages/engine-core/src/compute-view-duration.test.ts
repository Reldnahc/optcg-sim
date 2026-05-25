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
}): ResolvedCard =>
  ({
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
    ...(params.power !== undefined ? { power: params.power } : {}),
  }) satisfies ResolvedCard;

const createManifest = (): MatchCardManifest => {
  const cards = {
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
  } as MatchCardManifest["cards"];

  return {
    manifestHash: "manifest-hash",
    source: "manual-test",
    cardDataVersion: "fixture",
    effectDefinitionsVersion: "fixture",
    customHandlerVersion: "fixture",
    banlistVersion: "fixture",
    createdAt: "2026-05-04T00:00:00.000Z",
    cards,
  };
};

const createState = () =>
  createInitialState({
    matchId: toMatchId("match-compute-view-duration-1"),
    firstPlayerId: p1,
    rngSeed: "seed-compute-view-duration-1",
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

const continuousPowerEffectRecord = (
  state: ReturnType<typeof createState>,
  options: {
    id: string;
    source?: CardInstance;
    duration: ContinuousEffectRecord["duration"];
  },
): ContinuousEffectRecord => {
  const source = options.source ?? must(state.players[p1], "p1 state").leader;
  return {
    id: options.id,
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
      category: source.zone.zone === "leaderArea" ? "leader" : "character",
      colors: ["red"],
      power: 5000,
      keywords: [],
    },
    controller: p1,
    modifier: {
      layer: "powerAdd",
      target: { type: "self" },
      operation: { type: "addPower", value: 1000 },
    },
    duration: options.duration,
    createdBy: { type: "ruleProcess", name: "compute-view-duration-test" },
    createdAtStateSeq: state.seq,
  };
};

test("thisBattle continuous modifiers do nothing outside battle", () => {
  const state = createState();
  const p1State = must(state.players[p1], "p1 state");
  p1State.leader.attachedDon = ["p1:don:1" as CardInstance["instanceId"]];
  state.turn.phase = "main";
  state.turn.turnPlayerId = p1;
  state.continuousEffects = [
    continuousPowerEffectRecord(state, {
      id: "outside-battle-this-battle-power",
      duration: { type: "thisBattle" },
    }),
  ];

  const view = computeView(state);

  assert.equal(view.cards[p1State.leader.instanceId]?.currentPower, 6000);
});
