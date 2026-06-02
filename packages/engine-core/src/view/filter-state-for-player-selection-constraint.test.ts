import assert from "node:assert/strict";
import { test } from "vitest";

import { toDecisionId } from "../action-results.js";
import {
  createActiveState,
  must,
  p1,
  resolvedCard,
} from "../action-test-fixtures.js";
import { cardRef } from "../battle/test-fixtures.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

test("selectCards projection exposes visible different-name selection groups", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const first = must(p1State.hand[0], "first card");
  const second = must(p1State.hand[1], "second card");
  state.cardManifest.cards[first.cardId] = {
    ...resolvedCard({ cardId: first.cardId, category: "character" }),
    name: "Same Elder",
  };
  state.cardManifest.cards[second.cardId] = {
    ...resolvedCard({ cardId: second.cardId, category: "character" }),
    name: "Same Elder",
  };
  p1State.trash = [
    {
      ...first,
      zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 },
    },
    {
      ...second,
      zone: { zone: "trash", playerId: p1, slot: "trash", index: 1 },
    },
  ];
  const firstRef = cardRef(must(p1State.trash[0], "first trash"), p1);
  const secondRef = cardRef(must(p1State.trash[1], "second trash"), p1);
  state.pendingDecision = {
    id: toDecisionId("decision:selectCards:trash-selection:queue"),
    type: "selectCards",
    playerId: p1,
    prompt: "Choose cards from trash.",
    causedBy: { type: "ruleProcess", name: "test:trashSelection" },
    visibility: { type: "public" },
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "self",
      zone: "trash",
      min: 0,
      max: 2,
      allowFewerIfUnavailable: true,
      visibility: "public",
      filter: { custom: "differentNames" },
    },
    candidates: [
      { card: firstRef, visibility: { type: "public" } },
      { card: secondRef, visibility: { type: "public" } },
    ],
  };

  const view = filterStateForPlayer(state, p1);

  assert.deepEqual(
    view.pendingDecision?.type === "selectCards"
      ? view.pendingDecision.selectionConstraint
      : undefined,
    {
      type: "differentNames",
      groupKeysByInstanceId: {
        [String(first.instanceId)]: "Same Elder",
        [String(second.instanceId)]: "Same Elder",
      },
    },
  );
});
