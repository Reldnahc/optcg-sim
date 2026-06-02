import assert from "node:assert/strict";
import type { Action, Effect, EngineEvent } from "@optcg/types";
import { test } from "vitest";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "../action-test-fixtures.js";
import { applyAction, getLegalActions } from "../actions.js";
import {
  createSupportedSearchRevealChoiceDecision,
  createSupportedSearchRevealChoiceDecisionFromTransientSet,
  createSupportedSearchRevealTransientSet,
} from "../effect-runtime-search-reveal.js";
import { processEffectRuntime } from "../effect-runtime.js";
import { filterStateForPlayer } from "../view/filter-state-for-player.js";
import {
  queueDrawForP1,
  toEffectId,
} from "../effect-runtime-queue/test-support.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";

const supportedSearch = (
  overrides: Partial<Extract<Effect, { type: "search" }>["request"]> = {},
): Extract<Effect, { type: "search" }> => ({
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
    ...overrides,
  },
});

const markTopDeckCard = (
  state: ReturnType<typeof createActiveState>,
  category: "character" | "event",
) => {
  const player = must(state.players[p1], "p1");
  const topDeck = must(player.deck[0], "top deck");
  state.cardManifest.cards[topDeck.cardId] = resolvedCard({
    cardId: topDeck.cardId,
    category,
  });
  return topDeck;
};

const createSearchRevealDecisionState = () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const originalDeck = [...player.deck];
  const originalHand = [...player.hand];
  const topDeck = markTopDeckCard(state, "character");
  const result = createSupportedSearchRevealChoiceDecision(
    state,
    queueDrawForP1(),
    supportedSearch(),
  );
  assert.equal(result.ok, true);
  assert.equal(result.kind, "decisionCreated");
  const decision = must(result.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectCards");
  const candidate = must(decision.candidates[0], "candidate").card;
  return {
    candidate,
    decision,
    originalDeck,
    originalHand,
    state: result.state,
    topDeck,
  };
};

