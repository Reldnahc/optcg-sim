import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  DelayedEffectRecord,
  EffectDefinition,
  EngineEvent,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  processEffectRuntime,
  resolvedCard,
  toCardId,
  toEffectId,
  toEngineEventId,
  toStateSeq,
} from "../../effect-runtime-queue/test-support.js";

const delayedDrawEffectBlock = (
  id: string,
): EffectDefinition["effects"][number] => ({
  id: toEffectId(id),
  category: "auto",
  trigger: { type: "endOfYourTurn" },
  sourcePresencePolicy: "noSourceRequired",
  effect: { type: "draw", player: "self", count: 1 },
});

const delayedDrawRecord = (
  timing: DelayedEffectRecord["timing"],
): DelayedEffectRecord => {
  const state = createActiveState();
  const source = must(state.players[p1], "p1").leader;
  return {
    id: `delayed:${timing.type}`,
    timing,
    controllerId: p1,
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: p1,
      controllerId: p1,
      zone: source.zone,
      category: "leader",
      colors: ["red"],
      keywords: [],
    },
    effectBlock: delayedDrawEffectBlock(`effect:delayed:${timing.type}`),
    createdBy: { type: "ruleProcess", name: "test:delayed" },
    createdAtStateSeq: toStateSeq(1),
  };
};

test("live delayed end-of-turn queueing preserves omitted state hash", () => {
  const state = createActiveState();
  state.turn.phase = "end";
  state.turn.turnPlayerId = p1;
  state.delayedEffects = [
    delayedDrawRecord({ type: "endOfTurn", turn: "current" }),
  ];
  state.eventJournal.push({
    id: toEngineEventId("event:live-delayed-end"),
    seq: 1,
    type: "phaseStarted",
    payload: { phase: "end", playerId: p1 },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "test:delayed-end" },
    createdAtStateSeq: state.seq,
  });

  const result = processEffectRuntime(state, {
    includeStateHash: false,
    validateInvariants: false,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.stateHash, "");
});

test("live delayed event queueing preserves omitted state hash", () => {
  const state = createActiveState();
  const playedCardId = toCardId("live-delayed-played");
  state.cardManifest.cards[playedCardId] = resolvedCard({
    cardId: playedCardId,
    category: "event",
  });
  state.delayedEffects = [
    delayedDrawRecord({
      type: "event",
      trigger: {
        type: "cardPlayed",
        player: "self",
        filter: { categories: ["event"] },
      },
      expires: { type: "endOfTurn", turn: "current" },
    }),
  ];
  const playedEvent: EngineEvent = {
    id: toEngineEventId("event:live-delayed-card-played"),
    seq: 1,
    type: "cardPlayed",
    payload: {
      playerId: p1,
      instanceId: "live-delayed-played-instance",
      cardId: playedCardId,
      category: "event",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "test:delayed-event" },
    createdAtStateSeq: state.seq,
  };
  state.eventJournal.push(playedEvent);

  const result = processEffectRuntime(state, {
    includeStateHash: false,
    validateInvariants: false,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.stateHash, "");
});
