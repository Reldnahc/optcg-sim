import assert from "node:assert/strict";
import { test } from "vitest";

import type { Action, CardRef, Effect, PlayerId } from "@optcg/types";

import { createInitialState } from "./setup/initial-state.js";
import { startMulliganFlow } from "./setup/mulligan.js";
import { applyAction, getLegalActions } from "./actions.js";
import { createChooseQuantityDecisionForQueuedEffect } from "./effect-runtime.js";
import { filterStateForPlayer } from "./view/filter-state-for-player.js";
import {
  createActiveState,
  createInput,
  must,
  p1,
  p2,
  resolvedCard,
} from "./action-test-fixtures.js";
import {
  queueDrawForP1,
  queueingState,
} from "./effect-runtime-queue/test-support.js";
import { createSupportedSearchRevealChoiceDecision } from "./effect-runtime-search-reveal.js";
import {
  setupFullCharacterPlayState,
  setupMainPlayState,
} from "./play-card/test-fixtures.js";
import { effectDefinition } from "./battle/test-fixtures.js";
import {
  toDecisionId,
  toEffectId,
  toQueueEntryId,
} from "./action-dispatcher-test-support.js";
import { hashCanonicalStateValue } from "./state/canonical-state.js";

type SearchEffect = Extract<Effect, { type: "search" }>;

const searchRequest = (
  overrides: Partial<SearchEffect["request"]> = {},
): SearchEffect => ({
  type: "search",
  request: {
    zone: "deck",
    player: "self",
    lookCount: 5,
    filter: { categories: ["character"], colorsAny: ["green"] },
    min: 0,
    max: 1,
    destination: "hand",
    revealTo: "chooserOnly",
    remainingCards: {
      destination: "deck",
      position: "bottom",
      order: "ownerChoice",
    },
    shuffleAfter: false,
    ...overrides,
  },
});

const openSearchState = (
  state: ReturnType<typeof createActiveState>,
  effect: SearchEffect,
) => {
  const entry = queueDrawForP1();
  state.effectQueue = [entry];
  const opened = createSupportedSearchRevealChoiceDecision(
    state,
    entry,
    effect,
  );
  if (!opened.ok || opened.kind !== "decisionCreated") {
    assert.fail("expected search decision");
  }
  return opened.state;
};

const setDeck = (
  state: ReturnType<typeof createActiveState>,
  ids: readonly string[],
) => {
  const player = must(state.players[p1], "p1");
  while (player.deck.length < ids.length) {
    const base = must(player.deck.at(-1), "deck card");
    player.deck.push({
      ...base,
      instanceId:
        `${String(base.instanceId)}:${String(player.deck.length)}` as typeof base.instanceId,
      zone: { ...base.zone, index: player.deck.length },
    });
  }
  player.deck = player.deck.map((card, index) => {
    const id = ids[index];
    if (id === undefined) return card;
    const cardId = id as typeof card.cardId;
    state.cardManifest.cards[cardId] = {
      ...resolvedCard({
        cardId,
        category: id.includes("event") ? "event" : "character",
      }),
      colors: [id.includes("blue") ? "blue" : "green"],
      types: [id.includes("type") ? "Navy" : "Pirate"],
      name: id.includes("excluded") ? "Excluded" : id,
    };
    return { ...card, cardId };
  });
  return player.deck.slice(0, ids.length);
};

const cardsResponse = (
  decisionId: NonNullable<
    ReturnType<typeof createActiveState>["pendingDecision"]
  >["id"],
  cards: readonly CardRef[],
  playerId?: PlayerId,
): Extract<Action, { type: "respondToDecision" }> => ({
  type: "respondToDecision",
  decisionId,
  ...(playerId === undefined ? {} : { playerId }),
  response: { type: "cards", cards: [...cards] },
});

