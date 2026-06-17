import assert from "node:assert/strict";
import { test } from "vitest";

import type { Condition } from "@optcg/types";

import {
  evaluateQueuedEffectCondition,
  isSupportedQueuedEffectConditionShape,
} from "./evaluator.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  queueDrawForP1,
  resolvedCard,
  toCardId,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";

const opponentRestedCharacterCount = (
  value: number,
  op: Extract<Condition, { type: "fieldCount" }>["op"] = "gte",
): Extract<Condition, { type: "fieldCount" }> => ({
  type: "fieldCount",
  player: "opponent",
  filter: { categories: ["character"], state: "rested" },
  op,
  value,
});

test("fieldCount condition supports opponent rested character thresholds", () => {
  const state = createActiveState();
  const opponent = must(state.players[p2], "p2");
  const first = withCardInZone({
    state,
    playerId: p2,
    card: must(opponent.hand[0], "first character"),
    zone: "characterArea",
  });
  const second = withCardInZone({
    state,
    playerId: p2,
    card: must(opponent.hand[1], "second character"),
    zone: "characterArea",
  });
  first.state = "rested";
  second.state = "rested";

  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      opponentRestedCharacterCount(2),
    ),
    { supported: true, passed: true },
  );
  second.state = "active";
  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      opponentRestedCharacterCount(2),
    ),
    { supported: true, passed: false },
  );
});

test("fieldCount condition supports generic rested public card thresholds", () => {
  const condition: Extract<Condition, { type: "fieldCount" }> = {
    type: "fieldCount",
    player: "self",
    filter: { state: "rested" },
    op: "gte",
    value: 4,
  };
  const state = createActiveState();
  const self = must(state.players[p1], "p1");
  self.leader.state = "rested";
  const character = withCardInZone({
    state,
    playerId: p1,
    card: must(self.hand[0], "character"),
    zone: "characterArea",
  });
  character.state = "rested";
  const stage = withCardInZone({
    state,
    playerId: p1,
    card: must(self.hand[1], "stage"),
    zone: "stageArea",
  });
  stage.state = "rested";
  const restedDon = must(self.donDeck[0], "rested DON");
  self.donDeck = self.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  self.costArea = [
    {
      ...restedDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "rested",
    },
  ];

  assert.equal(isSupportedQueuedEffectConditionShape(condition), true);
  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      condition,
    ),
    { supported: true, passed: true },
  );
  self.leader.state = "active";
  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      condition,
    ),
    { supported: true, passed: false },
  );
});

test("fieldCount condition supports named self characters while excluding the source", () => {
  const state = createActiveState();
  const self = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(self.hand[0], "source character"),
      cardId: toCardId("cavendish-source"),
    },
    zone: "characterArea",
    index: 0,
  });
  const other = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(self.hand[1], "other character"),
      cardId: toCardId("cavendish-other"),
    },
    zone: "characterArea",
    index: 1,
  });
  const sourceCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
  });
  const otherCard = resolvedCard({
    cardId: other.cardId,
    category: "character",
  });
  state.cardManifest.cards[source.cardId] = {
    ...sourceCard,
    name: "Cavendish",
  };
  state.cardManifest.cards[other.cardId] = {
    ...otherCard,
    name: "Cavendish",
  };

  const condition: Extract<Condition, { type: "fieldCount" }> = {
    type: "fieldCount",
    player: "self",
    filter: {
      categories: ["character"],
      names: ["Cavendish"],
      excludeSelf: true,
    },
    op: "eq",
    value: 0,
  };

  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      {
        ...queueDrawForP1(),
        controllerId: p1,
        source: {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: p1,
          zone: source.zone,
        },
      },
      condition,
    ),
    { supported: true, passed: false },
  );
  self.characters = self.characters.filter(
    (card) => card.instanceId !== other.instanceId,
  );
  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      {
        ...queueDrawForP1(),
        controllerId: p1,
        source: {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId: p1,
          zone: source.zone,
        },
      },
      condition,
    ),
    { supported: true, passed: true },
  );
});

