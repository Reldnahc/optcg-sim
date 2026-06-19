import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  CardRef,
  ContinuousEffectRecord,
  EngineEvent,
  GameState,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  toEffectId,
  toInstanceId,
  toSourceSnapshot,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";
import { moveConcreteCardsToTrash } from "./concrete-card-movement.js";
import { moveFieldCardToOwnerDeckBottom } from "./field-to-deck.js";
import { moveFieldCardToOwnerHand } from "./field-to-hand.js";
import { moveFieldCardToOwnerLife } from "./field-to-life.js";

const cardRef = (card: CardInstance): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId: card.controller,
  zone: card.zone,
});

const modifierRecord = (
  state: GameState,
  id: string,
  source: CardInstance,
  target: ContinuousEffectRecord["modifier"]["target"],
): ContinuousEffectRecord => ({
  id: toEffectId(id),
  source: cardRef(source),
  sourceSnapshot: toSourceSnapshot(source, source.owner, source.controller),
  controller: source.controller,
  modifier: {
    layer: "powerAdd",
    target,
    operation: { type: "addPower", value: 1000 },
  },
  duration: { type: "thisTurn" },
  createdBy: { type: "ruleProcess", name: "field-exit-cleanup-test" },
  createdAtStateSeq: state.seq,
});

const setupFieldExitState = (): {
  effectSource: CardInstance;
  leaving: CardInstance;
  retainedTarget: CardInstance;
  state: GameState;
} => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const leaving = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "leaving card"),
    zone: "characterArea",
    index: 0,
  });
  const effectSource = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[1], "effect source"),
    zone: "characterArea",
    index: 1,
  });
  const retainedTarget = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[2], "retained target"),
    zone: "characterArea",
    index: 2,
  });
  leaving.state = "rested";
  leaving.turnPlayed = state.turn.globalTurn;
  leaving.attachedDon = [toInstanceId("attached-don-1")];

  state.continuousEffects = [
    modifierRecord(state, "from-leaving-card", leaving, { type: "self" }),
    modifierRecord(state, "targeting-leaving-card", effectSource, {
      type: "exactCard",
      card: cardRef(leaving),
      binding: { family: "selectedTargets", saveResultAs: "selectedTarget" },
      createdAtStateSeq: state.seq,
    }),
    modifierRecord(state, "retained-target", effectSource, {
      type: "exactCard",
      card: cardRef(retainedTarget),
      binding: { family: "selectedTargets", saveResultAs: "selectedTarget" },
      createdAtStateSeq: state.seq,
    }),
  ];

  return { effectSource, leaving, retainedTarget, state };
};

const assertFieldStateCleared = (card: CardInstance): void => {
  assert.deepEqual(card.attachedDon, []);
  assert.equal(card.state, undefined);
  assert.equal(card.turnPlayed, undefined);
};

const assertOnlyUnrelatedEffectRemains = (state: GameState): void => {
  assert.deepEqual(
    state.continuousEffects.map((record) => record.id),
    [toEffectId("retained-target")],
  );
};

test("moving a field card to trash clears its field state and card-specific effects", () => {
  const { leaving, state } = setupFieldExitState();

  const events: EngineEvent[] = [];
  const result = moveConcreteCardsToTrash(state, events, [leaving], {
    cardMovedPayloadShape: "zoneRefs",
    clearAttachedDon: false,
    emitCardTrashed: true,
    playerId: p1,
    reason: "effectTrash",
    sourceZone: "characterArea",
  });
  const trashed = must(
    result.state.players[p1]?.trash.find(
      (card) => card.instanceId === leaving.instanceId,
    ),
    "trashed card",
  );

  assertFieldStateCleared(trashed);
  assertOnlyUnrelatedEffectRemains(result.state);
});

test("moving a field card to hand clears its field state and card-specific effects", () => {
  const { leaving, state } = setupFieldExitState();
  const events: EngineEvent[] = [];
  const result = moveFieldCardToOwnerHand({
    card: leaving,
    causedBy: { type: "ruleProcess", name: "field-exit-cleanup-test" },
    events,
    playerId: p1,
    sourceZone: "characterArea",
    state,
  });
  const moved = must(
    result.state.players[p1]?.hand.find(
      (card) => card.instanceId === leaving.instanceId,
    ),
    "hand card",
  );

  assertFieldStateCleared(moved);
  assertOnlyUnrelatedEffectRemains(result.state);
});

test("moving a field card to deck clears its field state and card-specific effects", () => {
  const { leaving, state } = setupFieldExitState();
  const events: EngineEvent[] = [];
  const result = moveFieldCardToOwnerDeckBottom({
    card: leaving,
    causedBy: { type: "ruleProcess", name: "field-exit-cleanup-test" },
    events,
    playerId: p1,
    sourceZone: "characterArea",
    state,
  });
  const moved = must(
    result.state.players[p1]?.deck.find(
      (card) => card.instanceId === leaving.instanceId,
    ),
    "deck card",
  );

  assertFieldStateCleared(moved);
  assertOnlyUnrelatedEffectRemains(result.state);
});

test("moving a field card to life clears its field state and card-specific effects", () => {
  const { leaving, state } = setupFieldExitState();
  const events: EngineEvent[] = [];
  const result = moveFieldCardToOwnerLife({
    card: leaving,
    causedBy: { type: "ruleProcess", name: "field-exit-cleanup-test" },
    events,
    playerId: p1,
    position: "top",
    sourceZone: "characterArea",
    state,
  });
  const moved = must(
    result.state.players[p1]?.life
      .map((lifeCard) => lifeCard.card)
      .find((card) => card.instanceId === leaving.instanceId),
    "life card",
  );

  assertFieldStateCleared(moved);
  assertOnlyUnrelatedEffectRemains(result.state);
});