const orderResponse = (
  decisionId: NonNullable<
    ReturnType<typeof createActiveState>["pendingDecision"]
  >["id"],
  cards: readonly CardRef[],
  playerId?: PlayerId,
): Extract<Action, { type: "respondToDecision" }> => ({
  type: "respondToDecision",
  decisionId,
  ...(playerId === undefined ? {} : { playerId }),
  response: {
    type: "orderedIds",
    ids: cards.map((card) => String(card.instanceId)),
  },
});

test("getLegalActions suppresses phase actions while a decision is pending", () => {
  const setup = createInitialState(createInput());
  const pending = startMulliganFlow(setup).state;
  pending.status = { type: "active" };
  pending.turn.phase = "main";

  assert.deepEqual(getLegalActions(pending, p1), [
    { type: "concede", playerId: p1 },
  ]);
});

test("search selection and ordering reject malformed duplicate and wrong-player responses without mutation", () => {
  const state = createActiveState();
  must(state.players[p1], "p1").deck = must(state.players[p1], "p1").deck.slice(
    0,
    3,
  );
  setDeck(state, [
    "sup-002d-invalid-a",
    "sup-002d-invalid-b",
    "sup-002d-invalid-c",
  ]);
  const opened = openSearchState(
    state,
    searchRequest({ lookCount: 3, filter: {} }),
  );
  const select = must(opened.pendingDecision, "select");
  assert.equal(select.type, "selectCards");
  const first = must(select.candidates[0], "first").card;
  const second = must(select.candidates[1], "second").card;
  for (const action of [
    cardsResponse(select.id, [first, second]),
    cardsResponse(select.id, [first], p2),
    {
      type: "respondToDecision",
      decisionId: select.id,
      response: { type: "orderedIds", ids: [] },
    } as Action,
  ]) {
    const before = hashCanonicalStateValue(opened);
    const result = applyAction(opened, action);
    assert.equal(result.errors?.[0]?.type, "invalidDecisionResponse");
    assert.deepEqual(result.events, []);
    assert.equal(result.stateHash, before);
  }
  const selected = applyAction(opened, cardsResponse(select.id, [first]));
  const order = must(selected.state.pendingDecision, "order");
  assert.equal(order.type, "orderCards");
  for (const action of [
    orderResponse(order.id, order.cards, p2),
    {
      type: "respondToDecision",
      decisionId: order.id,
      response: { type: "orderedIds", ids: ["missing"] },
    } as Action,
    {
      type: "respondToDecision",
      decisionId: order.id,
      response: {
        type: "orderedIds",
        ids: [
          String(order.cards[0]?.instanceId),
          String(order.cards[0]?.instanceId),
        ],
      },
    } as Action,
  ]) {
    const before = hashCanonicalStateValue(selected.state);
    const result = applyAction(selected.state, action);
    assert.equal(result.errors?.[0]?.type, "invalidDecisionResponse");
    assert.deepEqual(result.events, []);
    assert.equal(result.stateHash, before);
  }
  const resolved = applyAction(
    selected.state,
    orderResponse(order.id, [...order.cards].reverse()),
  );
  assert.equal(resolved.errors, undefined);
  assert.equal(
    JSON.stringify(filterStateForPlayer(resolved.state, p2)).includes(
      String(first.cardId),
    ),
    false,
  );
  assert.deepEqual(
    must(resolved.state.players[p1], "p1").deck.map((card) => card.zone.index),
    [0, 1],
  );
  assert.equal(
    must(resolved.state.players[p1], "p1").hand.at(-1)?.instanceId,
    first.instanceId,
  );
});

test("getLegalActions keeps play-card payment and overflow responses unchanged when runtime queues are empty", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 2,
    power: 3000,
  });
  const opened = applyAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });
  const paymentLegal = getLegalActions(opened.state, p1);

  assert.equal(
    paymentLegal.filter((action) => action.type === "respondToDecision").length,
    3,
  );
  assert.deepEqual(paymentLegal[0], { type: "concede", playerId: p1 });

  const {
    state: overflowState,
    newCharacter,
    existingCharacters,
  } = setupFullCharacterPlayState(0);
  const overflowOpened = applyAction(overflowState, {
    type: "playCard",
    cardInstanceId: newCharacter.instanceId,
  });
  const overflowLegal = getLegalActions(overflowOpened.state, p1);

  assert.equal(
    overflowLegal.filter((action) => action.type === "respondToDecision")
      .length,
    existingCharacters.length,
  );
  assert.deepEqual(overflowLegal[0], { type: "concede", playerId: p1 });
});

