import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  CardInstance,
  CardRef,
  Effect,
  EffectDefinition,
  EngineResult,
  GameState,
} from "@optcg/types";

import {
  applyAction,
  filterStateForPlayer,
  getLegalActions,
  hashCanonicalStateValue,
  must,
  p1,
  p2,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
  createActiveState,
} from "../../effect-runtime-queue/test-support.js";

const handRef = (card: CardInstance, playerId = p1): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

const reindexHand = (
  cards: readonly CardInstance[],
  playerId = p1,
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId, slot: "hand", index },
  }));

const setupTrashFromHandDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect = {
    type: "trashFromHand",
    player: "self",
    chooser: "self",
    count: 1,
  },
): EffectDefinition => {
  const effectDefinitionId = "def-trash-from-hand";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "trash-hand-rules",
      sourceTextHash: "trash-hand-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-trash-from-hand"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const trashFromHandQueueState = (
  effect: Effect = {
    type: "trashFromHand",
    player: "self",
    chooser: "self",
    count: 1,
  },
): { state: GameState; source: CardInstance } => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  p1State.hand = reindexHand(p1State.hand.slice(1));
  const definition = setupTrashFromHandDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-trash-from-hand"),
      timingWindowId: toTimingWindowId("window-trash-from-hand"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "trash effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "trash-from-hand-test" },
    },
  ];
  return { state, source };
};

const createTrashDecision = (
  effect?: Effect,
): {
  result: EngineResult;
  decision: NonNullable<GameState["pendingDecision"]>;
} => {
  const { state } =
    effect === undefined
      ? trashFromHandQueueState()
      : trashFromHandQueueState(effect);
  const result = processEffectRuntime(state);
  return {
    result,
    decision: must(result.state.pendingDecision, "pending decision"),
  };
};

const respondWithCards = (
  state: GameState,
  cards: readonly CardRef[],
  playerId?: typeof p1,
): EngineResult =>
  applyAction(state, {
    type: "respondToDecision",
    decisionId: must(state.pendingDecision, "pending decision").id,
    ...(playerId === undefined ? {} : { playerId }),
    response: { type: "cards", cards: [...cards] },
  });

test("trashFromHand self/self creates a private selectCards decision with hand candidates", () => {
  const { state } = trashFromHandQueueState({
    type: "trashFromHand",
    player: "self",
    chooser: "self",
    count: 2,
  });
  const beforeP1 = must(state.players[p1], "p1");

  const result = processEffectRuntime(state);
  const decision = must(result.state.pendingDecision, "pending decision");

  assert.equal(result.errors, undefined);
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.playerId, p1);
  assert.equal(decision.visibility.type, "private");
  assert.equal(decision.visibility.playerId, p1);
  assert.deepEqual(decision.request, {
    timing: "onResolution",
    chooser: "self",
    player: "self",
    zone: "hand",
    min: 2,
    max: 2,
    allowFewerIfUnavailable: false,
    visibility: "privateToChooser",
  });
  assert.equal(decision.candidates.length, beforeP1.hand.length);
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.card.instanceId),
    beforeP1.hand.map((card) => card.instanceId),
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["decisionCreated"],
  );
  assert.equal(
    must(result.events[0], "decisionCreated").visibility.type,
    "private",
  );
});

test("valid trashFromHand response moves selected hand cards to public trash and resumes effect resolution", () => {
  const { result: decisionResult, decision } = createTrashDecision({
    type: "trashFromHand",
    player: "self",
    chooser: "self",
    count: 2,
  });
  const beforeP1 = must(decisionResult.state.players[p1], "p1 before");
  const selected = beforeP1.hand.slice(0, 2).map((card) => handRef(card));

  const result = respondWithCards(decisionResult.state, selected);
  const afterP1 = must(result.state.players[p1], "p1 after");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.deepEqual(
    afterP1.hand.map((card) => card.instanceId),
    beforeP1.hand.slice(2).map((card) => card.instanceId),
  );
  assert.deepEqual(
    afterP1.trash.slice(0, 2).map((card) => card.instanceId),
    selected.map((card) => card.instanceId),
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardMoved",
      "cardTrashed",
      "cardMoved",
      "cardTrashed",
      "effectResolved",
      "ruleProcessingChecked",
    ],
  );
  assert.deepEqual(must(result.events[0], "decisionResolved").payload, {
    decisionId: decision.id,
    decisionType: "selectCards",
    playerId: p1,
    responseType: "cards",
    selectedCount: 2,
  });
  for (const event of result.events.slice(1, 5)) {
    assert.equal(event.visibility.type, "public");
  }
  const publicMovedPayloads = result.events
    .filter((event) => event.type === "cardMoved")
    .map((event) => event.payload);
  assert.deepEqual(publicMovedPayloads, [
    { from: "hand", to: "trash", playerId: p1, reason: "trashFromHand" },
    { from: "hand", to: "trash", playerId: p1, reason: "trashFromHand" },
  ]);
  assert.deepEqual(
    result.state.eventJournal.slice(-result.events.length),
    result.events,
  );
});

