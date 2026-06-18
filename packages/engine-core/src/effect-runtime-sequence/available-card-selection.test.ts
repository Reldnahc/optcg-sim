import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, Effect, SelectionId } from "@optcg/types";

import { sequenceQueueState } from "./search-reveal-test-support.js";
import {
  must,
  p1,
  processEffectRuntime,
  resolvedCard,
} from "../effect-runtime-queue/test-support.js";

const ownerDeckBottomTrashSelection =
  "trashSelection:owner-deck-bottom" as SelectionId;

const reindexTrash = (cards: readonly CardInstance[]): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "trash", playerId: p1, slot: "trash", index },
  }));

const availableTrashSelectionSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      connector: "always",
      saveResultAs: ownerDeckBottomTrashSelection,
      effect: {
        type: "selectCards",
        zone: "trash",
        player: "self",
        chooser: "self",
        min: 0,
        max: "available",
        filter: { categories: ["character"], cost: { min: 4 } },
        saveAs: ownerDeckBottomTrashSelection,
        visibility: "bothPlayers",
      },
    },
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection: ownerDeckBottomTrashSelection,
        from: "trash",
        to: "deck",
        position: "bottom",
      },
    },
  ],
});

test("selectCards max available resolves to current matching candidate count", () => {
  const { state } = sequenceQueueState(availableTrashSelectionSequence(), 0);
  const player = must(state.players[p1], "p1");
  const trashCards = player.hand.slice(0, 3);
  const firstTrash = must(trashCards[0], "first trash");
  const secondTrash = must(trashCards[1], "second trash");
  const thirdTrash = must(trashCards[2], "third trash");
  player.hand = player.hand.slice(3);
  player.trash = reindexTrash(trashCards);
  state.cardManifest.cards[firstTrash.cardId] = resolvedCard({
    cardId: firstTrash.cardId,
    category: "character",
    cost: 4,
  });
  state.cardManifest.cards[secondTrash.cardId] = resolvedCard({
    cardId: secondTrash.cardId,
    category: "character",
    cost: 5,
  });
  state.cardManifest.cards[thirdTrash.cardId] = resolvedCard({
    cardId: thirdTrash.cardId,
    category: "event",
    cost: 4,
  });

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  const decision = must(result.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.request.min, 0);
  assert.equal(decision.request.max, 2);
  assert.equal(decision.candidates.length, 2);
});
