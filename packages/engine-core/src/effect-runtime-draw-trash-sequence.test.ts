import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  CardRef,
  Effect,
  EffectDefinition,
  EngineEvent,
  EngineResult,
  GameState,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  filterStateForPlayer,
  getLegalActions,
  hashCanonicalStateValue,
  must,
  p1,
  p2,
  processEffectRuntime,
  queueDrawForP1,
  queueingState,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  setupOnPlayDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "./effect-runtime-queue/test-support.js";

const drawTrashSequence = (
  drawCount = 1,
  trashCount = 1,
): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      connector: "always",
      effect: { type: "draw", player: "self", count: drawCount },
    },
    {
      connector: "then",
      effect: {
        type: "trashFromHand",
        player: "self",
        chooser: "self",
        count: trashCount,
      },
    },
  ],
});

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

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect = drawTrashSequence(),
  overrides: Partial<EffectDefinition["effects"][number]> = {},
): EffectDefinition => {
  const effectDefinitionId = "def-draw-trash-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "draw-trash-sequence-rules",
      sourceTextHash: "draw-trash-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-draw-trash-sequence"),
        effect,
        ...overrides,
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

const sequenceQueueState = (
  effect: Effect = drawTrashSequence(),
  overrides: Partial<EffectDefinition["effects"][number]> = {},
): { state: GameState; source: CardInstance; definition: EffectDefinition } => {
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
  const definition = setupSequenceDefinition(state, source, effect, overrides);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-draw-trash-sequence"),
      timingWindowId: toTimingWindowId("window-draw-trash-sequence"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "sequence effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "draw-trash-sequence-test" },
    },
  ];
  return { state, source, definition };
};

const createSequenceDecision = (
  effect: Effect = drawTrashSequence(),
  overrides: Partial<EffectDefinition["effects"][number]> = {},
): {
  decision: NonNullable<GameState["pendingDecision"]>;
  result: EngineResult;
} => {
  const { state } = sequenceQueueState(effect, overrides);
  const result = processEffectRuntime(state);
  return {
    decision: must(result.state.pendingDecision, "pending decision"),
    result,
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

const eventTypes = (events: readonly EngineEvent[]): string[] =>
  events.map((event) => event.type);

const assertStrictlyIncreasingEventSeq = (
  events: readonly EngineEvent[],
): void => {
  for (let index = 1; index < events.length; index += 1) {
    const previous = must(events[index - 1], "previous event");
    const current = must(events[index], "current event");
    assert.equal(current.seq > previous.seq, true);
  }
};

test("draw-then-trash sequence draws before creating a private trash decision with post-draw hand candidates", () => {
  const { state } = sequenceQueueState(drawTrashSequence(1, 2));
  const beforeP1 = must(state.players[p1], "p1 before");
  const drawn = must(beforeP1.deck[0], "top deck");

  const result = processEffectRuntime(state);
  const decision = must(result.state.pendingDecision, "pending decision");
  const afterP1 = must(result.state.players[p1], "p1 after");

  assert.equal(result.errors, undefined);
  assert.deepEqual(eventTypes(result.events), [
    "cardDrawn",
    "cardMoved",
    "cardMoved",
    "decisionCreated",
  ]);
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
  assert.equal(afterP1.deck.length, beforeP1.deck.length - 1);
  assert.equal(afterP1.hand.length, beforeP1.hand.length + 1);
  assert.equal(
    must(afterP1.hand[afterP1.hand.length - 1], "drawn hand card").instanceId,
    drawn.instanceId,
  );
  assert.deepEqual(
    decision.candidates.map((candidate) => candidate.card.instanceId),
    afterP1.hand.map((card) => card.instanceId),
  );
  assert.equal(result.state.effectQueue.length, 1);
  assert.equal(
    must(result.state.effectQueue[0], "continuation entry").id,
    toQueueEntryId("queue-entry-draw-trash-sequence"),
  );
  const frame = must(result.state.effectExecutionFrames[0], "sequence frame");
  assert.equal(
    frame.queueEntryId,
    toQueueEntryId("queue-entry-draw-trash-sequence"),
  );
  assert.equal(frame.pendingDecision.decisionId, decision.id);
  assert.equal(frame.pendingDecision.resumeAtSegmentIndex, 1);
  assert.equal(frame.nextSegmentIndex, 2);
  assertStrictlyIncreasingEventSeq(result.events);
});

test("zero-count draw still creates trash decision through sequence frame pause", () => {
  const { state } = sequenceQueueState(drawTrashSequence(0, 1));
  const beforeP1 = must(state.players[p1], "p1 before");

  const result = processEffectRuntime(state);
  const decision = must(result.state.pendingDecision, "pending decision");
  const afterP1 = must(result.state.players[p1], "p1 after");
  const frame = must(result.state.effectExecutionFrames[0], "sequence frame");

  assert.equal(result.errors, undefined);
  assert.deepEqual(eventTypes(result.events), ["decisionCreated"]);
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.playerId, p1);
  assert.equal(decision.visibility.type, "private");
  assert.equal(decision.visibility.playerId, p1);
  assert.equal(afterP1.deck.length, beforeP1.deck.length);
  assert.equal(afterP1.hand.length, beforeP1.hand.length);
  assert.equal(
    frame.queueEntryId,
    toQueueEntryId("queue-entry-draw-trash-sequence"),
  );
  assert.equal(frame.pendingDecision.decisionId, decision.id);
  assert.equal(frame.pendingDecision.resumeAtSegmentIndex, 1);
  assert.equal(frame.nextSegmentIndex, 2);
});

test("valid sequence trash response resumes through the existing finalizer and completes the original queue entry", () => {
  const { result: decisionResult } = createSequenceDecision(
    drawTrashSequence(1, 1),
  );
  const beforeP1 = must(decisionResult.state.players[p1], "p1 before");
  const drawn = must(beforeP1.hand[beforeP1.hand.length - 1], "drawn card");

  const result = respondWithCards(decisionResult.state, [handRef(drawn)]);
  const afterP1 = must(result.state.players[p1], "p1 after");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.state.effectQueue, []);
  assert.equal(
    afterP1.hand.some((card) => card.instanceId === drawn.instanceId),
    false,
  );
  assert.equal(afterP1.trash[0]?.instanceId, drawn.instanceId);
  assert.deepEqual(eventTypes(result.events).slice(0, 5), [
    "decisionResolved",
    "cardMoved",
    "cardTrashed",
    "effectResolved",
    "ruleProcessingChecked",
  ]);
  assert.deepEqual(
    result.events.find((event) => event.type === "effectResolved")?.payload,
    {
      queueEntryId: toQueueEntryId("queue-entry-draw-trash-sequence"),
      timingWindowId: toTimingWindowId("window-draw-trash-sequence"),
      generation: 1,
      effectBlockId: toEffectId("effect-draw-trash-sequence"),
      sourcePresencePolicy: "mustRemainInSameZone",
      orderingGroup: "turnPlayer",
      status: "resolved",
    },
  );
  assertStrictlyIncreasingEventSeq(result.events);
  assertStrictlyIncreasingEventSeq(result.state.eventJournal);
});