const createQueuedSearchRevealState = (
  category: "character" | "event" = "character",
) => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const originalTopDeck = must(player.deck[0], "top deck");
  player.deck = [
    {
      ...originalTopDeck,
      cardId: `search-reveal-${category}-top` as typeof originalTopDeck.cardId,
    },
    ...player.deck.slice(1),
  ];
  const topDeck = markTopDeckCard(state, category);
  const baseEntry = queueDrawForP1();
  const source = player.leader;
  const effectBlockId = toEffectId("OP01-015:auto-search-reveal-1");
  const entry = {
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
      category: "leader" as const,
    },
    effectBlockId,
    sourcePresencePolicy: "mustRemainInSameZone" as const,
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
  const baseEffect = must(baseDefinition.effects[0], "base effect");
  const definition = {
    ...baseDefinition,
    effects: [
      {
        ...baseEffect,
        id: effectBlockId,
        effect: supportedSearch(),
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
  state.effectQueue = [entry];
  return { entry, state, topDeck };
};

const respondWithCards = (
  decisionId: ReturnType<
    typeof createSearchRevealDecisionState
  >["decision"]["id"],
  cards: ReturnType<typeof createSearchRevealDecisionState>["candidate"][],
  playerId?: typeof p1,
): Extract<Action, { type: "respondToDecision" }> => ({
  type: "respondToDecision",
  decisionId,
  ...(playerId === undefined ? {} : { playerId }),
  response: { type: "cards", cards },
});

const assertDoesNotContain = (
  value: unknown,
  hidden: string,
  label: string,
) => {
  assert.equal(JSON.stringify(value).includes(hidden), false, label);
};

const assertStrictlyIncreasingEventOrder = (
  events: readonly EngineEvent[],
  label: string,
) => {
  for (let index = 1; index < events.length; index += 1) {
    const previous = must(events[index - 1], `${label} previous event`);
    const current = must(events[index], `${label} current event`);
    assert.equal(
      current.seq > previous.seq,
      true,
      `${label} event seq should increase`,
    );
    assert.notEqual(current.id, previous.id, `${label} event ids differ`);
  }
  assert.equal(
    new Set(events.map((event) => event.id)).size,
    events.length,
    `${label} event ids should be unique`,
  );
};

const assertEventsAppendToJournal = (
  previousJournalLength: number,
  result: Pick<ReturnType<typeof applyAction>, "events" | "state">,
  label: string,
) => {
  assert.deepEqual(
    result.state.eventJournal.slice(previousJournalLength),
    result.events,
    `${label} eventJournal suffix should match returned events`,
  );
  assertStrictlyIncreasingEventOrder(result.events, `${label} result events`);
  assertStrictlyIncreasingEventOrder(
    result.state.eventJournal,
    `${label} eventJournal`,
  );
};

test("supported top-1 Character deck search creates deterministic transient reveal set", () => {
  const state = createActiveState();
  const topDeck = markTopDeckCard(state, "character");
  const entry = queueDrawForP1();

  const result = createSupportedSearchRevealTransientSet(
    state,
    entry,
    supportedSearch(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.kind, "created");
  assert.equal(result.state, state);
  assert.deepEqual(result.events, []);
  assert.equal(result.transientSet.id, "set:search-reveal:queue-entry-1");
  assert.deepEqual(result.transientSet.cards, [
    {
      instanceId: topDeck.instanceId,
      cardId: topDeck.cardId,
      playerId: p1,
      zone: topDeck.zone,
    },
  ]);
  assert.equal(result.transientSet.origin, "topOfDeck");
  assert.equal(result.transientSet.ownerId, p1);
  assert.equal(result.transientSet.controllerId, p1);
  assert.deepEqual(result.transientSet.visibility, {
    type: "private",
    playerId: p1,
  });
  assert.equal(result.transientSet.cleanupPolicy, "returnToOrigin");
  assert.equal(typeof result.transientSetHash, "string");

  const repeated = createSupportedSearchRevealTransientSet(
    state,
    entry,
    supportedSearch(),
  );
  assert.equal(repeated.ok, true);
  assert.equal(repeated.kind, "created");
  assert.equal(repeated.transientSetHash, result.transientSetHash);
});

test("supported top-1 deck search creates no transient set for absent or ineligible top card", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const originalDeck = [...player.deck];
  markTopDeckCard(state, "event");

  const ineligible = createSupportedSearchRevealTransientSet(
    state,
    queueDrawForP1(),
    supportedSearch(),
  );

  assert.equal(ineligible.ok, true);
  assert.equal(ineligible.kind, "noEligibleCandidate");
  assert.equal(ineligible.state, state);
  assert.deepEqual(ineligible.events, []);
  assert.deepEqual(player.deck, originalDeck);

  player.deck = [];
  const absent = createSupportedSearchRevealTransientSet(
    state,
    queueDrawForP1(),
    supportedSearch(),
  );

  assert.equal(absent.ok, true);
  assert.equal(absent.kind, "noEligibleCandidate");
  assert.equal(absent.state, state);
  assert.deepEqual(absent.events, []);
});

test("unsupported search reveal shapes fail closed without mutation or events", () => {
  const unsupportedEffects: Extract<Effect, { type: "search" }>[] = [
    supportedSearch({ zone: "trash" }),
    supportedSearch({ player: "opponent" }),
    supportedSearch({ lookCount: 2 }),
    supportedSearch({ filter: { categories: ["event"] } }),
    supportedSearch({ min: 1 }),
    supportedSearch({ max: 2 }),
    supportedSearch({ destination: "trash" }),
    supportedSearch({ shuffleAfter: true }),
  ];
  for (const [index, effect] of unsupportedEffects.entries()) {
    const state = createActiveState();
    const topDeck = markTopDeckCard(state, "character");
    const beforeHash = hashCanonicalStateValue(state);
    const result = createSupportedSearchRevealTransientSet(
      state,
      queueDrawForP1(),
      effect,
    );

    assert.equal(result.ok, false, `case ${String(index)}`);
    assert.equal(result.state, state);
    assert.deepEqual(result.events, []);
    assert.equal(hashCanonicalStateValue(result.state), beforeHash);
    assert.equal(
      must(state.players[p1], "p1").deck[0]?.instanceId,
      topDeck.instanceId,
    );
    assert.equal(result.error.type, "effectRuntimeError");
  }
});

test("eligible search reveal path creates private reveal record and chooser-owned selectCards decision", () => {
  const state = createActiveState();
  const topDeck = markTopDeckCard(state, "character");
  const entry = queueDrawForP1();

  const result = createSupportedSearchRevealChoiceDecision(
    state,
    entry,
    supportedSearch(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.kind, "decisionCreated");
  assert.equal(result.state === state, false);
  assert.equal(result.state.pendingDecision?.type, "selectCards");
  const decision = must(result.state.pendingDecision, "pending decision");
  assert.equal(decision.id, "decision:selectCards:search-reveal:queue-entry-1");
  assert.equal(decision.playerId, p1);
  assert.deepEqual(decision.visibility, { type: "private", playerId: p1 });
  assert.deepEqual(decision.request, {
    timing: "onResolution",
    chooser: "self",
    set: "set:search-reveal:queue-entry-1",
    filter: { categories: ["character"] },
    min: 0,
    max: 1,
    allowFewerIfUnavailable: true,
    visibility: "privateToChooser",
  });
  assert.deepEqual(decision.candidates, [
    {
      card: {
        instanceId: topDeck.instanceId,
        cardId: topDeck.cardId,
        playerId: p1,
        zone: topDeck.zone,
      },
      visibility: { type: "private", playerId: p1 },
    },
  ]);
  assert.deepEqual(decision.defaultResponse, { type: "cards", cards: [] });

  assert.deepEqual(
    result.events.map((event) => event.type),
    ["cardRevealed", "decisionCreated"],
  );
  assert.deepEqual(
    result.events.map((event) => event.visibility),
    [
      { type: "private", playerId: p1 },
      { type: "private", playerId: p1 },
    ],
  );
  assert.deepEqual(result.events[0]?.payload, {
    revealId: "reveal:search-reveal:queue-entry-1",
    cards: [decision.candidates[0]?.card],
    origin: "topOfDeck",
    selectionSetId: "set:search-reveal:queue-entry-1",
  });
  assert.deepEqual(result.events[1]?.payload, {
    decisionId: decision.id,
    decisionType: "selectCards",
    playerId: p1,
  });
  assert.deepEqual(result.state.revealedCards, [
    {
      id: "reveal:search-reveal:queue-entry-1",
      cards: [decision.candidates[0]?.card],
      visibility: { type: "private", playerId: p1 },
      origin: "topOfDeck",
      createdAtStateSeq: result.state.seq,
      cleanupPolicy: "returnToOrigin",
    },
  ]);
  assert.deepEqual(result.state.eventJournal.slice(-2), result.events);
});

test("eligible search reveal lifecycle preserves creation and response event order", () => {
  const state = createActiveState();
  const topDeck = markTopDeckCard(state, "character");
  const created = createSupportedSearchRevealChoiceDecision(
    state,
    queueDrawForP1(),
    supportedSearch(),
  );

  assert.equal(created.ok, true);
  assert.equal(created.kind, "decisionCreated");
  const decision = must(created.state.pendingDecision, "pending decision");
  if (decision.type !== "selectCards") {
    throw new TypeError("Expected search reveal selectCards decision.");
  }
  const candidate = must(decision.candidates[0], "candidate").card;
  assert.deepEqual(
    created.events.map((event) => event.type),
    ["cardRevealed", "decisionCreated"],
  );
  assertEventsAppendToJournal(
    state.eventJournal.length,
    created,
    "search reveal creation",
  );

  const resolved = applyAction(
    created.state,
    respondWithCards(decision.id, [candidate]),
  );

  assert.equal(resolved.errors, undefined);
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    ["decisionResolved", "cardMoved"],
  );
  assertEventsAppendToJournal(
    created.state.eventJournal.length,
    resolved,
    "search reveal response",
  );
  assert.deepEqual(
    [...created.events, ...resolved.events].map((event) => event.type),
    ["cardRevealed", "decisionCreated", "decisionResolved", "cardMoved"],
  );
  assertStrictlyIncreasingEventOrder(
    [...created.events, ...resolved.events],
    "search reveal lifecycle",
  );
  assert.deepEqual(resolved.state.revealedCards, []);
  const continued = processEffectRuntime(resolved.state);
  assert.equal(continued.errors, undefined);
  assert.deepEqual(continued.events, []);
  assert.equal(continued.state, resolved.state);
  assert.equal(continued.stateHash, resolved.stateHash);
  assert.equal(
    must(resolved.state.players[p1], "p1").hand.at(-1)?.instanceId,
    topDeck.instanceId,
  );
});

test("queued search reveal effect pauses for private choice and resolves through the queue", () => {
  const { entry, state, topDeck } = createQueuedSearchRevealState();

  const created = processEffectRuntime(state);

  assert.equal(created.errors, undefined);
  assert.deepEqual(
    created.events.map((event) => event.type),
    ["cardRevealed", "decisionCreated"],
  );
  assert.deepEqual(created.state.effectQueue, [entry]);
  const decision = must(created.state.pendingDecision, "pending decision");
  assert.equal(decision.type, "selectCards");
  const candidate = must(decision.candidates[0], "candidate").card;
  const chooserActions = getLegalActions(created.state, p1).filter(
    (action) => action.type === "respondToDecision",
  );
  assert.deepEqual(
    chooserActions.map((action) => action.response),
    [
      { type: "cards", cards: [] },
      { type: "cards", cards: [candidate] },
    ],
  );
  assert.deepEqual(
    getLegalActions(created.state, p2).filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );

  const resolved = applyAction(
    created.state,
    respondWithCards(decision.id, [candidate]),
  );

  assert.equal(resolved.errors, undefined);
  assert.deepEqual(
    resolved.events.map((event) => event.type),
    ["decisionResolved", "cardMoved", "effectResolved"],
  );
  assert.deepEqual(
    [...created.events, ...resolved.events].map((event) => event.type),
    [
      "cardRevealed",
      "decisionCreated",
      "decisionResolved",
      "cardMoved",
      "effectResolved",
    ],
  );
  assertStrictlyIncreasingEventOrder(
    [...created.events, ...resolved.events],
    "queued search reveal lifecycle",
  );
  assert.deepEqual(resolved.state.effectQueue, []);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.deepEqual(resolved.state.revealedCards, []);
  assert.equal(
    must(resolved.state.players[p1], "p1").hand.at(-1)?.instanceId,
    topDeck.instanceId,
  );

  const continued = processEffectRuntime(resolved.state);
  assert.equal(continued.errors, undefined);
  assert.deepEqual(continued.events, []);
  assert.equal(continued.state, resolved.state);
  assert.equal(continued.stateHash, resolved.stateHash);
});

test("queued search reveal with no eligible card resolves without reveal or identity leak", () => {
  const { entry, state, topDeck } = createQueuedSearchRevealState("event");
  const originalDeckIds = must(state.players[p1], "p1").deck.map(
    (card) => card.instanceId,
  );

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.state.effectQueue, []);
  assert.deepEqual(result.state.revealedCards, []);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["effectResolved"],
  );
  assert.deepEqual(result.events[0]?.payload, {
    queueEntryId: entry.id,
    timingWindowId: entry.timingWindowId,
    generation: entry.generation,
    effectBlockId: entry.effectBlockId,
    sourcePresencePolicy: entry.sourcePresencePolicy,
    orderingGroup: entry.orderingGroup,
    status: "resolved",
  });
  assert.deepEqual(
    must(result.state.players[p1], "p1").deck.map((card) => card.instanceId),
    originalDeckIds,
  );
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
  assertDoesNotContain(result.events, String(topDeck.cardId), "event card");
  assertDoesNotContain(
    filterStateForPlayer(result.state, p1),
    String(topDeck.cardId),
    "chooser view",
  );
  assertDoesNotContain(
    filterStateForPlayer(result.state, p2),
    String(topDeck.cardId),
    "opponent view",
  );
});

