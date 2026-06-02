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
} from "../../effect-runtime-queue-processing-test-support.js";

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
