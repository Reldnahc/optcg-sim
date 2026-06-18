import assert from "node:assert/strict";
import { test } from "vitest";

import type { Effect } from "@optcg/types";

import {
  isCardRevealedPayload,
  sequenceQueueState,
} from "./search-reveal-test-support.js";
import {
  must,
  p2,
  processEffectRuntime,
} from "../effect-runtime-queue/test-support.js";

const revealOpponentHandSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      connector: "always",
      effect: {
        type: "revealFromZone",
        player: "opponent",
        zone: "hand",
        to: "bothPlayers",
      },
    },
  ],
});

test("sequence revealFromZone publicly reveals the resolved player's hand without moving it", () => {
  const { state } = sequenceQueueState(revealOpponentHandSequence(), 0);
  const opponent = must(state.players[p2], "opponent");
  const expectedHandIds = opponent.hand.map((card) => card.instanceId);

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  const revealEvent = must(
    result.events.find((event) => event.type === "cardRevealed"),
    "cardRevealed event",
  );
  assert.equal(revealEvent.visibility.type, "public");
  assert.ok(isCardRevealedPayload(revealEvent.payload));
  assert.deepEqual(
    revealEvent.payload.cards.map((card) => card.instanceId),
    expectedHandIds,
  );
  assert.deepEqual(
    must(result.state.players[p2], "opponent after reveal").hand.map(
      (card) => card.instanceId,
    ),
    expectedHandIds,
  );
  assert.equal(result.state.revealedCards.length, state.revealedCards.length);
});