test("search reveal decision candidates are visible only to the chooser", () => {
  const state = createActiveState();
  const topDeck = markTopDeckCard(state, "character");
  const result = createSupportedSearchRevealChoiceDecision(
    state,
    queueDrawForP1(),
    supportedSearch(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.kind, "decisionCreated");

  const chooserView = filterStateForPlayer(result.state, p1);
  const opponentView = filterStateForPlayer(result.state, p2);
  const chooserSerialized = JSON.stringify(chooserView);
  const opponentSerialized = JSON.stringify(opponentView);

  assert.equal(chooserView.pendingDecision?.type, "selectCards");
  assert.equal(chooserSerialized.includes("queueEntryId"), false);
  assert.equal(chooserSerialized.includes("effectBlockId"), false);
  assert.deepEqual(
    chooserView.revealedCards.map((record) => record.id),
    ["reveal:search-reveal:queue-entry-1"],
  );
  assert.equal(chooserSerialized.includes(String(topDeck.cardId)), true);
  assert.equal(chooserSerialized.includes(String(topDeck.instanceId)), true);
  assert.equal(opponentView.pendingDecision, undefined);
  assert.deepEqual(opponentView.revealedCards, []);
  assert.equal(opponentSerialized.includes(String(topDeck.cardId)), false);
  assert.equal(opponentSerialized.includes(String(topDeck.instanceId)), false);
});

test("search reveal PlayerViews keep legal actions and metadata content-agnostic", () => {
  const state = createActiveState();
  const topDeck = markTopDeckCard(state, "character");
  const result = createSupportedSearchRevealChoiceDecision(
    state,
    queueDrawForP1(),
    supportedSearch(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.kind, "decisionCreated");
  const decision = must(result.state.pendingDecision, "pending decision");
  if (decision.type !== "selectCards") {
    throw new TypeError("Expected search reveal selectCards decision.");
  }
  const candidate = must(decision.candidates[0], "candidate").card;
  const chooserView = filterStateForPlayer(result.state, p1);
  const opponentView = filterStateForPlayer(result.state, p2);

  assert.deepEqual(chooserView.pendingDecision, {
    id: decision.id,
    type: "selectCards",
    playerId: p1,
    prompt: "Choose a revealed card or decline.",
    causedBy: { type: "ruleProcess", name: "privateCausality" },
    min: 0,
    max: 1,
    candidates: [{ card: candidate }],
    choices: [{ card: candidate, selectable: true }],
  });
  assert.deepEqual(chooserView.revealedCards, [
    {
      id: "reveal:search-reveal:queue-entry-1",
      cards: [candidate],
      visibility: "privateToRecipient",
      origin: "topOfDeck",
      createdAtStateSeq: result.state.seq,
      cleanupPolicy: "returnToOrigin",
    },
  ]);
  assert.deepEqual(
    chooserView.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [{ type: "respondToDecision", decisionId: decision.id }],
  );
  assertDoesNotContain(chooserView.pendingDecision, "set:search-reveal", "set");
  assertDoesNotContain(
    chooserView.legalActions,
    String(topDeck.cardId),
    "card",
  );
  assertDoesNotContain(
    chooserView.legalActions,
    String(topDeck.instanceId),
    "instance",
  );

  assert.equal(opponentView.pendingDecision, undefined);
  assert.deepEqual(opponentView.revealedCards, []);
  assert.deepEqual(
    opponentView.legalActions.filter(
      (action) => action.type === "respondToDecision",
    ),
    [],
  );
  assert.equal(
    opponentView.opponent.deckCount,
    must(state.players[p1], "p1").deck.length,
  );
  assertDoesNotContain(opponentView, String(topDeck.cardId), "opponent card");
  assertDoesNotContain(
    opponentView,
    String(topDeck.instanceId),
    "opponent instance",
  );
});

test("no eligible top-card search reveal creates no decision and leaks no identity", () => {
  const state = createActiveState();
  const topDeck = markTopDeckCard(state, "event");
  const beforeHash = hashCanonicalStateValue(state);
  const previousEventJournalLength = state.eventJournal.length;
  const originalDeckIds = must(state.players[p1], "p1").deck.map(
    (card) => card.instanceId,
  );

  const result = createSupportedSearchRevealChoiceDecision(
    state,
    queueDrawForP1(),
    supportedSearch(),
  );

  assert.equal(result.ok, true);
  assert.equal(result.kind, "noEligibleCandidate");
  assert.equal(result.state, state);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.events, []);
  assert.deepEqual(
    result.state.eventJournal
      .slice(previousEventJournalLength)
      .filter(
        (event) =>
          event.type === "cardRevealed" || event.type === "decisionCreated",
      ),
    [],
  );
  assert.deepEqual(result.state.revealedCards, []);
  assert.deepEqual(
    must(result.state.players[p1], "p1").deck.map((card) => card.instanceId),
    originalDeckIds,
  );
  assert.equal(hashCanonicalStateValue(result.state), beforeHash);
  assert.equal(
    JSON.stringify(filterStateForPlayer(result.state, p1)).includes(
      String(topDeck.cardId),
    ),
    false,
  );
  assert.equal(
    JSON.stringify(filterStateForPlayer(result.state, p2)).includes(
      String(topDeck.cardId),
    ),
    false,
  );
});

test("malformed search reveal transient set rejects without mutation", () => {
  const state = createActiveState();
  const topDeck = markTopDeckCard(state, "character");
  const entry = queueDrawForP1();
  const malformedSet: Parameters<
    typeof createSupportedSearchRevealChoiceDecisionFromTransientSet
  >[3] = {
    id: "set:search-reveal:queue-entry-1",
    cards: [
      {
        instanceId: topDeck.instanceId,
        cardId: topDeck.cardId,
        playerId: p1,
        zone: topDeck.zone,
      },
      {
        instanceId: "extra-instance" as typeof topDeck.instanceId,
        cardId: topDeck.cardId,
        playerId: p1,
        zone: topDeck.zone,
      },
    ],
    origin: "topOfDeck",
    ownerId: p1,
    controllerId: p1,
    visibility: { type: "private", playerId: p1 },
    cleanupPolicy: "returnToOrigin",
  };

  const result = createSupportedSearchRevealChoiceDecisionFromTransientSet(
    state,
    entry,
    supportedSearch(),
    malformedSet,
  );

  assert.equal(result.ok, false);
  assert.equal(result.state, state);
  assert.deepEqual(result.events, []);
  assert.equal(result.error.type, "effectRuntimeError");
  assert.deepEqual(result.error.details, {
    reason: "unsupported-transient-set-state",
  });
  assert.equal(state.pendingDecision, undefined);
  assert.deepEqual(state.revealedCards, []);
});

test("search reveal response accepts canonical respondToDecision payload without playerId", () => {
  const { candidate, decision, state } = createSearchRevealDecisionState();
  const result = applyAction(state, respondWithCards(decision.id, [candidate]));
  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
});

test("valid search reveal choice moves selected Character to hand and clears transient state privately", () => {
  const { candidate, decision, originalDeck, originalHand, state, topDeck } =
    createSearchRevealDecisionState();

  const result = applyAction(state, respondWithCards(decision.id, [candidate]));

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.state.revealedCards, []);
  assert.deepEqual(
    result.events.map((event) => [event.type, event.visibility.type]),
    [
      ["decisionResolved", "private"],
      ["cardMoved", "private"],
    ],
  );
  assert.deepEqual(result.events[0]?.payload, {
    decisionId: decision.id,
    decisionType: "selectCards",
    playerId: p1,
    responseType: "cards",
    selectedCount: 1,
  });
  assert.equal(
    (result.events[1]?.payload as { instanceId?: unknown }).instanceId,
    topDeck.instanceId,
  );

  const nextPlayer = must(result.state.players[p1], "next p1");
  assert.deepEqual(
    nextPlayer.hand.map((card) => card.instanceId),
    [...originalHand.map((card) => card.instanceId), topDeck.instanceId],
  );
  assert.deepEqual(
    nextPlayer.deck.map((card) => card.instanceId),
    originalDeck.slice(1).map((card) => card.instanceId),
  );
  assert.equal(
    JSON.stringify(filterStateForPlayer(result.state, p2)).includes(
      String(topDeck.instanceId),
    ),
    false,
  );
});