test("invalid sequence trash response fails closed without mutation or hidden-card leakage", () => {
  const { result: decisionResult } = createSequenceDecision(
    drawTrashSequence(1, 1),
  );
  const state = decisionResult.state;
  const p2State = must(state.players[p2], "p2");
  const invalidOpponentCard = handRef(must(p2State.hand[0], "p2 hand"), p2);
  const before = structuredClone(state);

  const result = respondWithCards(state, [invalidOpponentCard]);
  const opponentView = filterStateForPlayer(result.state, p2);
  const opponentLegal = getLegalActions(result.state, p2);
  const hiddenIds = must(result.state.players[p1], "p1").hand.map((card) =>
    String(card.instanceId),
  );
  const opponentSerialized = JSON.stringify({ opponentView, opponentLegal });

  assert.deepEqual(result.state, before);
  assert.deepEqual(result.events, []);
  assert.equal(
    must(result.errors, "errors")[0]?.type,
    "invalidDecisionResponse",
  );
  assert.equal(opponentView.pendingDecision, undefined);
  assert.deepEqual(opponentLegal, [{ type: "concede", playerId: p2 }]);
  for (const hiddenId of hiddenIds) {
    assert.equal(opponentSerialized.includes(hiddenId), false);
  }
});

test("unsupported draw-then-trash sequence shapes fail closed before draw or decision creation", () => {
  const unsupportedEffects: readonly Effect[] = [
    { type: "sequence", effects: [] },
    {
      type: "sequence",
      effects: [
        {
          connector: "then",
          effect: { type: "draw", player: "self", count: 1 },
        },
        {
          connector: "then",
          effect: {
            type: "trashFromHand",
            player: "self",
            chooser: "self",
            count: 1,
          },
        },
      ],
    },
    {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: { type: "draw", player: "opponent", count: 1 },
        },
        {
          connector: "then",
          effect: {
            type: "trashFromHand",
            player: "self",
            chooser: "self",
            count: 1,
          },
        },
      ],
    },
    {
      type: "sequence",
      effects: [
        {
          connector: "always",
          effect: { type: "draw", player: "self", count: 1 },
        },
        {
          connector: "then",
          effect: {
            type: "trashFromHand",
            player: "self",
            chooser: "opponent",
            count: 1,
          },
        },
      ],
    },
  ];

  for (const effect of unsupportedEffects) {
    const { state } = sequenceQueueState(effect);
    const before = structuredClone(state);

    const result = processEffectRuntime(state);

    assert.deepEqual(result.state, before);
    assert.deepEqual(result.events, []);
    assert.equal(must(result.errors, "errors")[0]?.type, "effectRuntimeError");
  }

  const unsupportedBlockOverrides: readonly Partial<
    EffectDefinition["effects"][number]
  >[] = [
    { optional: true },
    { cost: { type: "restDon", count: 1 } },
    { conditionTiming: "resolution" },
    { failurePolicy: "requiresAll" },
  ];

  for (const overrides of unsupportedBlockOverrides) {
    const { state } = sequenceQueueState(drawTrashSequence(), overrides);
    const before = structuredClone(state);

    const result = processEffectRuntime(state);

    assert.deepEqual(result.state, before);
    assert.deepEqual(result.events, []);
    assert.equal(must(result.errors, "errors")[0]?.type, "effectRuntimeError");
  }
});