test("fieldCount condition supports current-power and type filters for self characters", () => {
  const state = createActiveState();
  const self = must(state.players[p1], "p1");
  const lowPowerLuffy = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(self.hand[0], "low power luffy"),
      cardId: toCardId("low-power-luffy"),
    },
    zone: "characterArea",
    index: 0,
  });
  const matchingWhitebeard = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(self.hand[1], "matching whitebeard"),
      cardId: toCardId("matching-whitebeard"),
    },
    zone: "characterArea",
    index: 1,
  });
  state.cardManifest.cards[lowPowerLuffy.cardId] = {
    ...resolvedCard({
      cardId: lowPowerLuffy.cardId,
      category: "character",
      power: 7000,
    }),
    types: ["Whitebeard Pirates"],
  };
  state.cardManifest.cards[matchingWhitebeard.cardId] = {
    ...resolvedCard({
      cardId: matchingWhitebeard.cardId,
      category: "character",
      power: 8000,
    }),
    types: ["Whitebeard Pirates"],
  };

  const condition: Extract<Condition, { type: "fieldCount" }> = {
    type: "fieldCount",
    player: "self",
    filter: {
      categories: ["character"],
      typesAny: ["Whitebeard Pirates"],
      currentPower: { min: 8000 },
    },
    op: "gte",
    value: 1,
  };

  assert.equal(isSupportedQueuedEffectConditionShape(condition), true);
  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      condition,
    ),
    { supported: true, passed: true },
  );
  state.cardManifest.cards[matchingWhitebeard.cardId] = {
    ...must(
      state.cardManifest.cards[matchingWhitebeard.cardId],
      "matching metadata",
    ),
    power: 7000,
  };
  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      condition,
    ),
    { supported: true, passed: false },
  );
});

test("fieldCount condition can count distinct matching character names", () => {
  const state = createActiveState();
  const self = must(state.players[p1], "p1");
  const first = withCardInZone({
    state,
    playerId: p1,
    card: { ...must(self.hand[0], "first"), cardId: toCardId("impel-a") },
    zone: "characterArea",
    index: 0,
  });
  const second = withCardInZone({
    state,
    playerId: p1,
    card: { ...must(self.hand[1], "second"), cardId: toCardId("impel-b") },
    zone: "characterArea",
    index: 1,
  });
  const duplicate = withCardInZone({
    state,
    playerId: p1,
    card: { ...must(self.hand[2], "duplicate"), cardId: toCardId("impel-a") },
    zone: "characterArea",
    index: 2,
  });
  for (const card of [first, second, duplicate]) {
    state.cardManifest.cards[card.cardId] = {
      ...resolvedCard({ cardId: card.cardId, category: "character" }),
      name: card.cardId === first.cardId ? "Same Name" : "Other Name",
      types: ["Impel Down"],
    };
  }

  const condition: Extract<Condition, { type: "fieldCount" }> = {
    type: "fieldCount",
    player: "self",
    filter: {
      categories: ["character"],
      typesAny: ["Impel Down"],
      custom: "differentNames",
    },
    op: "eq",
    value: 2,
  };

  assert.equal(isSupportedQueuedEffectConditionShape(condition), true);
  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      condition,
    ),
    { supported: true, passed: true },
  );
  state.cardManifest.cards[second.cardId] = {
    ...must(state.cardManifest.cards[second.cardId], "second metadata"),
    name: "Same Name",
  };
  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      condition,
    ),
    { supported: true, passed: false },
  );
});

test("fieldCount condition supports opponent current-power character presence", () => {
  const state = createActiveState();
  const opponent = must(state.players[p2], "p2");
  const bigCharacter = withCardInZone({
    state,
    playerId: p2,
    card: {
      ...must(opponent.hand[0], "big character"),
      cardId: toCardId("big-opponent-character"),
    },
    zone: "characterArea",
  });
  state.cardManifest.cards[bigCharacter.cardId] = resolvedCard({
    cardId: bigCharacter.cardId,
    category: "character",
    power: 8000,
  });

  const condition: Extract<Condition, { type: "fieldCount" }> = {
    type: "fieldCount",
    player: "opponent",
    filter: {
      categories: ["character"],
      currentPower: { min: 8000 },
    },
    op: "gte",
    value: 1,
  };

  assert.equal(isSupportedQueuedEffectConditionShape(condition), true);
  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      condition,
    ),
    { supported: true, passed: true },
  );
  state.cardManifest.cards[bigCharacter.cardId] = resolvedCard({
    cardId: bigCharacter.cardId,
    category: "character",
    power: 7000,
  });
  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      condition,
    ),
    { supported: true, passed: false },
  );
});

