import assert from "node:assert/strict";
import { test } from "vitest";

import type { DecisionId, EngineEvent } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  toCardId,
  toInstanceId,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";
import { resolvedCard } from "../action-test-fixtures.js";
import {
  applyMoveCardsPayment,
  isSupportedMoveCardsPaymentRoute,
  type MoveCardsPaymentOption,
} from "./runtime-move-cards-payment.js";

test("moveCards payment can place one selected hand card on top of deck", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const selected = must(player.hand[1], "selected hand card");
  const originalDeckTop = must(player.deck[0], "original deck top");
  const option: MoveCardsPaymentOption = {
    id: "moveCards",
    type: "moveCards",
    count: 1,
    from: { player: "self", zone: "hand" },
    to: { player: "self", zone: "deck", position: "top" },
  };
  const events: EngineEvent[] = [];

  const updated = applyMoveCardsPayment({
    decisionId: "decision:hand-to-deck-top" as DecisionId,
    events,
    player,
    playerId: p1,
    selected: [selected.instanceId],
    selectedOption: option,
    state,
  });

  assert.ok(updated);
  assert.equal(
    must(updated.deck[0], "new deck top").instanceId,
    selected.instanceId,
  );
  assert.equal(
    must(updated.deck[1], "shifted deck top").instanceId,
    originalDeckTop.instanceId,
  );
  assert.equal(
    updated.hand.some((card) => card.instanceId === selected.instanceId),
    false,
  );
  assert.deepEqual(
    events.map((event) => event.type),
    ["cardMoved", "cardMoved"],
  );
});

test("hand to deck top moveCards payment route supports only one card until ordered multi-card costs exist", () => {
  const option: MoveCardsPaymentOption = {
    id: "moveCards",
    type: "moveCards",
    count: 2,
    from: { player: "self", zone: "hand" },
    to: { player: "self", zone: "deck", position: "top" },
  };

  assert.equal(isSupportedMoveCardsPaymentRoute(option), false);
});

test("moveCards payment can place selected hand cards on deck bottom in selected order", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const selected = [
    must(player.hand[1], "first selected hand card"),
    must(player.hand[0], "second selected hand card"),
  ];
  const originalDeckIds = player.deck.map((card) => card.instanceId);
  const option: MoveCardsPaymentOption = {
    id: "moveCards",
    type: "moveCards",
    count: 2,
    from: { player: "self", zone: "hand" },
    to: { player: "self", zone: "deck", position: "bottom" },
  };
  const events: EngineEvent[] = [];

  assert.equal(isSupportedMoveCardsPaymentRoute(option), true);

  const updated = applyMoveCardsPayment({
    decisionId: "decision:hand-to-deck-bottom" as DecisionId,
    events,
    player,
    playerId: p1,
    selected: selected.map((card) => card.instanceId),
    selectedOption: option,
    state,
  });

  assert.ok(updated);
  assert.deepEqual(
    updated.deck.map((card) => card.instanceId),
    [
      ...originalDeckIds,
      must(selected[0], "first moved").instanceId,
      must(selected[1], "second moved").instanceId,
    ],
  );
  assert.equal(
    updated.hand.some((card) =>
      selected.some((moved) => moved.instanceId === card.instanceId),
    ),
    false,
  );
  assert.deepEqual(
    events.map((event) => event.type),
    ["cardMoved", "cardMoved", "cardMoved", "cardMoved"],
  );
});

test("moveCards payment can place a selected field character on deck bottom", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  state.cardManifest.cards[toCardId("field-character")] = resolvedCard({
    cardId: toCardId("field-character"),
    category: "character",
    cost: 3,
    power: 5000,
  });
  const attachedDon = {
    ...must(player.donDeck[0], "attached DON"),
    state: "active" as const,
    zone: {
      zone: "costArea" as const,
      playerId: p1,
      slot: "cost" as const,
      index: 0,
    },
  };
  player.donDeck = player.donDeck.filter(
    (card) => card.instanceId !== attachedDon.instanceId,
  );
  player.costArea = [attachedDon];
  const selected = withCardInZone({
    state,
    playerId: p1,
    card: {
      cardId: toCardId("field-character"),
      instanceId: toInstanceId("field-character-instance"),
      owner: p1,
      controller: p1,
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 0,
      },
      state: "active",
      attachedDon: [attachedDon.instanceId],
      turnPlayed: state.turn.globalTurn,
    },
    zone: "characterArea",
  });
  selected.attachedDon = [attachedDon.instanceId];
  const option: MoveCardsPaymentOption = {
    id: "moveCards",
    type: "moveCards",
    count: 1,
    from: { player: "self", zone: "characterArea" },
    to: { player: "self", zone: "deck", position: "bottom" },
    filter: { categories: ["character"] },
  };
  const events: EngineEvent[] = [];

  const updated = applyMoveCardsPayment({
    decisionId: "decision:field-to-deck-bottom" as DecisionId,
    events,
    player,
    playerId: p1,
    selected: [selected.instanceId],
    selectedOption: option,
    state,
  });

  assert.ok(updated);
  assert.equal(
    updated.characters.some((card) => card.instanceId === selected.instanceId),
    false,
  );
  assert.equal(
    must(updated.deck.at(-1), "moved deck bottom").instanceId,
    selected.instanceId,
  );
  assert.deepEqual(must(updated.deck.at(-1), "moved card").attachedDon, []);
  assert.equal(
    must(
      updated.costArea.find(
        (card) => card.instanceId === attachedDon.instanceId,
      ),
      "returned attached DON",
    ).state,
    "rested",
  );
  assert.equal(events[0]?.type, "cardMoved");
});

test("moveCards payment can trash selected bottom Life", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const selected = must(player.life.at(-1), "bottom Life").card;
  const originalTopLife = must(player.life[0], "top Life").card;
  const option: MoveCardsPaymentOption = {
    id: "moveCards:bottom",
    type: "moveCards",
    count: 1,
    from: { player: "self", zone: "life", position: "bottom" },
    to: { player: "self", zone: "trash" },
  };
  const events: EngineEvent[] = [];

  assert.equal(isSupportedMoveCardsPaymentRoute(option), true);

  const updated = applyMoveCardsPayment({
    decisionId: "decision:life-bottom-to-trash" as DecisionId,
    events,
    player,
    playerId: p1,
    selected: [selected.instanceId],
    selectedOption: option,
    state,
  });

  assert.ok(updated);
  assert.equal(
    updated.life.some(
      (lifeCard) => lifeCard.card.instanceId === selected.instanceId,
    ),
    false,
  );
  assert.equal(
    must(updated.life[0], "remaining top Life").card.instanceId,
    originalTopLife.instanceId,
  );
  assert.equal(
    must(updated.trash[0], "trashed Life").instanceId,
    selected.instanceId,
  );
  assert.deepEqual(
    events.map((event) => event.type),
    ["cardMoved", "cardTrashed"],
  );
});
