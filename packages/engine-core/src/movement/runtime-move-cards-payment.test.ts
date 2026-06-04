import assert from "node:assert/strict";
import { test } from "vitest";

import type { DecisionId, EngineEvent } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
} from "../effect-runtime-queue/test-support.js";
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
