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
const selectedFieldTargetsSelection =
  "selectedTargets:self-field-count" as SelectionId;
const deckRevealToHandSelection =
  "deckSelection:runtime-reveal-to-hand" as SelectionId;

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

const selectedTargetCountPowerSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      connector: "always",
      saveResultAs: selectedFieldTargetsSelection,
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: "self",
          zone: "characterArea",
          filter: { categories: ["character"], cost: { max: 2 } },
          min: 0,
          max: 3,
          allowFewerIfUnavailable: true,
          visibility: "public",
        },
      },
    },
    {
      connector: "then",
      effect: {
        type: "modifyPower",
        target: { type: "self" },
        value: {
          type: "selectedCardCount",
          selection: selectedFieldTargetsSelection,
          multiplier: 1000,
        },
        duration: { type: "thisTurn" },
      },
    },
  ],
});

const deckRevealToHandSequence = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      connector: "always",
      saveResultAs: deckRevealToHandSelection,
      effect: {
        type: "selectCards",
        zone: "deck",
        player: "self",
        chooser: "self",
        min: 0,
        max: 1,
        saveAs: deckRevealToHandSelection,
        visibility: "chooserOnly",
      },
    },
    {
      connector: "ifPreviousSucceeded",
      effect: {
        type: "revealSelected",
        selection: deckRevealToHandSelection,
        visibility: "bothPlayers",
      },
    },
    {
      connector: "ifPreviousSucceeded",
      effect: {
        type: "moveSelected",
        selection: deckRevealToHandSelection,
        from: "deck",
        to: "hand",
      },
    },
    {
      connector: "then",
      effect: { type: "shuffleDeck", player: "self" },
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

test("selectedCardCount power value counts saved selected field targets", () => {
  const { state } = sequenceQueueState(selectedTargetCountPowerSequence(), 0);
  const player = must(state.players[p1], "p1");
  const sourceCharacter = must(player.characters[0], "source character");
  const firstCharacter = must(player.hand[0], "first character");
  const secondCharacter = must(player.hand[1], "second character");
  player.hand = player.hand.slice(2);
  player.characters = [
    sourceCharacter,
    {
      ...firstCharacter,
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 1,
      },
    },
    {
      ...secondCharacter,
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 2,
      },
    },
  ];
  for (const card of [firstCharacter, secondCharacter]) {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
      cost: 2,
    });
  }

  const paused = processEffectRuntime(state);
  assert.equal(paused.errors, undefined);
  const decision = must(paused.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectTargets");
  assert.equal(decision.candidates.length, 2);

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: decision.candidates.map((candidate) => candidate.card),
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  const modifier = must(
    resolved.state.continuousEffects.at(-1)?.modifier,
    "power modifier",
  );
  assert.equal(modifier.layer, "powerAdd");
  assert.deepEqual(modifier.operation, { type: "addPower", value: 2000 });
});

test("revealed deck selection moves selected card to hand and shuffles deck", () => {
  const { state } = sequenceQueueState(deckRevealToHandSequence(), 2);
  const player = must(state.players[p1], "p1");
  const selected = must(player.deck[0], "selected deck card");

  const paused = processEffectRuntime(state);
  assert.equal(paused.errors, undefined);
  const decision = must(paused.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.candidates.length, 2);

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "cards",
      cards: [must(decision.candidates[0], "first deck candidate").card],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  const nextPlayer = must(resolved.state.players[p1], "resolved p1");
  assert.equal(
    nextPlayer.hand.some((card) => card.instanceId === selected.instanceId),
    true,
  );
  assert.equal(
    nextPlayer.deck.some((card) => card.instanceId === selected.instanceId),
    false,
  );
  assert.equal(resolved.state.effectExecutionFrames.length, 0);
});
