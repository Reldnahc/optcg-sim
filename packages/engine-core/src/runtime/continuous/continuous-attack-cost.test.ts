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
    matchId: toMatchId("match-continuous-attack-cost"),
    firstPlayerId: p1,
    rngSeed: "seed-continuous-attack-cost",
    playerOrder: [p1, p2],
    leaderCardIds: {
      [p1]: toCardId("leader-red"),
      [p2]: toCardId("leader-blue"),
    },
    leaderLifeCounts: { [p1]: 0, [p2]: 0 },
    deckCardIds: {
      [p1]: [
        "char-vanilla",
        "char-rush",
        "char-vanilla",
        "char-rush",
        "char-vanilla",
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
  options?: { state?: CardInstance["state"] },
): CardInstance => ({
  instanceId:
    `${playerId}:char:${String(index)}:${cardId}` as CardInstance["instanceId"],
  cardId,
  owner: playerId,
  controller: playerId,
  zone: { zone: "characterArea", playerId, slot: "character", index },
  state: options?.state ?? "active",
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

const continuousPowerEffectRecord = (
  state: ReturnType<typeof createState>,
  source: CardInstance,
): ContinuousEffectRecord => ({
  id: "continuous-attack-cost-test",
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
  controller: source.controller,
  modifier: {
    layer: "powerAdd",
    target: { type: "self" },
    operation: { type: "addPower", value: 1000 },
  },
  duration: { type: "permanent" },
  createdBy: { type: "ruleProcess", name: "continuous-attack-cost-test" },
  createdAtStateSeq: state.seq,
});

test("attackCost restriction keeps attacks legal only when the controller can pay", () => {
  const state = createState();
  const player = must(state.players[p1], "p1");
  const opponent = must(state.players[p2], "p2");
  setMainTurnAfterFirstTurn(state);
  player.characters = [withCharacter(p1, toCardId("char-rush"), 0)];
  opponent.characters = [
    withCharacter(p2, toCardId("char-vanilla"), 0, { state: "rested" }),
  ];
  const attacker = must(player.characters[0], "attacker");

  state.continuousEffects.push({
    ...continuousPowerEffectRecord(state, opponent.leader),
    id: "attack-cost-trash-two",
    modifier: {
      layer: "restriction",
      target: {
        type: "exactCard",
        card: {
          instanceId: attacker.instanceId,
          cardId: attacker.cardId,
          playerId: p1,
          zone: attacker.zone,
        },
        createdAtStateSeq: state.seq,
        binding: {
          family: "selectedTargets",
          saveResultAs: "selected:attack-cost-targets",
          objectIndex: 0,
        },
      },
      operation: {
        type: "attackCost",
        cost: { type: "trashFromHand", count: 2 },
      },
    },
    duration: { type: "untilEndOfNextTurn", player: "opponent" },
  });

  const withHand = computeView(state);
  assert.deepEqual(withHand.legalAttackTargets[attacker.instanceId], [
    opponent.leader.instanceId,
    must(opponent.characters[0], "opponent character").instanceId,
  ]);
  assert.deepEqual(withHand.cards[attacker.instanceId]?.restrictions, [
    "attack-cost-trash-2",
  ]);

  player.hand = player.hand.slice(0, 1);

  const withoutHand = computeView(state);
  assert.deepEqual(withoutHand.legalAttackTargets[attacker.instanceId], []);
});
