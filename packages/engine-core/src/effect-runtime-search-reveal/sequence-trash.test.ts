import assert from "node:assert/strict";
import { test } from "vitest";

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
} from "../effect-runtime-queue-processing-test-support.js";

test("sequence resumes from search reveal into later trash-from-hand segment", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  while (p1State.deck.length < 3) {
    const base = must(p1State.deck.at(-1), "deck card");
    p1State.deck.push({
      ...base,
      instanceId:
        `${String(base.instanceId)}:${String(p1State.deck.length)}` as typeof base.instanceId,
      zone: { ...base.zone, index: p1State.deck.length },
    });
  }
  for (const [index, id] of [
    "queue-search-celestial-dragon",
    "queue-search-remainder-one",
    "queue-search-remainder-two",
  ].entries()) {
    const card = must(p1State.deck[index], "looked card");
    card.cardId = toCardId(id);
    state.cardManifest.cards[card.cardId] = {
      ...resolvedCard({ cardId: card.cardId, category: "character" }),
      types: [index === 0 ? "Celestial Dragons" : "Other"],
      name: id,
    };
  }
  const selectedDeck = must(p1State.deck[0], "selected");
  const source = p1State.leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-queue-search-then-trash-hand",
      rulesVersion: "queue-search-then-trash-rules",
      sourceTextHash: "queue-search-then-trash-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const sequenceEffectId = toEffectId("queue-search-then-trash-effect");
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.effectDefinitionsVersion =
    baseDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-queue-search-then-trash-hand": {
      ...baseDefinition,
      effects: [
        {
          ...must(baseDefinition.effects[0], "base effect"),
          id: sequenceEffectId,
          effect: {
            type: "sequence",
            effects: [
              {
                connector: "always",
                effect: {
                  type: "search",
                  request: {
                    zone: "deck",
                    player: "self",
                    lookCount: 3,
                    filter: { typesAny: ["Celestial Dragons"] },
                    min: 0,
                    max: 1,
                    destination: "hand",
                    revealTo: "bothPlayers",
                    remainingCards: { destination: "trash" },
                    shuffleAfter: false,
                  },
                },
              },
              {
                connector: "then",
                effect: {
                  type: "trashFromHand",
                  count: 1,
                  player: "self",
                  chooser: "self",
                },
              },
            ],
          },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      ],
    },
  };
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-search-then-trash"),
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: sequenceEffectId,
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  ];

  const created = processEffectRuntime(state);
  assert.equal(created.errors, undefined);
  const decision = must(created.state.pendingDecision, "pending search");
  assert.equal(decision.type, "selectCards");
  const candidate = must(decision.candidates[0], "candidate").card;
  assert.equal(candidate.instanceId, selectedDeck.instanceId);

  const applied = applyAction(created.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [candidate] },
  });

  assert.equal(applied.errors, undefined);
  assert.deepEqual(
    applied.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardMoved",
      "cardRevealed",
      "cardMoved",
      "cardTrashed",
      "cardMoved",
      "cardTrashed",
      "decisionCreated",
    ],
  );
  const trashDecision = must(
    applied.state.pendingDecision,
    "pending trash decision",
  );
  assert.equal(trashDecision.type, "selectCards");
  assert.equal(trashDecision.request.zone, "hand");
});
