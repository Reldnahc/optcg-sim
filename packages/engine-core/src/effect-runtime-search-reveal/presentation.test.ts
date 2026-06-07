import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  CardRef,
  Effect,
  EffectTextSpanId,
  EffectQueueEntry,
} from "@optcg/types";

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
} from "../effect-runtime-queue/test-support.js";
import { filterStateForPlayer } from "../view/filter-state-for-player.js";

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

const supportedSearchWithRemaining = (): Extract<
  Effect,
  { type: "search" }
> => ({
  type: "search",
  request: {
    ...supportedSearch().request,
    lookCount: 3,
    remainingCards: {
      destination: "deck",
      position: "bottom",
      order: "ownerChoice",
    },
  },
});

const createQueuedSearchState = (
  effect: Extract<Effect, { type: "search" }> = supportedSearch(),
) => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const source = player.leader;
  const lookCount = effect.request.lookCount ?? 0;
  const missingDeckCards = Math.max(0, lookCount - player.deck.length);
  if (missingDeckCards > 0) {
    const movedFromHand = player.hand
      .slice(0, missingDeckCards)
      .map((card, index) => ({
        ...card,
        zone: {
          zone: "deck" as const,
          playerId: p1,
          slot: "deck" as const,
          index: player.deck.length + index,
        },
      }));
    player.deck = [...player.deck, ...movedFromHand];
    player.hand = player.hand.slice(missingDeckCards).map((card, index) => ({
      ...card,
      zone: {
        zone: "hand" as const,
        playerId: p1,
        slot: "hand" as const,
        index,
      },
    }));
  }
  const topDeckCards = player.deck.slice(0, lookCount);
  player.deck = [
    ...topDeckCards.map((card, index) => ({
      ...card,
      cardId:
        `search-reveal-character-top-${String(index)}` as typeof card.cardId,
    })),
    ...player.deck.slice(lookCount),
  ];
  for (const searched of player.deck.slice(0, lookCount)) {
    state.cardManifest.cards[searched.cardId] = resolvedCard({
      cardId: searched.cardId,
      category: "character",
    });
  }

  const effectBlockId = toEffectId("OP01-015:auto-search-reveal-1");
  const baseEntry = queueDrawForP1();
  const entry: EffectQueueEntry = {
    ...baseEntry,
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: {
      ...baseEntry.sourceSnapshot,
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: p1,
      controllerId: p1,
      zone: source.zone,
      category: "leader",
    },
    effectBlockId,
    sourcePresencePolicy: "mustRemainInSameZone",
  };
  const sourceCard = resolvedCard({
    cardId: entry.source.cardId,
    category: "leader",
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "search-reveal-definition",
      rulesVersion: "search-reveal-rules",
      sourceTextHash: "search-reveal-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    entry.source.cardId,
    sourceCard.support,
  );
  const definition = {
    ...baseDefinition,
    effects: [
      {
        ...must(baseDefinition.effects[0], "base effect"),
        id: effectBlockId,
        effect,
        sourcePresencePolicy: "mustRemainInSameZone" as const,
      },
    ],
  };
  state.cardManifest.cards[entry.source.cardId] = sourceCard;
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "search-reveal-definition": definition,
  };
  return { entry, state };
};

const respondWithCards = (
  decisionId: NonNullable<
    ReturnType<typeof createActiveState>["pendingDecision"]
  >["id"],
  cards: CardRef[],
): Extract<Action, { type: "respondToDecision" }> => ({
  type: "respondToDecision",
  decisionId,
  response: { type: "cards", cards },
});

test("queued search reveal presentation is visible while choosing and on resolution", () => {
  const { entry, state } = createQueuedSearchState();
  const presentation = {
    source: entry.source,
    textKind: "effect" as const,
    activeSpanIds: ["span:body:search" as EffectTextSpanId],
  };
  state.effectQueue = [{ ...entry, presentation }];

  const created = processEffectRuntime(state);
  const decision = must(created.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectCards");
  assert.deepEqual(
    filterStateForPlayer(created.state, p1).activeEffectText,
    presentation,
  );

  const candidate = must(decision.candidates[0], "candidate").card;
  const resolved = applyAction(
    created.state,
    respondWithCards(decision.id, [candidate]),
  );
  const effectResolved = must(
    resolved.events.find((event) => event.type === "effectResolved"),
    "effectResolved event",
  );

  assert.deepEqual(effectResolved.payload, {
    queueEntryId: entry.id,
    timingWindowId: entry.timingWindowId,
    generation: entry.generation,
    effectBlockId: entry.effectBlockId,
    sourcePresencePolicy: entry.sourcePresencePolicy,
    orderingGroup: entry.orderingGroup,
    presentation,
    status: "resolved",
  });
});

test("queued search reveal presentation narrows while choosing and ordering remaining cards", () => {
  const { entry, state } = createQueuedSearchState(
    supportedSearchWithRemaining(),
  );
  state.effectQueue = [
    {
      ...entry,
      presentation: {
        source: entry.source,
        textKind: "effect",
        activeSpanIds: [
          "span:search:selection",
          "span:search:remaining",
        ] as EffectTextSpanId[],
      },
    },
  ];

  const created = processEffectRuntime(state);
  const decision = must(created.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectCards");
  assert.deepEqual(filterStateForPlayer(created.state, p1).activeEffectText, {
    source: entry.source,
    textKind: "effect",
    activeSpanIds: ["span:search:selection"],
  });

  const candidate = must(decision.candidates[0], "candidate").card;
  const ordered = applyAction(
    created.state,
    respondWithCards(decision.id, [candidate]),
  );

  assert.equal(ordered.state.pendingDecision?.type, "orderCards");
  assert.deepEqual(filterStateForPlayer(ordered.state, p1).activeEffectText, {
    source: entry.source,
    textKind: "effect",
    activeSpanIds: ["span:search:remaining"],
  });
});
