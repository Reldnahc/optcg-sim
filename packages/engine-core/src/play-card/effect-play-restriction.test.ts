import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, ContinuousEffectRecord } from "@optcg/types";

import { must, p1, resolvedCard } from "../action-test-fixtures.js";
import {
  applyPlayCard,
  applyRuntimePlaySelectedFromHand,
  getPlayCardLegalActions,
} from "./core.js";
import { hasPlayCardAction, setupMainPlayState } from "./test-fixtures.js";

const addEffectPlayRestriction = (
  state: ReturnType<typeof setupMainPlayState>,
  card: CardInstance,
): void => {
  state.continuousEffects.push({
    id: "test:effect-play-restriction",
    source: {
      instanceId: card.instanceId,
      cardId: card.cardId,
      playerId: p1,
      zone: card.zone,
    },
    sourceSnapshot: {
      instanceId: card.instanceId,
      cardId: card.cardId,
      ownerId: card.owner,
      controllerId: card.controller,
      zone: card.zone,
      category: "character",
      colors: [],
      keywords: [],
    },
    controller: p1,
    duration: { type: "permanent" },
    createdBy: { type: "ruleProcess", name: "test" },
    createdAtStateSeq: state.seq,
    modifier: {
      layer: "restriction",
      target: { type: "self" },
      operation: {
        type: "restriction",
        restriction: "cannotPlayByEffects",
      },
    },
  } satisfies ContinuousEffectRecord);
};

test("effect-play restrictions block playSelected without blocking normal playCard", () => {
  const state = setupMainPlayState();
  const player = must(state.players[p1], "p1");
  const card = must(player.hand[0], "restricted card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 0,
    power: 3000,
  });
  addEffectPlayRestriction(state, card);

  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p1), card),
    true,
  );
  const effectPlay = applyRuntimePlaySelectedFromHand({
    state,
    playerId: p1,
    cardInstanceId: card.instanceId,
    enterRested: false,
    ignoreCost: true,
  });

  assert.deepEqual(effectPlay.errors, [
    {
      type: "illegalAction",
      reason: "playSelected is blocked by an effect play restriction.",
    },
  ]);

  const normalPlay = applyPlayCard(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });

  assert.equal(normalPlay.errors, undefined);
});
