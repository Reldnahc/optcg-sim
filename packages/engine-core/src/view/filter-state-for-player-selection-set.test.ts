import assert from "node:assert/strict";
import { test } from "vitest";

import { toDecisionId } from "../action-results.js";
import {
  createActiveState,
  must,
  p1,
  toStateSeq,
} from "../action-test-fixtures.js";
import { cardRef } from "../battle/test-fixtures.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

test("set selectCards projection uses the latest reveal record for reused selection set ids", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const staleCard = must(p1State.hand[0], "stale searched card");
  const legalCard = must(p1State.hand[1], "legal searched card");
  const staleRef = cardRef(staleCard, p1);
  const legalRef = cardRef(legalCard, p1);
  const selectionSetId = "set:looked-cards:reused-search-id";

  state.revealedCards = [
    {
      id: "reveal:sequence:stale-search",
      cards: [staleRef],
      visibility: { type: "private", playerId: p1 },
      origin: "topOfDeck",
      selectionSetId,
      createdAtStateSeq: toStateSeq(state.seq),
      cleanupPolicy: "returnToOrigin",
    },
    {
      id: "reveal:sequence:current-search",
      cards: [legalRef],
      visibility: { type: "private", playerId: p1 },
      origin: "topOfDeck",
      selectionSetId,
      createdAtStateSeq: toStateSeq(state.seq + 1),
      cleanupPolicy: "returnToOrigin",
    },
  ];
  state.pendingDecision = {
    id: toDecisionId("decision:selectCards:sequence-set:current-search"),
    type: "selectCards",
    playerId: p1,
    prompt: "Choose a revealed card or decline.",
    causedBy: { type: "ruleProcess", name: "test:selectFromSet" },
    visibility: { type: "private", playerId: p1 },
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "self",
      zone: "deck",
      min: 0,
      max: 1,
      allowFewerIfUnavailable: true,
      visibility: "privateToChooser",
      set: selectionSetId as never,
    },
    candidates: [
      { card: legalRef, visibility: { type: "private", playerId: p1 } },
    ],
  };

  const view = filterStateForPlayer(state, p1);

  assert.deepEqual(
    view.pendingDecision?.type === "selectCards"
      ? view.pendingDecision.choices
      : undefined,
    [{ card: legalRef, selectable: true }],
  );
});