test("fieldCount condition supports opponent printed-power character presence", () => {
  const state = createActiveState();
  const opponent = must(state.players[p2], "p2");
  const bigCharacter = withCardInZone({
    state,
    playerId: p2,
    card: {
      ...must(opponent.hand[0], "big character"),
      cardId: toCardId("printed-power-opponent-character"),
    },
    zone: "characterArea",
  });
  state.cardManifest.cards[bigCharacter.cardId] = resolvedCard({
    cardId: bigCharacter.cardId,
    category: "character",
    power: 8000,
  });

  const condition: Extract<Condition, { type: "fieldCount" }> = {
    type: "fieldCount",
    player: "opponent",
    filter: {
      categories: ["character"],
      power: { min: 8000 },
    },
    op: "gte",
    value: 1,
  };

  assert.equal(isSupportedQueuedEffectConditionShape(condition), true);
  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      condition,
    ),
    { supported: true, passed: true },
  );
  state.cardManifest.cards[bigCharacter.cardId] = resolvedCard({
    cardId: bigCharacter.cardId,
    category: "character",
    power: 7000,
  });
  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      condition,
    ),
    { supported: true, passed: false },
  );
});

test("fieldCount condition supports no matching self characters by type and cost", () => {
  const state = createActiveState();
  const self = must(state.players[p1], "p1");
  const matching = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(self.hand[0], "matching character"),
      cardId: toCardId("matching-whitebeard-cost"),
    },
    zone: "characterArea",
  });
  state.cardManifest.cards[matching.cardId] = {
    ...resolvedCard({
      cardId: matching.cardId,
      category: "character",
      cost: 8,
      power: 8000,
    }),
    types: ["Whitebeard Pirates"],
  };

  const condition: Extract<Condition, { type: "fieldCount" }> = {
    type: "fieldCount",
    player: "self",
    filter: {
      categories: ["character"],
      typesAny: ["Whitebeard Pirates"],
      cost: { min: 8 },
    },
    op: "eq",
    value: 0,
  };

  assert.equal(isSupportedQueuedEffectConditionShape(condition), true);
  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      condition,
    ),
    { supported: true, passed: false },
  );
  state.cardManifest.cards[matching.cardId] = {
    ...must(state.cardManifest.cards[matching.cardId], "matching metadata"),
    cost: 7,
  };
  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      condition,
    ),
    { supported: true, passed: true },
  );
});

test("fieldCountTotal condition sums matching characters across both players", () => {
  const state = createActiveState();
  const self = must(state.players[p1], "p1");
  const opponent = must(state.players[p2], "p2");
  const selfCharacter = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(self.hand[0], "self character"),
      cardId: toCardId("self-cost-eight-character"),
    },
    zone: "characterArea",
  });
  const opponentCharacter = withCardInZone({
    state,
    playerId: p2,
    card: {
      ...must(opponent.hand[0], "opponent character"),
      cardId: toCardId("opponent-cost-eight-character"),
    },
    zone: "characterArea",
  });
  for (const card of [selfCharacter, opponentCharacter]) {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
      cost: 8,
      power: 8000,
    });
  }

  const condition: Extract<Condition, { type: "fieldCountTotal" }> = {
    type: "fieldCountTotal",
    players: ["self", "opponent"],
    filter: { categories: ["character"], cost: { min: 8 } },
    op: "gte",
    value: 2,
  };

  assert.equal(isSupportedQueuedEffectConditionShape(condition), true);
  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      condition,
    ),
    { supported: true, passed: true },
  );
  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      { ...condition, value: 3 },
    ),
    { supported: true, passed: false },
  );
});