test("pending decisions reject non-concession applyAction requests without mutation", () => {
  const setup = createInitialState(createInput());
  const state = startMulliganFlow(setup).state;
  state.status = { type: "active" };
  state.turn.phase = "main";
  const before = JSON.stringify(state);

  const result = applyAction(state, { type: "endMainPhase" });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
});

test("respondToDecision rejects stale decision id for pending chooseTriggerOrder without mutation", () => {
  const state = createActiveState();
  state.pendingDecision = {
    id: toDecisionId("decision:choose-trigger-order"),
    type: "chooseTriggerOrder",
    playerId: p1,
    prompt: "Choose next trigger to resolve.",
    causedBy: { type: "ruleProcess", name: "effectRuntime:chooseTriggerOrder" },
    visibility: { type: "public" },
    triggerIds: [toQueueEntryId("queue-a"), toQueueEntryId("queue-b")],
    constraints: { mustUseAll: true },
  };
  const before = JSON.stringify(state);

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: toDecisionId("decision:stale"),
    response: { type: "orderedIds", ids: ["queue-b", "queue-a"] },
  });

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Decision id does not match current pending decision.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("getLegalActions exposes chooseTriggerOrder response only for the decision player", () => {
  const state = createActiveState();
  state.pendingDecision = {
    id: toDecisionId("decision:choose-trigger-order"),
    type: "chooseTriggerOrder",
    playerId: p1,
    prompt: "Choose next trigger to resolve.",
    causedBy: { type: "ruleProcess", name: "effectRuntime:chooseTriggerOrder" },
    visibility: { type: "public" },
    triggerIds: [toQueueEntryId("queue-a"), toQueueEntryId("queue-b")],
    constraints: { mustUseAll: true },
  };

  assert.deepEqual(getLegalActions(state, p1), [
    { type: "concede", playerId: p1 },
    {
      type: "respondToDecision",
      decisionId: toDecisionId("decision:choose-trigger-order"),
      response: { type: "orderedIds", ids: ["queue-a"] },
    },
  ]);
  assert.deepEqual(getLegalActions(state, p2), [
    { type: "concede", playerId: p2 },
  ]);
});

test("getLegalActions exposes confirmLifeTrigger respondToDecision only to decision player", () => {
  const state = createActiveState();
  const p2State = must(state.players[p2], "p2");
  const lifeCard = must(p2State.life[0], "top life").card;
  const definition = effectDefinition(lifeCard.cardId, { type: "trigger" });
  const effect = must(definition.effects[0], "trigger effect");
  const effectWithoutFlags = { ...effect };
  delete effectWithoutFlags.optional;
  delete effectWithoutFlags.oncePerTurn;
  const supportedDefinition = {
    ...definition,
    effects: [
      {
        ...effectWithoutFlags,
        sourcePresencePolicy: "resolveFromLastKnownInformation" as const,
      },
    ],
  };
  state.cardManifest.cards[lifeCard.cardId] = resolvedCard({
    cardId: lifeCard.cardId,
    category: "character",
    power: 1000,
    triggerText: "TRIGGER: draw 1 card",
    support: {
      cardId: lifeCard.cardId,
      status: "implemented-dsl",
      effectDefinitionId: "def-life-trigger",
      tested: true,
      cardDataVersion: state.cardManifest.cardDataVersion,
      rulesVersion: supportedDefinition.metadata.rulesVersion,
      sourceTextHash: supportedDefinition.metadata.sourceTextHash,
    },
  });
  state.cardManifest.effectDefinitionsVersion =
    supportedDefinition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-life-trigger": supportedDefinition,
  };
  state.pendingDecision = {
    id: toDecisionId("decision:life-trigger"),
    type: "confirmLifeTrigger",
    playerId: p2,
    prompt: "Activate life trigger?",
    causedBy: { type: "ruleProcess", name: "battle:lifeTriggerDecision" },
    visibility: { type: "public" },
    card: {
      instanceId: lifeCard.instanceId,
      cardId: lifeCard.cardId,
      playerId: p2,
      zone: lifeCard.zone,
    },
    options: ["activateTrigger", "addToHand"],
  };

  assert.deepEqual(getLegalActions(state, p2), [
    { type: "concede", playerId: p2 },
    {
      type: "respondToDecision",
      decisionId: toDecisionId("decision:life-trigger"),
      response: { type: "lifeTrigger", choice: "activateTrigger" },
    },
    {
      type: "respondToDecision",
      decisionId: toDecisionId("decision:life-trigger"),
      response: { type: "lifeTrigger", choice: "addToHand" },
    },
  ]);
  assert.deepEqual(getLegalActions(state, p1), [
    { type: "concede", playerId: p1 },
  ]);
});

