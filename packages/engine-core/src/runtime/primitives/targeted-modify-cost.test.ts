import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, Effect } from "@optcg/types";

import { computeView } from "../../compute-view.js";
import {
  createContinuousRecordsForResolvedEffect,
  isSupportedContinuousQueueEffect,
} from "../continuous/continuous.js";
import {
  createActiveState,
  p1,
  queueDrawForP1,
  resolvedCard,
  toCardId,
  toInstanceId,
  withCardInZone,
} from "../../effect-runtime-queue-processing-test-support.js";

const fieldCharacter = (): CardInstance => ({
  instanceId: toInstanceId("target-character"),
  cardId: toCardId("p1-a"),
  owner: p1,
  controller: p1,
  zone: { zone: "deck", playerId: p1, slot: "deck", index: 0 },
  attachedDon: [],
  state: "active",
});

test("targeted modifyCost supports selected character exact-card records", () => {
  const state = createActiveState();
  state.cardManifest.cards[toCardId("leader-red")] = resolvedCard({
    cardId: toCardId("leader-red"),
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[toCardId("leader-blue")] = resolvedCard({
    cardId: toCardId("leader-blue"),
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[toCardId("p1-a")] = resolvedCard({
    cardId: toCardId("p1-a"),
    category: "character",
    cost: 3,
    power: 5000,
  });
  const target = withCardInZone({
    state,
    playerId: p1,
    card: fieldCharacter(),
    zone: "characterArea",
  });
  const entry = { ...queueDrawForP1(), controllerId: p1 };
  const effect: Extract<Effect, { type: "modifyCost" }> = {
    type: "modifyCost",
    player: "self",
    target: {
      type: "choose",
      request: {
        timing: "onResolution",
        chooser: "self",
        player: "self",
        zone: "characterArea",
        min: 0,
        max: 1,
        allowFewerIfUnavailable: true,
        visibility: "public",
        filter: { categories: ["character"] },
      },
    },
    value: 2,
    duration: { type: "untilEndOfNextTurn", player: "opponent" },
  };

  assert.equal(isSupportedContinuousQueueEffect(effect), true);
  const records = createContinuousRecordsForResolvedEffect(
    state,
    entry,
    effect,
    [
      {
        instanceId: target.instanceId,
        cardId: target.cardId,
        playerId: p1,
        zone: target.zone,
      },
    ],
  );

  assert.ok(records !== null);
  assert.equal(records.length, 1);
  const record = records[0];
  assert.ok(record !== undefined);
  assert.equal(record.modifier.layer, "costAdd");
  assert.equal(record.modifier.operation.type, "addCost");
  assert.equal(record.modifier.operation.value, 2);
  assert.equal(record.modifier.target.type, "exactCard");
  assert.equal(record.modifier.target.card.instanceId, target.instanceId);

  state.continuousEffects.push(record);
  const view = computeView(state);
  assert.equal(view.cards[target.instanceId]?.currentCost, 5);
});
