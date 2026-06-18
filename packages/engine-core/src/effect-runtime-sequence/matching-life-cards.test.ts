import assert from "node:assert/strict";
import { test } from "vitest";

import type { Effect } from "@optcg/types";

import {
  must,
  p1,
  processEffectRuntime,
} from "../effect-runtime-queue/test-support.js";
import { sequenceQueueState } from "./search-reveal-test-support.js";

const trashFaceUpLifeSequence = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      connector: "always",
      effect: {
        type: "moveMatchingLifeCards",
        player: "self",
        matcher: { faceUp: true },
        to: { player: "self", zone: "trash" },
        order: "original",
      },
    },
  ],
});

test("matching Life movement trashes only face-up Life without a selection decision", () => {
  const { state } = sequenceQueueState(trashFaceUpLifeSequence(), 3);
  const player = must(state.players[p1], "p1");
  const lifeCards = player.deck.slice(0, 3);
  assert.equal(lifeCards.length, 3);
  player.deck = player.deck.slice(3).map((card, index) => ({
    ...card,
    zone: { zone: "deck", playerId: p1, slot: "deck", index },
  }));
  player.life = lifeCards.map((card, index) => ({
    faceUp: false,
    card: {
      ...card,
      zone: { zone: "life", playerId: p1, slot: "life", index },
    },
  }));
  const firstFaceUp = must(player.life[0], "first Life");
  const hiddenLife = must(player.life[1], "hidden Life");
  const secondFaceUp = must(player.life[2], "second Life");
  firstFaceUp.faceUp = true;
  hiddenLife.faceUp = false;
  secondFaceUp.faceUp = true;

  const result = processEffectRuntime(state);
  const afterPlayer = must(result.state.players[p1], "after p1");
  const trashIds = afterPlayer.trash.map((card) => card.instanceId);
  const lifeIds = afterPlayer.life.map((lifeCard) => lifeCard.card.instanceId);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(afterPlayer.life.length, player.life.length - 2);
  assert.deepEqual(lifeIds, [
    hiddenLife.card.instanceId,
    ...player.life.slice(3).map((lifeCard) => lifeCard.card.instanceId),
  ]);
  assert.equal(trashIds.includes(firstFaceUp.card.instanceId), true);
  assert.equal(trashIds.includes(secondFaceUp.card.instanceId), true);
  assert.equal(trashIds.includes(hiddenLife.card.instanceId), false);
  assert.equal(
    result.events.filter((event) => event.type === "cardTrashed").length,
    2,
  );
});