test("respondToDecision rejects stale decision id for pending chooseOptionalActivation without mutation", () => {
  const state = createActiveState();
  const source = must(state.players[p1], "p1").leader;
  state.pendingDecision = {
    id: toDecisionId("decision:choose-optional-activation"),
    type: "chooseOptionalActivation",
    playerId: p1,
    prompt: "Activate optional effect?",
    causedBy: {
      type: "effect",
      queueEntryId: toQueueEntryId("queue-optional-activation"),
      effectId: toEffectId("effect-optional-activation"),
    },
    visibility: { type: "private", playerId: p1 },
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    effectId: toEffectId("effect-optional-activation"),
    options: ["activate", "decline"],
  };
  const before = JSON.stringify(state);

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: toDecisionId("decision:stale-optional"),
    response: { type: "optionalActivation", choice: "activate" },
  });

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Decision id does not match current pending decision.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
});

const setupChooseQuantityDecisionState = () => {
  const state = createActiveState();
  state.pendingDecision = {
    id: toDecisionId("decision:choose-quantity"),
    type: "chooseQuantity",
    playerId: p1,
    prompt: "Choose quantity.",
    causedBy: { type: "ruleProcess", name: "test:chooseQuantity" },
    visibility: { type: "private", playerId: p1 },
    mode: "upTo",
    min: 1,
    max: 3,
  };
  return state;
};

test("getLegalActions exposes chooseQuantity responses only for decision player", () => {
  const state = setupChooseQuantityDecisionState();
  const decisionId = state.pendingDecision?.id;

  assert.deepEqual(getLegalActions(state, p1), [
    { type: "concede", playerId: p1 },
    {
      type: "respondToDecision",
      decisionId,
      response: { type: "chooseQuantity", quantity: 1 },
    },
    {
      type: "respondToDecision",
      decisionId,
      response: { type: "chooseQuantity", quantity: 2 },
    },
    {
      type: "respondToDecision",
      decisionId,
      response: { type: "chooseQuantity", quantity: 3 },
    },
  ]);
  assert.deepEqual(getLegalActions(state, p2), [
    { type: "concede", playerId: p2 },
  ]);
});

test("getLegalActions rejects malformed chooseQuantity bounds and mode", () => {
  const state = setupChooseQuantityDecisionState();
  const malformedDecisions: NonNullable<typeof state.pendingDecision>[] = [
    { ...must(state.pendingDecision, "pending decision"), mode: "bogus" },
    { ...must(state.pendingDecision, "pending decision"), min: -1, max: 1 },
    { ...must(state.pendingDecision, "pending decision"), min: 2, max: 1 },
    {
      ...must(state.pendingDecision, "pending decision"),
      mode: "exact",
      min: 1,
      max: 3,
    },
  ] as NonNullable<typeof state.pendingDecision>[];

  for (const pendingDecision of malformedDecisions) {
    const candidateState = { ...state, pendingDecision };

    assert.deepEqual(getLegalActions(candidateState, p1), [
      { type: "concede", playerId: p1 },
    ]);
  }
});