test("equivalent search reveal accepted choices produce stable creation and cleanup hashes", () => {
  const run = () => {
    const { candidate, decision, state } = createSearchRevealDecisionState();
    const creationHash = hashCanonicalStateValue(state);
    const resolved = applyAction(
      state,
      respondWithCards(decision.id, [candidate]),
    );
    assert.equal(resolved.errors, undefined);
    assert.deepEqual(resolved.state.revealedCards, []);
    assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
    return {
      cleanupHash: resolved.stateHash,
      creationHash,
    };
  };

  const first = run();
  const second = run();

  assert.deepEqual(second, first);
});

test("search reveal cleanup removes stale declined candidates from player-facing outputs", () => {
  const { decision, state, topDeck } = createSearchRevealDecisionState();

  const result = applyAction(state, respondWithCards(decision.id, []));

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.state.revealedCards, []);
  assertDoesNotContain(
    filterStateForPlayer(result.state, p1),
    String(topDeck.cardId),
    "chooser stale card",
  );
  assertDoesNotContain(
    filterStateForPlayer(result.state, p1),
    String(topDeck.instanceId),
    "chooser stale instance",
  );
  assertDoesNotContain(
    filterStateForPlayer(result.state, p2),
    String(topDeck.cardId),
    "opponent stale card",
  );
  assertDoesNotContain(
    filterStateForPlayer(result.state, p2),
    String(topDeck.instanceId),
    "opponent stale instance",
  );
});

