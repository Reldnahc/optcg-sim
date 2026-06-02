import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  must,
  p1,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "../effect-runtime-queue-processing-test-support.js";

const drawUpToThenPauseSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "draw-up-to",
      connector: "always",
      effect: { type: "drawUpTo", player: "self", count: 3 },
    },
    {
      id: "draw-after-draw-up-to",
      connector: "ifYouDo",
      effect: { type: "draw", player: "self", count: 1 },
    },
  ],
});

const drawUpToThenDrawThenPauseSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "draw-up-to",
      connector: "always",
      effect: { type: "drawUpTo", player: "self", count: 3 },
    },
    {
      id: "draw-after-draw-up-to",
      connector: "ifYouDo",
      effect: { type: "draw", player: "self", count: 1 },
    },
    {
      id: "draw-up-to-pause-after-resume",
      connector: "always",
      effect: { type: "drawUpTo", player: "self", count: 1 },
    },
  ],
});

const reindexHand = (cards: readonly CardInstance[]): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-draw-upto-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "draw-upto-sequence-rules",
      sourceTextHash: "draw-upto-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-draw-upto-sequence"),
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
  effect: Effect,
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
      id: toQueueEntryId("queue-entry-draw-upto-sequence"),
      timingWindowId: toTimingWindowId("window-draw-upto-sequence"),
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
      causedBy: { type: "ruleProcess", name: "draw-upto-sequence-test" },
    },
  ];
  return { state, definition };
};

test("sequence drawUpTo pauses via chooseQuantity and resumes into next segment", () => {
  const { state } = sequenceQueueState(drawUpToThenPauseSequence());
  const beforeDeckCount = must(state.players[p1], "before p1").deck.length;

  const paused = processEffectRuntime(state);
  const quantityDecision = must(paused.state.pendingDecision, "quantity");
  assert.equal(paused.errors, undefined);
  assert.equal(quantityDecision.type, "chooseQuantity");
  assert.equal(quantityDecision.min, 0);
  assert.equal(quantityDecision.max, 3);

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: quantityDecision.id,
    response: { type: "chooseQuantity", quantity: 2 },
  });
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(
    must(resolved.state.players[p1], "after p1").deck.length,
    Math.max(beforeDeckCount - 3, 0),
  );
});

test("sequence drawUpTo resolution increments state seq once while continuing same frame into following draw", () => {
  const { state } = sequenceQueueState(drawUpToThenPauseSequence());
  const paused = processEffectRuntime(state);
  const quantityDecision = must(paused.state.pendingDecision, "quantity");
  const pausedSeq = paused.state.seq;

  assert.equal(quantityDecision.type, "chooseQuantity");

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: quantityDecision.id,
    response: { type: "chooseQuantity", quantity: 2 },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.seq, pausedSeq + 1);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.deepEqual(resolved.state.effectExecutionFrames, []);
  assert.deepEqual(resolved.state.effectQueue, []);
});

test("sequence drawUpTo resume records canonical segmentResults before later segments continue", () => {
  const { state } = sequenceQueueState(drawUpToThenDrawThenPauseSequence());
  const paused = processEffectRuntime(state);
  const quantityDecision = must(paused.state.pendingDecision, "quantity");

  assert.equal(quantityDecision.type, "chooseQuantity");

  const resumed = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: quantityDecision.id,
    response: { type: "chooseQuantity", quantity: 2 },
  });
  const pauseAfterResume = must(resumed.state.pendingDecision, "next pause");
  const frame = must(resumed.state.effectExecutionFrames[0], "frame");

  assert.equal(resumed.errors, undefined);
  assert.equal(pauseAfterResume.type, "chooseQuantity");
  assert.equal(frame.pendingDecision.decisionId, pauseAfterResume.id);
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
    succeeded: true,
    changedState: false,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  });
  assert.equal(frame.segmentResults["2"], undefined);
});