test("respondToDecision accepts valid chooseQuantity response and resolves decision with sequence increment", () => {
  const state = setupChooseQuantityDecisionState();
  const decision = must(state.pendingDecision, "pending decision");
  const before = structuredClone(state);
  const beforeSeq = state.seq;
  const beforeActionSeq = state.actionSeq;
  const beforeJournalLength = state.eventJournal.length;

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "chooseQuantity", quantity: 2 },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.seq, beforeSeq + 1);
  assert.equal(result.state.actionSeq, beforeActionSeq + 1);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["decisionResolved"],
  );
  assert.deepEqual(result.events[0]?.payload, {
    decisionId: decision.id,
    decisionType: decision.type,
    playerId: decision.playerId,
    responseType: "chooseQuantity",
    quantity: 2,
  });
  assert.deepEqual(
    result.state.eventJournal.slice(beforeJournalLength),
    result.events,
  );
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
  assert.equal(state.pendingDecision?.id, before.pendingDecision?.id);
});

test("respondToDecision rejects negative chooseQuantity min as malformed without mutation", () => {
  const state = setupChooseQuantityDecisionState();
  const pendingDecision = must(state.pendingDecision, "pending decision");
  if (pendingDecision.type !== "chooseQuantity") {
    throw new Error("expected chooseQuantity decision");
  }
  state.pendingDecision = {
    ...pendingDecision,
    min: -1,
    max: 1,
  };
  const decisionId = pendingDecision.id;
  const before = JSON.stringify(state);

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId,
    response: { type: "chooseQuantity", quantity: -1 },
  });

  assert.deepEqual(result.errors, [
    {
      type: "invalidDecisionResponse",
      reason: "chooseQuantity bounds are malformed.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
});

test("player view redacts effect causality for effect-originated chooseQuantity decisions", () => {
  const state = setupChooseQuantityDecisionState();
  state.pendingDecision = {
    ...must(state.pendingDecision, "pending decision"),
    causedBy: {
      type: "effect",
      queueEntryId: toQueueEntryId("queue-private-quantity"),
      effectId: toEffectId("effect-private-quantity"),
    },
  };

  const ownerView = filterStateForPlayer(state, p1);
  const serializedView = JSON.stringify(ownerView);

  assert.deepEqual(ownerView.pendingDecision?.causedBy, {
    type: "ruleProcess",
    name: "privateCausality",
  });
  assert.deepEqual(ownerView.legalActions, [
    { type: "concede", playerId: p1 },
    { type: "respondToDecision", decisionId: state.pendingDecision.id },
  ]);
  assert.equal(serializedView.includes("queue-private-quantity"), false);
  assert.equal(serializedView.includes("effect-private-quantity"), false);
});

test("createChooseQuantityDecisionForQueuedEffect rejects negative bounds without mutation", () => {
  const { state } = queueingState();
  const queued = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-negative-quantity"),
  };
  state.effectQueue = [queued];
  const before = JSON.stringify(state);

  const result = createChooseQuantityDecisionForQueuedEffect(state, queued, {
    playerId: p1,
    prompt: "Choose quantity.",
    mode: "upTo",
    min: -1,
    max: 3,
  });

  assert.equal(result.errors?.[0]?.type, "effectRuntimeError");
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
});

test("respondToDecision rejects stale effect-originated chooseQuantity runtime context without mutation", () => {
  const state = setupChooseQuantityDecisionState();
  state.pendingDecision = {
    ...must(state.pendingDecision, "pending decision"),
    causedBy: {
      type: "effect",
      queueEntryId: toQueueEntryId("queue-missing"),
      effectId: toEffectId("effect-missing"),
    },
  };
  const before = JSON.stringify(state);

  const result = applyAction(state, {
    type: "respondToDecision",
    decisionId: state.pendingDecision.id,
    response: { type: "chooseQuantity", quantity: 2 },
  });

  assert.equal(result.errors?.[0]?.type, "invalidDecisionResponse");
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
});

