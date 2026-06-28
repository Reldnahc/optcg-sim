import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  ContinuousEffectRecord,
  EngineEvent,
  PlayerId,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  setupOnKODefinition,
  toEngineEventId,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";
import { queueBattleKOTriggers } from "../../effect-runtime.js";

const cardRef = (card: CardInstance, playerId: PlayerId) => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

const invalidateCardEffectsRecord = (
  state: ReturnType<typeof createActiveState>,
  target: CardInstance,
): ContinuousEffectRecord => {
  const source = must(state.players[p1], "p1").leader;
  return {
    id: `continuous:invalidate-card:${String(target.instanceId)}`,
    source: cardRef(source, p1),
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: source.owner,
      controllerId: p1,
      zone: source.zone,
      category: "leader",
      colors: ["red"],
      keywords: [],
      power: 5000,
    },
    controller: p1,
    modifier: {
      layer: "effectInvalidation",
      target: {
        type: "exactCard",
        card: cardRef(target, target.controller),
        binding: {
          family: "selectedTargets",
          saveResultAs: "selected:negated-card",
        },
        createdAtStateSeq: state.seq,
      },
      operation: { type: "invalidateEffects" },
    },
    duration: { type: "thisTurn" },
    createdBy: { type: "ruleProcess", name: "test-negate-card" },
    createdAtStateSeq: state.seq,
  };
};

const appendBattleKOEvents = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
): EngineEvent[] => [
  {
    id: toEngineEventId(`event:${String(state.seq)}:1:cardKOd`),
    seq: state.eventJournal.length + 1,
    type: "cardKOd",
    payload: {
      playerId: source.zone.playerId,
      instanceId: source.instanceId,
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "battleResolution" },
    createdAtStateSeq: state.seq,
  },
  {
    id: toEngineEventId(`event:${String(state.seq)}:2:cardMoved`),
    seq: state.eventJournal.length + 2,
    type: "cardMoved",
    payload: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      from: source.zone,
      to: {
        zone: "trash",
        playerId: source.zone.playerId,
        slot: "trash",
        index: 0,
      },
      reason: "ko",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "battleResolution" },
    createdAtStateSeq: state.seq,
  },
];

test("On K.O. queueing skips sources whose effects were negated before the K.O.", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p2State = must(state.players[p2], "p2");
  const source = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "K.O. source"),
    zone: "characterArea",
  });
  p2State.hand = p2State.hand.slice(1);
  setupOnKODefinition(state, source);
  const sourceState = structuredClone(state);
  sourceState.continuousEffects = [
    invalidateCardEffectsRecord(sourceState, source),
  ];
  p2State.characters = [];
  p2State.trash = [
    {
      ...source,
      zone: { zone: "trash", playerId: p2, slot: "trash", index: 0 },
    },
  ];
  const events = appendBattleKOEvents(state, source);

  const result = queueBattleKOTriggers(state, sourceState, events);

  assert.equal(result.ok, true);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(events.length, 2);
});