test("valid zero-card search reveal choice declines and clears transient state without moving cards", () => {
  const { decision, originalDeck, originalHand, state, topDeck } =
    createSearchRevealDecisionState();

  const result = applyAction(state, respondWithCards(decision.id, []));

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.state.revealedCards, []);
  assert.deepEqual(
    result.events.map((event) => [event.type, event.visibility.type]),
    [["decisionResolved", "private"]],
  );
  assert.deepEqual(result.events[0]?.payload, {
    decisionId: decision.id,
    decisionType: "selectCards",
    playerId: p1,
    responseType: "cards",
    selectedCount: 0,
  });

  const nextPlayer = must(result.state.players[p1], "next p1");
  assert.deepEqual(
    nextPlayer.hand.map((card) => card.instanceId),
    originalHand.map((card) => card.instanceId),
  );
  assert.deepEqual(
    nextPlayer.deck.map((card) => card.instanceId),
    originalDeck.map((card) => card.instanceId),
  );
  assert.equal(nextPlayer.deck[0]?.instanceId, topDeck.instanceId);
  assert.equal(
    JSON.stringify(filterStateForPlayer(result.state, p2)).includes(
      String(topDeck.instanceId),
    ),
    false,
  );
});

test("equivalent search reveal declined choices produce stable cleanup hashes", () => {
  const run = () => {
    const { decision, state } = createSearchRevealDecisionState();
    const creationHash = hashCanonicalStateValue(state);
    const resolved = applyAction(state, respondWithCards(decision.id, []));
    assert.equal(resolved.errors, undefined);
    assert.deepEqual(resolved.state.revealedCards, []);
    assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
    return {
      cleanupHash: resolved.stateHash,
      creationHash,
    };
  };

  const first = run();
  const second = run();

  assert.deepEqual(second, first);
});