test("trashFromHand rejects malformed, wrong-count, duplicate, stale, and opponent responses without mutation", () => {
  const { result: decisionResult } = createTrashDecision();
  const state = decisionResult.state;
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const valid = handRef(must(p1State.hand[0], "valid hand card"));
  const stale = handRef(must(p2State.hand[0], "opponent hand card"), p2);
  const wrongZone = {
    ...valid,
    zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 } as const,
  };
  const invalidActions: readonly Action[] = [
    {
      type: "respondToDecision",
      decisionId: must(state.pendingDecision, "decision").id,
      playerId: p2,
      response: { type: "cards", cards: [valid] },
    } as unknown as Action,
    {
      type: "respondToDecision",
      decisionId: must(state.pendingDecision, "decision").id,
      playerId: 0,
      response: { type: "cards", cards: [valid] },
    } as unknown as Action,
    {
      type: "respondToDecision",
      decisionId: must(state.pendingDecision, "decision").id,
      response: { type: "cards", cards: [] },
    },
    {
      type: "respondToDecision",
      decisionId: must(state.pendingDecision, "decision").id,
      response: { type: "cards", cards: [valid, valid] },
    },
    {
      type: "respondToDecision",
      decisionId: must(state.pendingDecision, "decision").id,
      response: { type: "cards", cards: [stale] },
    },
    {
      type: "respondToDecision",
      decisionId: must(state.pendingDecision, "decision").id,
      response: { type: "cards", cards: [wrongZone] },
    },
    {
      type: "respondToDecision",
      decisionId: must(state.pendingDecision, "decision").id,
      response: { type: "targets", targets: [valid] },
    },
  ];

  for (const action of invalidActions) {
    const before = structuredClone(state);
    const result = applyAction(state, action);

    assert.deepEqual(result.state, before);
    assert.deepEqual(result.events, []);
    assert.equal(
      must(result.errors, "errors")[0]?.type,
      "invalidDecisionResponse",
    );
  }
});

test("unsupported trashFromHand player refs filters and counts fail closed before decision creation", () => {
  const unsupportedEffects: readonly Effect[] = [
    {
      type: "trashFromHand",
      player: "opponent",
      chooser: "self",
      count: 1,
    },
    {
      type: "trashFromHand",
      player: "self",
      chooser: "opponent",
      count: 1,
    },
    {
      type: "trashFromHand",
      player: "self",
      chooser: "self",
      count: 1,
      filter: { categories: ["character"] },
    },
    {
      type: "trashFromHand",
      player: "self",
      chooser: "self",
      count: 0,
    },
  ];

  for (const effect of unsupportedEffects) {
    const { state } = trashFromHandQueueState(effect);
    const before = structuredClone(state);

    const result = processEffectRuntime(state);

    assert.deepEqual(result.state, before);
    assert.deepEqual(result.events, []);
    assert.equal(must(result.errors, "errors")[0]?.type, "effectRuntimeError");
  }
});

test("trashFromHand PlayerView and public legal actions do not leak private hand candidates", () => {
  const { result } = createTrashDecision({
    type: "trashFromHand",
    player: "self",
    chooser: "self",
    count: 2,
  });
  const p1State = must(result.state.players[p1], "p1");
  const hiddenIds = p1State.hand.map((card) => String(card.instanceId));

  const chooserView = filterStateForPlayer(result.state, p1);
  const opponentView = filterStateForPlayer(result.state, p2);
  const opponentLegal = getLegalActions(result.state, p2);
  const opponentSerialized = JSON.stringify({
    opponentView,
    opponentLegal,
    publicEvents: result.state.eventJournal.filter(
      (event) => event.visibility.type === "public",
    ),
  });

  assert.equal(chooserView.pendingDecision?.type, "selectCards");
  assert.deepEqual(chooserView.legalActions, [
    { type: "concede", playerId: p1 },
    {
      type: "respondToDecision",
      decisionId: must(result.state.pendingDecision, "decision").id,
    },
  ]);
  assert.equal(opponentView.pendingDecision, undefined);
  assert.deepEqual(opponentView.legalActions, [
    { type: "concede", playerId: p2 },
  ]);
  for (const hiddenId of hiddenIds) {
    assert.equal(opponentSerialized.includes(hiddenId), false);
  }
});

test("trashFromHand resolution reveals only trashed cards to the opponent and keeps state hash deterministic", () => {
  const run = () => {
    const { result: decisionResult } = createTrashDecision({
      type: "trashFromHand",
      player: "self",
      chooser: "self",
      count: 1,
    });
    const p1State = must(decisionResult.state.players[p1], "p1");
    const selectedCard = must(p1State.hand[0], "selected card");
    const unselectedCard = must(p1State.hand[1], "unselected card");
    const result = respondWithCards(decisionResult.state, [
      handRef(selectedCard),
    ]);
    return {
      result,
      selectedId: String(selectedCard.instanceId),
      unselectedId: String(unselectedCard.instanceId),
      hash: hashCanonicalStateValue(result.state),
    };
  };

  const first = run();
  const second = run();
  const opponentView = filterStateForPlayer(first.result.state, p2);
  const opponentSerialized = JSON.stringify(opponentView);

  assert.equal(first.result.errors, undefined);
  assert.deepEqual(first.result.events, second.result.events);
  assert.deepEqual(
    first.result.state.eventJournal,
    second.result.state.eventJournal,
  );
  assert.equal(first.hash, second.hash);
  assert.equal(opponentSerialized.includes(first.selectedId), true);
  assert.equal(opponentSerialized.includes(first.unselectedId), false);
});
