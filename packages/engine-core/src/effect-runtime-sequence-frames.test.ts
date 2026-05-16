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
} from "./effect-runtime-queue-processing-test-support.js";

const resumableSequence = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "first-draw",
      connector: "always",
      effect: { type: "draw", player: "self", count: 1 },
      saveResultAs: "firstDraw",
    },
    {
      id: "trash-drawn-card",
      connector: "then",
      effect: {
        type: "trashFromHand",
        player: "self",
        chooser: "self",
        count: 1,
      },
      saveResultAs: "trashedCard",
    },
    {
      id: "second-draw",
      connector: "ifPreviousSucceeded",
      effect: { type: "draw", player: "self", count: 1 },
      saveResultAs: "secondDraw",
    },
  ],
});

const unsupportedSequence = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      connector: "always",
      effect: { type: "draw", player: "self", count: 1 },
    },
    {
      connector: "ifYouDo",
      effect: { type: "draw", player: "self", count: 1 },
    },
  ],
});

const reindexHand = (
  cards: readonly CardInstance[],
  playerId = p1,
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId, slot: "hand", index },
  }));

const handRef = (card: CardInstance, playerId = p1): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-resumable-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "resumable-sequence-rules",
      sourceTextHash: "resumable-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-resumable-sequence"),
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

const sequenceQueueState = (
  effect: Effect = resumableSequence(),
): { state: GameState; definition: EffectDefinition } => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const remainingHand = p1State.hand.slice(1);
  const secondDrawCard = must(
    remainingHand[remainingHand.length - 1],
    "deck refill",
  );
  p1State.hand = reindexHand(remainingHand.slice(0, -1));
  p1State.deck = [
    ...p1State.deck,
    {
      ...secondDrawCard,
      zone: {
        zone: "deck",
        playerId: p1,
        slot: "deck",
        index: p1State.deck.length,
      },
    },
  ];
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-resumable-sequence"),
      timingWindowId: toTimingWindowId("window-resumable-sequence"),
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
      causedBy: { type: "ruleProcess", name: "resumable-sequence-test" },
    },
  ];
  return { state, definition };
};

const respondWithCards = (
  state: GameState,
  cards: readonly CardRef[],
): EngineResult =>
  applyAction(state, {
    type: "respondToDecision",
    decisionId: must(state.pendingDecision, "pending decision").id,
    response: { type: "cards", cards: [...cards] },
  });

const eventTypes = (events: readonly EngineEvent[]): string[] =>
  events.map((event) => event.type);

test("sequence pause stores a resumable execution frame with segment results and saved references", () => {
  const { state } = sequenceQueueState();
  const beforeP1 = must(state.players[p1], "p1 before");
  const firstDrawn = must(beforeP1.deck[0], "first drawn card");

  const result = processEffectRuntime(state);
  const decision = must(result.state.pendingDecision, "pending decision");
  const frame = must(result.state.effectExecutionFrames[0], "execution frame");

  assert.equal(result.errors, undefined);
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.causedBy.type, "effect");
  assert.equal(decision.causedBy.queueEntryId, frame.queueEntryId);
  assert.equal(decision.causedBy.effectId, frame.effectBlockId);
  assert.equal(frame.pendingDecision.decisionId, decision.id);
  assert.equal(frame.pendingDecision.causedBy, decision.causedBy);
  assert.equal(frame.pendingDecision.resumeAtSegmentIndex, 1);
  assert.equal(frame.nextSegmentIndex, 2);
  assert.deepEqual(frame.effectPath, ["effect", "sequence"]);
  assert.deepEqual(frame.segmentResults["0"], {
    attempted: true,
    succeeded: true,
    changedState: true,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  });
  assert.deepEqual(frame.segmentResults["1"], {
    attempted: true,
    succeeded: false,
    changedState: false,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  });
  assert.deepEqual(frame.savedReferences["firstDraw"], {
    kind: "producedObjects",
    objects: [
      {
        binding: {
          family: "producedObjects",
          objectIndex: 0,
          saveResultAs: "firstDraw",
          sourceSegmentId: "first-draw",
        },
        capturedAtStateSeq: result.state.seq - 1,
        object: {
          instanceId: firstDrawn.instanceId,
          cardId: firstDrawn.cardId,
          playerId: p1,
          zone: {
            zone: "hand",
            playerId: p1,
            slot: "hand",
            index: beforeP1.hand.length,
          },
        },
        visibility: "public",
      },
    ],
  });
  assert.deepEqual(frame.transientSets, {});
  assert.equal(result.state.effectQueue[0]?.state, "resolving");
  assert.equal(
    JSON.stringify(filterStateForPlayer(result.state, p2)).includes(
      "effectExecutionFrames",
    ),
    false,
  );
});

test("sequence response resumes after the paused segment without replaying completed segments", () => {
  const run = () => {
    const { state } = sequenceQueueState();
    const before = structuredClone(state);
    const paused = processEffectRuntime(state);
    const pausedP1 = must(paused.state.players[p1], "paused p1");
    const firstDrawn = must(
      pausedP1.hand[pausedP1.hand.length - 1],
      "first drawn hand card",
    );

    const resolved = respondWithCards(paused.state, [handRef(firstDrawn)]);
    return { before, paused, resolved, firstDrawn };
  };

  const first = run();
  const second = run();
  const afterP1 = must(first.resolved.state.players[p1], "after p1");

  assert.equal(first.resolved.errors, undefined);
  assert.equal(first.resolved.state.pendingDecision, undefined);
  assert.deepEqual(first.resolved.state.effectExecutionFrames, []);
  assert.deepEqual(first.resolved.state.effectQueue, []);
  assert.equal(
    afterP1.trash.some(
      (card) => card.instanceId === first.firstDrawn.instanceId,
    ),
    true,
  );
  assert.equal(
    afterP1.hand.some(
      (card) => card.instanceId === first.firstDrawn.instanceId,
    ),
    false,
  );
  assert.equal(
    afterP1.deck.length,
    must(first.before.players[p1], "before p1").deck.length - 2,
  );
  assert.deepEqual(
    eventTypes(first.resolved.events).filter((type) => type === "cardDrawn"),
    ["cardDrawn"],
  );
  assert.deepEqual(first.resolved.events, second.resolved.events);
  assert.deepEqual(
    first.resolved.state.eventJournal,
    second.resolved.state.eventJournal,
  );
  assert.equal(first.resolved.stateHash, second.resolved.stateHash);
  assert.equal(
    first.resolved.stateHash,
    hashCanonicalStateValue(first.resolved.state),
  );
});

test("unsupported generic sequence shapes fail closed before mutation", () => {
  const { state } = sequenceQueueState(unsupportedSequence());
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.state, before);
  assert.deepEqual(result.events, []);
  assert.equal(must(result.errors, "errors")[0]?.type, "effectRuntimeError");
});