test("respondToDecision rejects sequence drawUpTo chooseQuantity when frame context is missing", () => {
  const staleState = setupChooseQuantityDecisionState();
  const decision = must(staleState.pendingDecision, "pending decision");
  staleState.pendingDecision = {
    ...decision,
    causedBy: {
      type: "effect",
      queueEntryId: toQueueEntryId("queue-sequence"),
      effectId: toEffectId("effect-sequence"),
    },
  };
  staleState.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-sequence"),
      effectBlockId: toEffectId("effect-sequence"),
      state: "resolving",
    },
  ];
  staleState.effectExecutionFrames = [
    {
      queueEntryId: toQueueEntryId("queue-sequence"),
      effectBlockId: toEffectId("effect-sequence"),
      effectPath: ["effect", "sequence"],
      nextSegmentIndex: 1,
      segmentResults: {},
      savedReferences: {},
      transientSets: {},
      pendingDecision: {
        decisionId: decision.id,
        causedBy: {
          type: "effect",
          queueEntryId: toQueueEntryId("queue-sequence"),
          effectId: toEffectId("effect-sequence"),
        },
        createdAtStateSeq: staleState.seq,
        resumeAtSegmentIndex: 0,
      },
    },
  ];
  const staleStateWithoutFrame = structuredClone(staleState);
  staleStateWithoutFrame.effectExecutionFrames = [];
  const before = JSON.stringify(staleStateWithoutFrame);
  const beforeSeq = staleStateWithoutFrame.seq;

  const result = applyAction(staleStateWithoutFrame, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });

  assert.equal(result.errors?.[0]?.type, "invalidDecisionResponse");
  assert.deepEqual(result.events, []);
  assert.equal(result.state.seq, beforeSeq);
  assert.equal(JSON.stringify(staleStateWithoutFrame), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
});

test("respondToDecision rejects sequence drawUpTo chooseQuantity when frame causality mismatches", () => {
  const staleState = setupChooseQuantityDecisionState();
  const decision = must(staleState.pendingDecision, "pending decision");
  staleState.pendingDecision = {
    ...decision,
    causedBy: {
      type: "effect",
      queueEntryId: toQueueEntryId("queue-sequence"),
      effectId: toEffectId("effect-sequence"),
    },
  };
  staleState.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-sequence"),
      effectBlockId: toEffectId("effect-sequence"),
      state: "resolving",
    },
  ];
  staleState.effectExecutionFrames = [
    {
      queueEntryId: toQueueEntryId("queue-sequence"),
      effectBlockId: toEffectId("effect-sequence"),
      effectPath: ["effect", "sequence"],
      nextSegmentIndex: 1,
      segmentResults: {},
      savedReferences: {},
      transientSets: {},
      pendingDecision: {
        decisionId: decision.id,
        causedBy: {
          type: "effect",
          queueEntryId: toQueueEntryId("queue-other"),
          effectId: toEffectId("effect-other"),
        },
        createdAtStateSeq: staleState.seq,
        resumeAtSegmentIndex: 0,
      },
    },
  ];
  const before = JSON.stringify(staleState);
  const beforeSeq = staleState.seq;

  const result = applyAction(staleState, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });

  assert.equal(result.errors?.[0]?.type, "invalidDecisionResponse");
  assert.deepEqual(result.events, []);
  assert.equal(result.state.seq, beforeSeq);
  assert.equal(JSON.stringify(staleState), before);
  assert.equal(JSON.stringify(result.state), before);
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
});

