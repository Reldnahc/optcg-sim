import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, Effect, SelectionId } from "@optcg/types";

import { sequenceQueueState } from "./search-reveal-test-support.js";
import {
  applyAction,
  must,
  p1,
  processEffectRuntime,
  resolvedCard,
} from "../effect-runtime-queue/test-support.js";

const ownerDeckBottomTrashSelection =
  "trashSelection:owner-deck-bottom" as SelectionId;
const selfTrashDeckPlacementSelection =
  "trashSelection:self-trash-to-deck-placement" as SelectionId;

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

const selectedCountPowerSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      connector: "always",
      saveResultAs: selfTrashDeckPlacementSelection,
      effect: {
        type: "selectCards",
        zone: "trash",
        player: "self",
        chooser: "self",
        min: 0,
        max: "available",
        filter: { categories: ["character"], cost: { min: 4 } },
        saveAs: selfTrashDeckPlacementSelection,
        visibility: "bothPlayers",
      },
    },
    {
      connector: "then",
      effect: {
        type: "moveSelected",
        selection: selfTrashDeckPlacementSelection,
        from: "trash",
        to: "deck",
        position: "bottom",
      },
    },
    {
      connector: "then",
      effect: {
        type: "modifyPower",
        target: { type: "self" },
        value: {
          type: "selectedCardCount",
          selection: selfTrashDeckPlacementSelection,
          per: 3,
          multiplier: 1000,
        },
        duration: { type: "thisTurn" },
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

test("selectedCardCount power value groups selected cards by per count", () => {
  const { state } = sequenceQueueState(selectedCountPowerSequence(), 0);
  const player = must(state.players[p1], "p1");
  const trashCards = player.hand.slice(0, 4);
  const firstTrash = must(trashCards[0], "first trash");
  const secondTrash = must(trashCards[1], "second trash");
  const thirdTrash = must(trashCards[2], "third trash");
  const fourthTrash = must(trashCards[3], "fourth trash");
  player.hand = player.hand.slice(4);
  player.trash = reindexTrash(trashCards);
  for (const [card, cost] of [
    [firstTrash, 4],
    [secondTrash, 5],
    [thirdTrash, 6],
  ] as const) {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
      cost,
    });
  }
  state.cardManifest.cards[fourthTrash.cardId] = resolvedCard({
    cardId: fourthTrash.cardId,
    category: "event",
    cost: 4,
  });

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pending decision");
  assert.equal(paused.errors, undefined);
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.candidates.length, 3);

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "cards",
      cards: decision.candidates.map((candidate) => candidate.card),
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  const modifier = must(
    resolved.state.continuousEffects.at(-1)?.modifier,
    "power modifier",
  );
  assert.equal(modifier.layer, "powerAdd");
  assert.deepEqual(modifier.operation, { type: "addPower", value: 1000 });
});
