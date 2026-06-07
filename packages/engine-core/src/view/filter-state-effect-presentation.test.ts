import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardRef,
  DecisionId,
  EffectId,
  EffectQueueEntry,
  InstanceId,
  QueueEntryId,
  StateSeq,
  TimingWindowId,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "../action-test-fixtures.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

const toDecisionId = (value: string): DecisionId => value as DecisionId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toInstanceId = (value: string): InstanceId => value as InstanceId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;
const toStateSeq = (value: number): StateSeq => value as StateSeq;
const toTimingWindowId = (value: string): TimingWindowId =>
  value as TimingWindowId;

const queuedEffect = (source: CardRef): EffectQueueEntry => ({
  id: toQueueEntryId("queue-entry:effect-presentation"),
  state: "pending",
  timingWindowId: toTimingWindowId("timing-window:effect-presentation"),
  generation: 1,
  controllerId: source.playerId,
  source,
  sourceSnapshot: {
    instanceId: source.instanceId,
    cardId: source.cardId,
    ownerId: source.playerId,
    controllerId: source.playerId,
    zone: must(source.zone, "source zone"),
    category: "character",
    colors: ["red"],
    cost: 1,
    power: 5000,
    keywords: [],
  },
  effectBlockId: toEffectId("effect:block:draw"),
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 1,
  queuedAtStateSeq: toStateSeq(1),
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "effect-presentation-test" },
  presentation: {
    source,
    textKind: "effect",
    activeSpanIds: ["span:body:draw"],
  },
});

test("player decision projection includes active effect text for visible queued sources", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1 state");
  const sourceCard = must(p1State.hand.shift(), "source card");
  sourceCard.instanceId = toInstanceId("visible-source-instance");
  sourceCard.zone = {
    zone: "characterArea",
    playerId: p1,
    slot: "character",
    index: 0,
  };
  p1State.characters.push(sourceCard);
  state.cardManifest.cards[sourceCard.cardId] = resolvedCard({
    cardId: sourceCard.cardId,
    category: "character",
  });
  const source: CardRef = {
    instanceId: sourceCard.instanceId,
    cardId: sourceCard.cardId,
    playerId: p1,
    zone: sourceCard.zone,
  };
  const entry = queuedEffect(source);
  state.effectQueue = [entry];
  state.pendingDecision = {
    id: toDecisionId("decision:effect-presentation"),
    type: "chooseQuantity",
    playerId: p1,
    prompt: "Choose how many cards to draw.",
    causedBy: {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    },
    visibility: { type: "private", playerId: p1 },
    mode: "upTo",
    min: 0,
    max: 1,
  };

  const view = filterStateForPlayer(state, p1);

  assert.deepEqual(view.activeEffectText, entry.presentation);
  assert.deepEqual(
    view.pendingDecision?.presentation.activeEffectText,
    entry.presentation,
  );
  assert.deepEqual(view.activeEffectSources, [source]);
  const opponentView = filterStateForPlayer(state, p2);
  assert.equal(opponentView.pendingDecision, undefined);
  assert.deepEqual(opponentView.activeEffectText, entry.presentation);
});

test("player decision projection hides active effect text when the queued source is hidden", () => {
  const state = createActiveState();
  const p2State = must(state.players[p2], "p2 state");
  const sourceCard = must(p2State.hand[0], "hidden source card");
  sourceCard.instanceId = toInstanceId("hidden-source-instance");
  state.cardManifest.cards[sourceCard.cardId] = resolvedCard({
    cardId: sourceCard.cardId,
    category: "character",
  });
  const source: CardRef = {
    instanceId: sourceCard.instanceId,
    cardId: sourceCard.cardId,
    playerId: p2,
    zone: sourceCard.zone,
  };
  const entry = queuedEffect(source);
  state.effectQueue = [entry];
  state.pendingDecision = {
    id: toDecisionId("decision:hidden-effect-presentation"),
    type: "chooseQuantity",
    playerId: p1,
    prompt: "Choose how many cards to draw.",
    causedBy: {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    },
    visibility: { type: "private", playerId: p1 },
    mode: "upTo",
    min: 0,
    max: 1,
  };

  const view = filterStateForPlayer(state, p1);

  assert.equal(view.activeEffectText, undefined);
  assert.equal(view.pendingDecision?.presentation.activeEffectText, undefined);
  assert.equal(view.activeEffectSources, undefined);
});
