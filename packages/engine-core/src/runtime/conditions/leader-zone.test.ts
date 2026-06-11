import assert from "node:assert/strict";
import { test } from "vitest";

import type { Condition } from "@optcg/types";

import { evaluateQueuedEffectCondition } from "./evaluator.js";
import {
  createActiveState,
  must,
  p1,
  queueDrawForP1,
  resolvedCard,
} from "../../effect-runtime-queue/test-support.js";

test("leader-zone hasCardInZone supports anyOf name filters", () => {
  const state = createActiveState();
  const self = must(state.players[p1], "p1");
  state.cardManifest.cards[self.leader.cardId] = {
    ...resolvedCard({ cardId: self.leader.cardId, category: "leader" }),
    name: "Portgas.D.Ace",
  };
  const condition: Extract<Condition, { type: "hasCardInZone" }> = {
    type: "hasCardInZone",
    player: "self",
    zone: "leaderArea",
    filter: {
      categories: ["leader"],
      anyOf: [
        { names: ["Sabo"] },
        { names: ["Portgas.D.Ace"] },
        { names: ["Monkey.D.Luffy"] },
      ],
    },
  };

  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      condition,
    ),
    { supported: true, passed: true },
  );
  state.cardManifest.cards[self.leader.cardId] = {
    ...must(state.cardManifest.cards[self.leader.cardId], "leader metadata"),
    name: "Nefeltari Vivi",
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

test("leader-zone hasCardInZone supports current-power filters", () => {
  const state = createActiveState();
  const self = must(state.players[p1], "p1");
  state.cardManifest.cards[self.leader.cardId] = {
    ...resolvedCard({ cardId: self.leader.cardId, category: "leader" }),
    power: 0,
  };
  const condition: Extract<Condition, { type: "hasCardInZone" }> = {
    type: "hasCardInZone",
    player: "self",
    zone: "leaderArea",
    filter: {
      categories: ["leader"],
      currentPower: { max: 0 },
    },
  };

  assert.deepEqual(
    evaluateQueuedEffectCondition(
      state,
      { ...queueDrawForP1(), controllerId: p1 },
      condition,
    ),
    { supported: true, passed: true },
  );

  state.cardManifest.cards[self.leader.cardId] = {
    ...must(state.cardManifest.cards[self.leader.cardId], "leader metadata"),
    power: 5000,
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