test("search reveal cleanup removes only the active transient reveal record", () => {
  const { candidate, decision, state } = createSearchRevealDecisionState();
  const activeReveal = must(state.revealedCards[0], "active reveal");
  const unrelatedReveal = {
    ...activeReveal,
    id: "reveal:search-reveal:unrelated-queue-entry",
  };
  const staleState = {
    ...state,
    revealedCards: [...state.revealedCards, unrelatedReveal],
  };

  const cleanAccepted = applyAction(
    state,
    respondWithCards(decision.id, [candidate]),
  );
  const staleAccepted = applyAction(
    staleState,
    respondWithCards(decision.id, [candidate]),
  );
  assert.equal(cleanAccepted.errors, undefined);
  assert.equal(staleAccepted.errors, undefined);
  assert.deepEqual(staleAccepted.state.revealedCards, [unrelatedReveal]);
  assert.equal(
    hashCanonicalStateValue(cleanAccepted.state),
    cleanAccepted.stateHash,
  );

  const cleanDeclined = applyAction(state, respondWithCards(decision.id, []));
  const staleDeclined = applyAction(
    staleState,
    respondWithCards(decision.id, []),
  );
  assert.equal(cleanDeclined.errors, undefined);
  assert.equal(staleDeclined.errors, undefined);
  assert.deepEqual(staleDeclined.state.revealedCards, [unrelatedReveal]);
  assert.equal(
    hashCanonicalStateValue(cleanDeclined.state),
    cleanDeclined.stateHash,
  );
});

