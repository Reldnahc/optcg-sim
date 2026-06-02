import assert from "node:assert/strict";

import type { Effect, QueueEntryId } from "@optcg/types";
import { test } from "vitest";

import {
  createActiveState,
  must,
  p1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "../action-test-fixtures.js";
import { applyAction } from "../actions.js";
import { processEffectRuntime } from "../effect-runtime.js";
import {
  queueDrawForP1,
  toEffectId,
  toQueueEntryId,
} from "../effect-runtime-queue/test-support.js";

const supportedSearch = (): Extract<Effect, { type: "search" }> => ({
  type: "search",
  request: {
    zone: "deck",
    player: "self",
    lookCount: 1,
    filter: { categories: ["character"] },
    min: 0,
    max: 1,
    destination: "hand",
    revealTo: "chooserOnly",
    shuffleAfter: false,
  },
});

test("search reveal chosen from trigger-order resumes the remaining same-window trigger after selection", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const topDeck = must(player.deck[0], "top deck");
  state.cardManifest.cards[topDeck.cardId] = resolvedCard({
    cardId: topDeck.cardId,
    category: "character",
  });

  const source = player.leader;
  const sourceCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "search-then-draw-definition",
      rulesVersion: "search-then-draw-rules",
      sourceTextHash: "search-then-draw-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    sourceCard.support,
  );
  const baseEffect = must(baseDefinition.effects[0], "base effect");
  const searchEffect = {
    ...baseEffect,
    id: toEffectId("trigger-search"),
    effect: supportedSearch(),
  };
  const drawEffect = {
    ...baseEffect,
    id: toEffectId("trigger-draw"),
  };
  const baseEntry = {
    ...queueDrawForP1(),
    timingWindowId: "window-search-and-draw" as ReturnType<
      typeof queueDrawForP1
    >["timingWindowId"],
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: {
      ...queueDrawForP1().sourceSnapshot,
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: p1,
      controllerId: p1,
      zone: source.zone,
      category: "leader" as const,
    },
    sourcePresencePolicy: "mustRemainInSameZone" as const,
  };
  const searchEntry = {
    ...baseEntry,
    id: toQueueEntryId("queue-entry-search"),
    effectBlockId: searchEffect.id,
    createdAtEventSeq: 5,
  };
  const drawEntry = {
    ...baseEntry,
    id: toQueueEntryId("queue-entry-draw"),
    effectBlockId: drawEffect.id,
    createdAtEventSeq: 6,
  };
  state.cardManifest.cards[source.cardId] = sourceCard;
  state.cardManifest.effectDefinitionsVersion =
    baseDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "search-then-draw-definition": {
      ...baseDefinition,
      effects: [searchEffect, drawEffect],
    },
  };
  state.effectQueue = [searchEntry, drawEntry];

  const paused = processEffectRuntime(state);
  const orderDecision = must(paused.state.pendingDecision, "trigger order");
  assert.equal(orderDecision.type, "chooseTriggerOrder");
  const selectedSearch = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: orderDecision.id,
    response: {
      type: "orderedIds",
      ids: [searchEntry.id],
    },
  });
  const searchDecision = must(
    selectedSearch.state.pendingDecision,
    "search decision",
  );
  assert.equal(searchDecision.type, "selectCards");
  const candidate = must(searchDecision.candidates[0], "candidate").card;

  const resolved = applyAction(selectedSearch.state, {
    type: "respondToDecision",
    decisionId: searchDecision.id,
    response: { type: "cards", cards: [candidate] },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.deepEqual(resolved.state.effectQueue, []);
  assert.deepEqual(
    resolved.events
      .filter((event) => event.type === "effectResolved")
      .map(
        (event) =>
          (event.payload as { queueEntryId: QueueEntryId }).queueEntryId,
      ),
    [searchEntry.id, drawEntry.id],
  );
  assert.equal(
    must(resolved.state.players[p1], "p1").hand.some(
      (card) => card.instanceId === topDeck.instanceId,
    ),
    true,
  );
});
