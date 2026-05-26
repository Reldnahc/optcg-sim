import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, EffectDefinition } from "@optcg/types";

import { applyPlayCard, getPlayCardLegalActions } from "./play-card.js";
import {
  must,
  p1,
  resolvedCard,
  reviewedMainEventDrawDefinition,
} from "./action-test-fixtures.js";
import {
  hasPlayCardAction,
  setupMainPlayState,
} from "./play-card-test-fixtures.js";

const reviewedMainEventSearchDefinition = (
  cardId: CardInstance["cardId"],
  support: ReturnType<typeof resolvedCard>["support"],
): EffectDefinition => {
  const base = reviewedMainEventDrawDefinition(cardId, support);
  const baseEffect = must(base.effects[0], "base effect");
  return {
    ...base,
    effects: [
      {
        ...baseEffect,
        effect: {
          type: "search",
          request: {
            zone: "deck",
            player: "self",
            lookCount: 3,
            filter: {
              typesAny: ["Celestial Dragons"],
              nameNot: ["The Five Elders Are at Your Service!!!"],
            },
            min: 0,
            max: 1,
            destination: "hand",
            revealTo: "bothPlayers",
            shuffleAfter: false,
            remainingCards: { destination: "trash" },
          },
        },
      },
    ],
  };
};

test("implemented-dsl Main Event search play queues its search decision", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const eventCard = must(p1State.hand[0], "event");
  const topDeck = must(p1State.deck[0], "top deck");
  const implemented = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 0,
    effectText:
      "[Main] Look at 3 cards from the top of your deck; reveal up to 1 {Celestial Dragons} type card other than [The Five Elders Are at Your Service!!!] and add it to your hand. Then, trash the rest.",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-main-event-search",
    },
  });
  state.cardManifest.cards[eventCard.cardId] = implemented;
  state.cardManifest.cards[topDeck.cardId] = {
    ...resolvedCard({
      cardId: topDeck.cardId,
      category: "character",
      cost: 1,
      power: 1000,
    }),
    types: ["Celestial Dragons"],
  };
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  state.cardManifest.effectDefinitions = {
    "def-main-event-search": reviewedMainEventSearchDefinition(
      eventCard.cardId,
      implemented.support,
    ),
  };

  assert.equal(
    hasPlayCardAction(getPlayCardLegalActions(state, p1), eventCard),
    true,
  );

  const result = applyPlayCard(state, {
    type: "playCard",
    cardInstanceId: eventCard.instanceId,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision?.type, "selectCards");
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "cardRevealed",
      "cardMoved",
      "cardTrashed",
      "cardPlayed",
      "ruleProcessingChecked",
      "effectQueued",
      "cardRevealed",
      "decisionCreated",
    ],
  );
});