test("respondToDecision rejects malformed chooseQuantity responses without mutation", () => {
  const state = setupChooseQuantityDecisionState();
  const decisionId = must(state.pendingDecision, "pending decision").id;
  const before = JSON.stringify(state);

  const invalidResponses: Extract<Action, { type: "respondToDecision" }>[] = [
    {
      type: "respondToDecision",
      decisionId,
      response: { type: "orderedIds", ids: [] },
    },
    {
      type: "respondToDecision",
      decisionId,
      response: { type: "chooseQuantity", quantity: 0 },
    },
    {
      type: "respondToDecision",
      decisionId,
      response: { type: "chooseQuantity", quantity: 4 },
    },
    {
      type: "respondToDecision",
      decisionId,
      response: { type: "chooseQuantity", quantity: 1.5 },
    },
    {
      type: "respondToDecision",
      decisionId,
      response: { type: "chooseQuantity", quantity: -1 },
    },
    {
      type: "respondToDecision",
      decisionId,
      response: { type: "chooseQuantity" } as Extract<
        Action,
        { type: "respondToDecision" }
      >["response"],
    },
    {
      type: "respondToDecision",
      decisionId,
    } as Extract<Action, { type: "respondToDecision" }>,
    {
      type: "respondToDecision",
      decisionId,
      response: null,
    } as unknown as Extract<Action, { type: "respondToDecision" }>,
  ];

  for (const action of invalidResponses) {
    const result = applyAction(state, action);
    assert.equal(result.errors?.[0]?.type, "invalidDecisionResponse");
    assert.deepEqual(result.events, []);
    assert.equal(JSON.stringify(state), before);
    assert.equal(JSON.stringify(result.state), before);
    assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
  }
});

test("respondToDecision rejects malformed or wrong-player chooseQuantity envelope without mutation", () => {
  const state = setupChooseQuantityDecisionState();
  const decisionId = must(state.pendingDecision, "pending decision").id;
  const before = JSON.stringify(state);

  const malformedPlayerResult = applyAction(state, {
    type: "respondToDecision",
    decisionId,
    playerId: 1,
    response: { type: "chooseQuantity", quantity: 2 },
  } as Action);
  assert.equal(
    malformedPlayerResult.errors?.[0]?.type,
    "invalidDecisionResponse",
  );
  assert.equal(JSON.stringify(malformedPlayerResult.state), before);

  const wrongPlayerResult = applyAction(state, {
    type: "respondToDecision",
    decisionId,
    playerId: p2,
    response: { type: "chooseQuantity", quantity: 2 },
  } as Action);
  assert.equal(wrongPlayerResult.errors?.[0]?.type, "invalidDecisionResponse");
  assert.equal(JSON.stringify(wrongPlayerResult.state), before);
});

test("public legal actions for chooseQuantity expose decision id only and stale id is deterministic", () => {
  const state = setupChooseQuantityDecisionState();
  const decisionId = must(state.pendingDecision, "pending decision").id;
  const ownerView = filterStateForPlayer(state, p1);
  const opponentView = filterStateForPlayer(state, p2);

  assert.equal(ownerView.pendingDecision?.type, "chooseQuantity");
  assert.deepEqual(ownerView.legalActions, [
    { type: "concede", playerId: p1 },
    { type: "respondToDecision", decisionId },
  ]);
  assert.deepEqual(opponentView.legalActions, [
    { type: "concede", playerId: p2 },
  ]);

  const before = JSON.stringify(state);
  const staleResult = applyAction(state, {
    type: "respondToDecision",
    decisionId: toDecisionId("decision:stale-choose-quantity"),
    response: { type: "chooseQuantity", quantity: 2 },
  });

  assert.deepEqual(staleResult.errors, [
    {
      type: "illegalAction",
      reason: "Decision id does not match current pending decision.",
    },
  ]);
  assert.deepEqual(staleResult.events, []);
  assert.equal(JSON.stringify(staleResult.state), before);
  assert.equal(
    staleResult.stateHash,
    hashCanonicalStateValue(staleResult.state),
  );
});

