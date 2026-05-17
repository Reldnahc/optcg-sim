import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectQueueEntry } from "./effect-runtime-queue-processing-test-support.js";
import {
  applyAction,
  createActiveState,
  must,
  p1,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toCardId,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
} from "./effect-runtime-queue-processing-test-support.js";

test("queued conditioned supported search-reveal pauses for private choice and then resolves", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const originalTopDeck = must(p1State.deck[0], "top deck");
  const topDeckCardId = toCardId("queue-conditioned-search-top");
  p1State.deck = [
    { ...originalTopDeck, cardId: topDeckCardId },
    ...p1State.deck.slice(1),
  ];
  const topDeck = must(p1State.deck[0], "top deck after override");
  state.cardManifest.cards[topDeck.cardId] = resolvedCard({
    cardId: topDeck.cardId,
    category: "character",
  });
  const source = p1State.leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-queue-conditioned-search",
      rulesVersion: "queue-conditioned-search-rules",
      sourceTextHash: "queue-conditioned-search-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const searchEffectId = toEffectId("queue-conditioned-search-effect");
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.effectDefinitionsVersion =
    baseDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-queue-conditioned-search": {
      ...baseDefinition,
      effects: [
        {
          ...must(baseDefinition.effects[0], "base effect"),
          id: searchEffectId,
          condition: { type: "yourTurn" },
          effect: {
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
          },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      ],
    },
  };
  state.turn.turnPlayerId = p1;
  const queueEntry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-conditioned-search"),
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: toSourceSnapshot(source, p1, p1),
    effectBlockId: searchEffectId,
    sourcePresencePolicy: "mustRemainInSameZone",
  };
  state.effectQueue = [queueEntry];

  const created = processEffectRuntime(state);
  assert.equal(created.errors, undefined);
  assert.deepEqual(
    created.events.map((event) => event.type),
    ["cardRevealed", "decisionCreated"],
  );
  assert.deepEqual(created.state.effectQueue, [queueEntry]);
  const decision = must(created.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectCards");
  const candidate = must(decision.candidates[0], "candidate").card;

  const applied = applyAction(created.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [candidate] },
  });
  assert.equal(applied.errors, undefined);
  assert.deepEqual(
    applied.events.map((event) => event.type),
    ["decisionResolved", "cardMoved", "effectResolved"],
  );
  assert.deepEqual(applied.state.effectQueue, []);
  assert.equal(applied.state.pendingDecision, undefined);
  assert.equal(
    must(applied.state.players[p1], "p1").hand.at(-1)?.instanceId,
    topDeck.instanceId,
  );
  const continued = processEffectRuntime(applied.state);
  assert.equal(continued.errors, undefined);
  assert.deepEqual(continued.events, []);
});
