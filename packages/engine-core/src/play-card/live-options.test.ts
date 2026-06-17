import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, GameState } from "@optcg/types";

import { applyAction } from "../actions.js";
import { must, p1, p2, resolvedCard } from "../action-test-fixtures.js";
import { setupMainPlayState } from "./test-fixtures.js";

const createCorruptPlayableState = (): {
  readonly state: GameState;
  readonly card: CardInstance;
} => {
  const state = setupMainPlayState();
  const player = must(state.players[p1], "p1");
  const card = must(player.hand[0], "play card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 0,
    power: 3000,
  });
  const opponent = must(state.players[p2], "p2");
  const opponentHandCard = must(opponent.hand[0], "opponent hand");
  opponent.hand[0] = {
    ...opponentHandCard,
    zone: { ...opponentHandCard.zone, index: 99 },
  };
  return { state, card };
};

test("live play-card actions can skip invariant validation", () => {
  const defaultValidation = createCorruptPlayableState();
  assert.throws(() => {
    applyAction(defaultValidation.state, {
      type: "playCard",
      cardInstanceId: defaultValidation.card.instanceId,
    });
  });
  const liveValidation = createCorruptPlayableState();

  const result = applyAction(
    liveValidation.state,
    { type: "playCard", cardInstanceId: liveValidation.card.instanceId },
    { includeStateHash: false, validateInvariants: false },
  );

  assert.equal(result.errors, undefined);
  assert.equal(result.stateHash, "");
});
