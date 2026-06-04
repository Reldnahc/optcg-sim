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

import { createInitialState } from "../setup/initial-state.js";
import {
  respondToMulliganDecision,
  startMulliganFlow,
} from "../setup/mulligan.js";
import { advanceRefreshPhase } from "./phases.js";

const toMatchId = (value: string): MatchId => value as MatchId;
const toPlayerId = (value: string): PlayerId => value as PlayerId;
const toCardId = (value: string): CardId => value as CardId;

const p1 = toPlayerId("p1");
const p2 = toPlayerId("p2");

const must = <T>(value: T | undefined, label: string): T => {
  assert.ok(value !== undefined, `missing ${label}`);
  return value;
};

const resolvedVanillaCard = (
  cardId: CardId,
  category: "leader" | "character" | "stage",
): ResolvedCard => {
  const card: ResolvedCard = {
    cardId,
    language: "en",
    name: String(cardId),
    category,
    set: "TEST",
    setName: "Test Set",
    rarity: "C",
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
      cardId,
      status: "vanilla-confirmed",
      tested: true,
      rulesVersion: "r1",
      cardDataVersion: "fixture",
      sourceTextHash: "source-hash",
      behaviorHash: "behavior-hash",
    },
  };
  if (category !== "leader") {
    card.cost = 1;
  }
  if (category === "leader") {
    card.life = 5;
  }
  if (category !== "stage") {
    card.power = 5000;
  }
  if (category === "character") {
    card.counter = 1000;
  }
  return card;
};

const createInput = () => ({
  matchId: toMatchId("match-phase-refresh-restrictions"),
  firstPlayerId: p1,
  rngSeed: "seed-phase-refresh-restrictions",
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
    manifestHash: "manifest-phases-refresh-restrictions",
    source: "manual-test" as const,
    cardDataVersion: "fixture",
    effectDefinitionsVersion: "fixture",
    customHandlerVersion: "fixture",
    banlistVersion: "fixture",
    createdAt: "2026-05-04T00:00:00.000Z",
    cards: {},
  } satisfies MatchCardManifest,
  shuffleDecks: false,
});

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

test("refresh keeps exact-card cannotBecomeActive targets rested for that refresh only", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p2;
  state.turn.phase = "refresh";
  const p2State = must(state.players[p2], "p2");
  const handCard = must(p2State.hand[0], "p2 hand character");
  const target: CardInstance = {
    ...handCard,
    controller: p2,
    owner: p2,
    attachedDon: [],
    state: "rested",
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 0 },
  };
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  p2State.characters = [target];
  const source = {
    instanceId: target.instanceId,
    cardId: target.cardId,
    playerId: p2,
    zone: target.zone,
  } as const;
  state.continuousEffects = [
    {
      id: "cannot-become-active-refresh-lock",
      source,
      sourceSnapshot: {
        instanceId: target.instanceId,
        cardId: target.cardId,
        ownerId: p2,
        controllerId: p2,
        zone: target.zone,
        category: "character",
        colors: ["blue"],
        keywords: [],
      },
      controller: p1,
      modifier: {
        layer: "restriction",
        target: {
          type: "exactCard",
          card: source,
          binding: {
            family: "selectedTargets",
            saveResultAs: "selected:thatCharacter",
            objectIndex: 0,
          },
          createdAtStateSeq: state.seq,
        },
        operation: {
          type: "restriction",
          restriction: "cannotBecomeActive",
        },
      },
      duration: { type: "untilStartOfNextTurn", player: "opponent" },
      createdBy: { type: "ruleProcess", name: "refresh-lock-test" },
      createdAtStateSeq: state.seq,
    },
  ];

  const refreshed = advanceRefreshPhase(state);
  const refreshedTarget = must(
    refreshed.state.players[p2],
    "p2 refreshed",
  ).characters.find((card) => card.instanceId === target.instanceId);

  assert.equal(refreshed.errors, undefined);
  assert.equal(refreshedTarget?.state, "rested");
  assert.equal(refreshed.state.continuousEffects.length, 0);
});

test("refresh keeps filtered all-target cannotBecomeActive characters rested", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p2;
  state.turn.phase = "refresh";
  const p2State = must(state.players[p2], "p2");
  const [eligibleHandCard, ineligibleHandCard] = p2State.hand;
  assert.ok(eligibleHandCard !== undefined);
  assert.ok(ineligibleHandCard !== undefined);
  const eligibleTarget: CardInstance = {
    ...eligibleHandCard,
    controller: p2,
    owner: p2,
    attachedDon: [],
    state: "rested",
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 0 },
  };
  const ineligibleTarget: CardInstance = {
    ...ineligibleHandCard,
    controller: p2,
    owner: p2,
    attachedDon: [],
    state: "rested",
    zone: { zone: "characterArea", playerId: p2, slot: "character", index: 1 },
  };
  state.cardManifest.cards = {
    ...state.cardManifest.cards,
    [eligibleTarget.cardId]: {
      ...resolvedVanillaCard(eligibleTarget.cardId, "character"),
      cost: 7,
    },
    [ineligibleTarget.cardId]: {
      ...resolvedVanillaCard(ineligibleTarget.cardId, "character"),
      cost: 8,
    },
  };
  p2State.hand = p2State.hand.slice(2).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  p2State.characters = [eligibleTarget, ineligibleTarget];
  const source = {
    instanceId: eligibleTarget.instanceId,
    cardId: eligibleTarget.cardId,
    playerId: p2,
    zone: eligibleTarget.zone,
  } as const;
  state.continuousEffects = [
    {
      id: "cannot-become-active-filtered-all-refresh-lock",
      source,
      sourceSnapshot: {
        instanceId: eligibleTarget.instanceId,
        cardId: eligibleTarget.cardId,
        ownerId: p2,
        controllerId: p2,
        zone: eligibleTarget.zone,
        category: "character",
        colors: ["blue"],
        keywords: [],
      },
      controller: p1,
      modifier: {
        layer: "restriction",
        target: {
          type: "all",
          zone: "characterArea",
          player: "opponent",
          filter: {
            categories: ["character"],
            state: "rested",
            cost: { max: 7 },
          },
        },
        operation: {
          type: "restriction",
          restriction: "cannotBecomeActive",
        },
      },
      duration: { type: "untilStartOfNextTurn", player: "opponent" },
      createdBy: { type: "ruleProcess", name: "refresh-lock-test" },
      createdAtStateSeq: state.seq,
    },
  ];

  const refreshed = advanceRefreshPhase(state);
  const refreshedCharacters = must(
    refreshed.state.players[p2],
    "p2 refreshed",
  ).characters;
  const refreshedEligibleTarget = refreshedCharacters.find(
    (card) => card.instanceId === eligibleTarget.instanceId,
  );
  const refreshedIneligibleTarget = refreshedCharacters.find(
    (card) => card.instanceId === ineligibleTarget.instanceId,
  );

  assert.equal(refreshed.errors, undefined);
  assert.equal(refreshedEligibleTarget?.state, "rested");
  assert.equal(refreshedIneligibleTarget?.state, "active");
  assert.equal(refreshed.state.continuousEffects.length, 0);
});
