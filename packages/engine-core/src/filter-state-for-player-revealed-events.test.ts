import assert from "node:assert/strict";
import { test } from "vitest";

import {
  createActiveState,
  must,
  p1,
  p2,
  toEngineEventId,
  toStateSeq,
} from "./action-test-fixtures.js";
import { cardRef } from "./battle-actions-test-fixtures.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

test("preserves public Life reveal origin in player-visible cardRevealed events", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const lifeCard = must(p1State.life[0], "top life").card;
  state.eventJournal = [
    {
      id: toEngineEventId("event:life-revealed"),
      seq: 1,
      type: "cardRevealed",
      payload: {
        revealId: "reveal:sequence:life-reaction:0",
        cards: [cardRef(lifeCard, p1)],
        origin: { zone: "life", playerId: p1 },
        selectionSetId: "set:revealed-top-life",
      },
      visibility: { type: "public" },
      createdAtStateSeq: toStateSeq(state.seq),
    },
  ];

  const forP1 = filterStateForPlayer(state, p1);
  const forP2 = filterStateForPlayer(state, p2);

  for (const view of [forP1, forP2]) {
    const event = must(view.events[0], "life reveal event");
    assert.equal(event.type, "cardRevealed");
    assert.deepEqual((event.payload as { origin?: unknown }).origin, {
      zone: "life",
      playerId: p1,
    });
  }
});