test("conditioned draw-then-trash sequence is supported after queue-level condition pass", () => {
  const { state } = sequenceQueueState(drawTrashSequence(1, 1), {
    condition: { type: "yourTurn" },
  });
  state.turn.turnPlayerId = p1;

  const result = processEffectRuntime(state);
  const decision = must(result.state.pendingDecision, "pending decision");

  assert.equal(result.errors, undefined);
  assert.equal(decision.type, "selectCards");
  assert.deepEqual(eventTypes(result.events), [
    "cardDrawn",
    "cardMoved",
    "cardMoved",
    "decisionCreated",
  ]);
});

test("once-per-turn draw-then-trash sequence consumes use when the sequence commits and rejects repeated use", () => {
  const { result: decisionResult } = createSequenceDecision(
    drawTrashSequence(1, 1),
    { oncePerTurn: true },
  );
  const originalEntry = must(
    decisionResult.state.effectQueue[0],
    "sequence queue entry",
  );

  assert.equal(decisionResult.state.oncePerTurn.length, 1);
  const oncePerTurnRecord = must(
    decisionResult.state.oncePerTurn[0],
    "once per turn record",
  );
  assert.equal(
    oncePerTurnRecord.cardInstanceId,
    originalEntry.source.instanceId,
  );
  assert.equal(
    oncePerTurnRecord.effectId,
    toEffectId("effect-draw-trash-sequence"),
  );
  assert.equal(
    oncePerTurnRecord.turnNumber,
    decisionResult.state.turn.globalTurn,
  );

  const firstP1 = must(decisionResult.state.players[p1], "p1 first");
  const selected = must(firstP1.hand[firstP1.hand.length - 1], "drawn card");
  const completed = respondWithCards(decisionResult.state, [handRef(selected)]);
  const repeatedState = structuredClone(completed.state);
  repeatedState.effectQueue = [
    {
      ...originalEntry,
      id: toQueueEntryId("queue-entry-draw-trash-sequence-repeat"),
      timingWindowId: toTimingWindowId("window-draw-trash-sequence-repeat"),
      state: "pending",
    },
  ];

  const repeated = processEffectRuntime(repeatedState);

  assert.deepEqual(repeated.state, repeatedState);
  assert.deepEqual(repeated.events, []);
  assert.equal(must(repeated.errors, "errors")[0]?.type, "effectRuntimeError");
});

test("completed draw-then-trash sequence event ordering and state hash are deterministic", () => {
  const run = () => {
    const { result: decisionResult } = createSequenceDecision(
      drawTrashSequence(1, 1),
    );
    const p1State = must(decisionResult.state.players[p1], "p1");
    const selected = must(p1State.hand[p1State.hand.length - 1], "drawn card");
    const result = respondWithCards(decisionResult.state, [handRef(selected)]);
    return {
      result,
      hash: hashCanonicalStateValue(result.state),
    };
  };

  const first = run();
  const second = run();

  assert.equal(first.result.errors, undefined);
  assert.deepEqual(first.result.events, second.result.events);
  assert.deepEqual(
    first.result.state.eventJournal,
    second.result.state.eventJournal,
  );
  assert.equal(first.hash, second.hash);
});

test("existing no-choice draw queue path remains a no-decision baseline", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  setupOnPlayDefinition(
    state,
    played,
    reviewedOnPlayDrawDefinition(played.cardId, supportCard.support),
    "def-draw-baseline",
  );

  const queued = processEffectRuntime(state);

  const result = processEffectRuntime(queued.state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.state.effectQueue, []);
  assert.deepEqual(eventTypes(result.events).slice(0, 5), [
    "cardDrawn",
    "cardMoved",
    "cardMoved",
    "effectResolved",
    "ruleProcessingChecked",
  ]);
});