test("respondToDecision preserves deterministic replay surfaces for accepted and stale chooseQuantity flows", () => {
  const state = setupChooseQuantityDecisionState();
  const decisionId = must(state.pendingDecision, "pending decision").id;
  const acceptedAction: Action = {
    type: "respondToDecision",
    decisionId,
    response: { type: "chooseQuantity", quantity: 2 },
  };
  const staleAction: Action = {
    type: "respondToDecision",
    decisionId: toDecisionId("decision:stale-choose-quantity"),
    response: { type: "chooseQuantity", quantity: 2 },
  };

  const firstAccepted = applyAction(structuredClone(state), acceptedAction);
  const secondAccepted = applyAction(structuredClone(state), acceptedAction);
  const firstStale = applyAction(structuredClone(state), staleAction);
  const secondStale = applyAction(structuredClone(state), staleAction);

  assert.equal(firstAccepted.errors, undefined);
  assert.deepEqual(firstAccepted.events, secondAccepted.events);
  assert.equal(firstAccepted.stateHash, secondAccepted.stateHash);
  assert.deepEqual(
    firstAccepted.state.eventJournal,
    secondAccepted.state.eventJournal,
  );
  assert.deepEqual(firstStale.errors, secondStale.errors);
  assert.deepEqual(firstStale.events, []);
  assert.deepEqual(firstStale.events, secondStale.events);
  assert.equal(firstStale.stateHash, secondStale.stateHash);
  assert.deepEqual(
    firstStale.state.eventJournal,
    secondStale.state.eventJournal,
  );
});

test("getLegalActions exposes generic runtime payCost returnDon responses across cost-area and attached DON", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const don = must(p1State.donDeck[0], "don0");
  const don2 = must(p1State.donDeck[1], "don1");
  p1State.donDeck = p1State.donDeck.slice(2);
  p1State.costArea = [
    {
      ...don,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "active",
    },
    {
      ...don2,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 1 },
      state: "active",
    },
  ];
  p1State.leader = {
    ...p1State.leader,
    attachedDon: [don.instanceId],
  };
  const attachedDon = { ...must(p1State.costArea[0], "attached") };
  delete attachedDon.state;
  p1State.costArea[0] = attachedDon;
  state.pendingDecision = {
    id: toDecisionId("decision:payCost:sequence:test:0"),
    type: "payCost",
    playerId: p1,
    prompt: "Choose whether to pay this optional cost.",
    causedBy: {
      type: "effect",
      queueEntryId: toQueueEntryId("queue-entry-test"),
      effectId: toEffectId("effect-test"),
    },
    visibility: { type: "private", playerId: p1 },
    defaultResponse: { type: "paymentDeclined" },
    cost: { type: "returnDon", count: 2, optional: true },
    paymentOptions: [{ id: "returnDon", type: "returnDon", count: 2 }],
  };
  state.effectExecutionFrames = [
    {
      queueEntryId: toQueueEntryId("queue-entry-test"),
      effectBlockId: toEffectId("effect-test"),
      effectPath: ["effect", "sequence"],
      nextSegmentIndex: 1,
      segmentResults: {},
      savedReferences: {},
      transientSets: {},
      pendingDecision: {
        decisionId: state.pendingDecision.id,
        causedBy: state.pendingDecision.causedBy,
        createdAtStateSeq: state.seq,
        resumeAtSegmentIndex: 0,
      },
    },
  ];

  const legal = getLegalActions(state, p1).filter(
    (action): action is Extract<Action, { type: "respondToDecision" }> =>
      action.type === "respondToDecision" && action.response.type === "payment",
  );
  assert.equal(legal.length >= 1, true);
  assert.equal(
    legal.some((action) => {
      if (action.response.type !== "payment") {
        return false;
      }
      const selectedDonIds = action.response.selectedDonInstanceIds;
      return (
        selectedDonIds !== undefined &&
        action.response.optionId === "returnDon" &&
        selectedDonIds.includes(don.instanceId) &&
        selectedDonIds.includes(don2.instanceId)
      );
    }),
    true,
  );
  assert.equal(
    getLegalActions(state, p2).some(
      (action) => action.type === "respondToDecision",
    ),
    false,
  );
});
