import assert from "node:assert/strict";
import { test } from "vitest";

import {
  createActiveState,
  must,
  p1,
  queueDrawForP1,
  toSourceSnapshot,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";
import { evaluateQueuedEffectCondition } from "./evaluator.js";

const sourcePlayedThisTurnState = () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "source"),
    zone: "characterArea",
  });
  const entry = {
    ...queueDrawForP1(),
    controllerId: p1,
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: toSourceSnapshot(source, p1, p1),
  };
  return { entry, source, state };
};

test("sourcePlayedThisTurn condition passes only for the live source Character played this turn", () => {
  const { entry, source, state } = sourcePlayedThisTurnState();
  source.turnPlayed = state.turn.globalTurn;

  assert.deepEqual(
    evaluateQueuedEffectCondition(state, entry, {
      type: "sourcePlayedThisTurn",
    }),
    { supported: true, passed: true },
  );

  source.turnPlayed = state.turn.globalTurn - 1;
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, entry, {
      type: "sourcePlayedThisTurn",
    }),
    { supported: true, passed: false },
  );
});

test("sourcePlayedThisTurn condition fails closed when the source is not a live Character", () => {
  const { entry, source, state } = sourcePlayedThisTurnState();
  source.turnPlayed = state.turn.globalTurn;
  must(state.players[p1], "p1").characters = [];

  assert.deepEqual(
    evaluateQueuedEffectCondition(state, entry, {
      type: "sourcePlayedThisTurn",
    }),
    { supported: false },
  );
});