test("invalid search reveal choice responses fail closed without mutation or events", () => {
  const { candidate, decision, state } = createSearchRevealDecisionState();
  const invalidResponses: Extract<Action, { type: "respondToDecision" }>[] = [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "targets", targets: [candidate] },
    },
    respondWithCards(decision.id, [candidate, candidate]),
    respondWithCards(decision.id, [
      {
        ...candidate,
        instanceId: "not-a-candidate",
      } as typeof candidate,
    ]),
    respondWithCards(decision.id, [candidate], p2),
    {
      type: "respondToDecision",
      decisionId: decision.id,
      playerId: null,
      response: { type: "cards", cards: [candidate] },
    } as unknown as Extract<Action, { type: "respondToDecision" }>,
  ];

  for (const action of invalidResponses) {
    const beforeHash = hashCanonicalStateValue(state);
    const result = applyAction(state, action);
    assert.equal(result.state, state);
    assert.deepEqual(result.events, []);
    assert.equal(result.errors?.[0]?.type, "invalidDecisionResponse");
    assert.equal(hashCanonicalStateValue(result.state), beforeHash);
  }
});

test("stale search reveal choice envelope fails closed without mutation or events", () => {
  const { candidate, decision, state } = createSearchRevealDecisionState();
  const noDecisionState = { ...state };
  delete noDecisionState.pendingDecision;
  const staleStates: {
    state: typeof state;
    errorType: NonNullable<
      ReturnType<typeof applyAction>["errors"]
    >[number]["type"];
  }[] = [
    { state: noDecisionState, errorType: "illegalAction" },
    {
      state: { ...state, revealedCards: [] },
      errorType: "invalidDecisionResponse",
    },
    {
      state: {
        ...state,
        cardManifest: {
          ...state.cardManifest,
          cards: {
            ...state.cardManifest.cards,
            [candidate.cardId]: resolvedCard({
              cardId: candidate.cardId,
              category: "event",
            }),
          },
        },
      },
      errorType: "invalidDecisionResponse",
    },
  ];

  for (const { state: staleState, errorType } of staleStates) {
    const beforeHash = hashCanonicalStateValue(staleState);
    const result = applyAction(
      staleState,
      respondWithCards(decision.id, [candidate]),
    );
    assert.equal(result.state, staleState);
    assert.deepEqual(result.events, []);
    assert.equal(result.errors?.[0]?.type, errorType);
    assert.equal(hashCanonicalStateValue(result.state), beforeHash);
  }
});
