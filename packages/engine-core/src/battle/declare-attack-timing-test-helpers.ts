import assert from "node:assert/strict";

import type { PlayerId } from "@optcg/types";

import { must, p1, p2, toCardId } from "../action-test-fixtures.js";
import type { applyDeclareAttack } from "./actions.js";
import type { setupAttackState } from "./test-fixtures.js";

export const ensureDeckHasAtLeast = (
  state: ReturnType<typeof setupAttackState>,
  playerId: PlayerId,
  count: number,
): void => {
  const player = must(state.players[playerId], "deck owner");
  if (player.deck.length >= count) {
    return;
  }
  const needed = count - player.deck.length;
  const moved = player.hand.slice(0, needed).map((card, index) => ({
    ...card,
    zone: {
      zone: "deck" as const,
      playerId,
      slot: "deck" as const,
      index: player.deck.length + index,
    },
  }));
  player.deck = [...player.deck, ...moved];
  player.hand = player.hand.slice(needed).map((card, index) => ({
    ...card,
    zone: { zone: "hand" as const, playerId, slot: "hand" as const, index },
  }));
};

const hiddenLeakSentinels = [
  "hidden-attacker-hand-card",
  "hidden-defender-deck-card",
  "hidden-defender-life-card",
] as const;

export const seedHiddenLeakSentinels = (
  state: ReturnType<typeof setupAttackState>,
): void => {
  const p1State = must(state.players[p1], "p1 hidden sentinel player");
  const p2State = must(state.players[p2], "p2 hidden sentinel player");
  const p1Hand = must(p1State.hand[0], "p1 hidden hand card");
  const p2Deck = must(p2State.deck[0], "p2 hidden deck card");
  const p2Life = must(p2State.life[0], "p2 hidden life card");
  p1State.hand[0] = {
    ...p1Hand,
    cardId: toCardId("hidden-attacker-hand-card"),
  };
  p2State.deck[0] = {
    ...p2Deck,
    cardId: toCardId("hidden-defender-deck-card"),
  };
  p2State.life[0] = {
    ...p2Life,
    card: {
      ...p2Life.card,
      cardId: toCardId("hidden-defender-life-card"),
    },
  };
};

export const assertNoHiddenLeakInErrors = (
  errors: ReturnType<typeof applyDeclareAttack>["errors"],
): void => {
  const serialized = JSON.stringify(errors);
  for (const sentinel of hiddenLeakSentinels) {
    assert.equal(serialized.includes(sentinel), false, sentinel);
  }
};
