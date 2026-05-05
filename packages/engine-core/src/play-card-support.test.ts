import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance } from "@optcg/types";

import { must, p1, resolvedCard } from "./action-test-fixtures.js";
import {
  canResolveDestinationConflict,
  getActiveDonCount,
  getPlayableHandCards,
  getSupportedPlayMetadata,
} from "./play-card-support.js";
import { setupMainPlayState } from "./play-card-test-fixtures.js";

test("getSupportedPlayMetadata accepts supported vanilla Character, Stage, and exact Main Event", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const character = must(p1State.hand[0], "character");
  const stage = must(p1State.hand[1], "stage");
  const event = must(p1State.hand[2], "event");

  state.cardManifest.cards[character.cardId] = resolvedCard({
    cardId: character.cardId,
    category: "character",
    cost: 3,
    power: 5000,
  });
  state.cardManifest.cards[stage.cardId] = resolvedCard({
    cardId: stage.cardId,
    category: "stage",
    cost: 2,
  });
  state.cardManifest.cards[event.cardId] = resolvedCard({
    cardId: event.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main]",
  });

  assert.deepEqual(getSupportedPlayMetadata(state, character), {
    category: "character",
    printedCost: 3,
  });
  assert.deepEqual(getSupportedPlayMetadata(state, stage), {
    category: "stage",
    printedCost: 2,
  });
  assert.deepEqual(getSupportedPlayMetadata(state, event), {
    category: "event",
    printedCost: 1,
  });
});

test("getSupportedPlayMetadata rejects unsupported play metadata", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const missingManifest = must(p1State.hand[0], "missing manifest");
  const unsupported = must(p1State.hand[1], "unsupported status");
  const missingCost = must(p1State.hand[2], "missing cost");
  const effectText = must(p1State.hand[3], "effect text");
  const triggerText = must(p1State.hand[4], "trigger text");

  state.cardManifest.cards[unsupported.cardId] = {
    ...resolvedCard({
      cardId: unsupported.cardId,
      category: "character",
      cost: 1,
      power: 1000,
    }),
    support: {
      ...resolvedCard({
        cardId: unsupported.cardId,
        category: "character",
      }).support,
      status: "unsupported",
    },
  };
  state.cardManifest.cards[missingCost.cardId] = resolvedCard({
    cardId: missingCost.cardId,
    category: "stage",
  });
  state.cardManifest.cards[effectText.cardId] = resolvedCard({
    cardId: effectText.cardId,
    category: "character",
    cost: 1,
    power: 1000,
    effectText: "[On Play] draw a card.",
  });
  state.cardManifest.cards[triggerText.cardId] = resolvedCard({
    cardId: triggerText.cardId,
    category: "character",
    cost: 1,
    power: 1000,
    triggerText: "Draw a card.",
  });
  assert.equal(getSupportedPlayMetadata(state, missingManifest), null);
  assert.equal(getSupportedPlayMetadata(state, unsupported), null);
  assert.equal(getSupportedPlayMetadata(state, missingCost), null);
  assert.equal(getSupportedPlayMetadata(state, effectText), null);
  assert.equal(getSupportedPlayMetadata(state, triggerText), null);

  state.cardManifest.cards[missingManifest.cardId] = resolvedCard({
    cardId: missingManifest.cardId,
    category: "leader",
    cost: 0,
  });
  state.cardManifest.cards[unsupported.cardId] = resolvedCard({
    cardId: unsupported.cardId,
    category: "event",
    cost: 1,
    effectText: "[Main] Draw a card.",
  });
  assert.equal(getSupportedPlayMetadata(state, missingManifest), null);
  assert.equal(getSupportedPlayMetadata(state, unsupported), null);
});

test("getPlayableHandCards respects active DON and destination conflicts", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const affordable = must(p1State.hand[0], "affordable");
  const tooExpensive = must(p1State.hand[1], "too expensive");
  const stage = must(p1State.hand[2], "stage");

  state.cardManifest.cards[affordable.cardId] = resolvedCard({
    cardId: affordable.cardId,
    category: "character",
    cost: 3,
    power: 5000,
  });
  state.cardManifest.cards[tooExpensive.cardId] = resolvedCard({
    cardId: tooExpensive.cardId,
    category: "character",
    cost: 4,
    power: 5000,
  });
  state.cardManifest.cards[stage.cardId] = resolvedCard({
    cardId: stage.cardId,
    category: "stage",
    cost: 1,
  });

  assert.equal(getActiveDonCount(p1State.costArea), 3);
  assert.deepEqual(
    getPlayableHandCards(state, p1).map((card) => card.instanceId),
    [affordable.instanceId, stage.instanceId],
  );

  p1State.stage = {
    ...stage,
    instanceId:
      `${String(stage.instanceId)}:existing` as CardInstance["instanceId"],
    zone: { zone: "stageArea", playerId: p1, slot: "stage", index: 0 },
    state: "active",
    attachedDon: [must(p1State.costArea[0], "attached DON").instanceId],
  };

  assert.equal(canResolveDestinationConflict(p1State, "stage"), false);
  assert.deepEqual(
    getPlayableHandCards(state, p1).map((card) => card.instanceId),
    [affordable.instanceId],
  );
});
