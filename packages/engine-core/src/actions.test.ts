import assert from "node:assert/strict";
import { test } from "vitest";

import { createInitialState } from "./initial-state.js";
import { startMulliganFlow } from "./mulligan.js";
import { applyAction, getLegalActions } from "./actions.js";
import {
  advanceDonPhase,
  advanceDrawPhase,
  advanceRefreshPhase,
} from "./phases.js";
import {
  createActiveState,
  createInput,
  must,
  p1,
  p2,
} from "./action-test-fixtures.js";

test("getLegalActions returns main-phase actions for turn player and concession-only for non-turn player", () => {
  const state = createActiveState();
  state.turn.phase = "main";
  const turnPlayer = must(state.players[p1], "p1");
  const attachedDon = must(turnPlayer.donDeck[0], "p1 don");
  turnPlayer.donDeck = turnPlayer.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  turnPlayer.costArea = [
    {
      ...attachedDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "active",
    },
  ];
  turnPlayer.characters = [
    {
      ...must(turnPlayer.hand[0], "p1 hand card"),
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 0,
      },
      state: "active",
      attachedDon: [],
    },
  ];
  turnPlayer.hand = turnPlayer.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

  const forTurnPlayer = getLegalActions(state, p1);
  assert.equal(
    forTurnPlayer.some((action) => action.type === "endMainPhase"),
    true,
  );
  assert.equal(
    forTurnPlayer.some((action) => action.type === "concede"),
    true,
  );
  assert.equal(
    forTurnPlayer.filter((action) => action.type === "attachDon").length,
    2,
  );

  const forNonTurnPlayer = getLegalActions(state, p2);
  assert.deepEqual(forNonTurnPlayer, [{ type: "concede", playerId: p2 }]);
});

test("getLegalActions outside main phase still includes concession", () => {
  const state = createActiveState();
  state.turn.phase = "draw";

  assert.deepEqual(getLegalActions(state, p1), [
    { type: "concede", playerId: p1 },
  ]);
  assert.deepEqual(getLegalActions(state, p2), [
    { type: "concede", playerId: p2 },
  ]);
});

test("getLegalActions in don phase before start-of-main acceptance exposes concession only", () => {
  const active = createActiveState();
  const refresh = advanceRefreshPhase(active);
  const draw = advanceDrawPhase(refresh.state);
  const don = advanceDonPhase(draw.state);

  assert.deepEqual(getLegalActions(don.state, p1), [
    { type: "concede", playerId: p1 },
  ]);
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

test("illegal actions return errors and do not mutate input state", () => {
  const state = createActiveState();
  const before = JSON.stringify(state);

  const result = applyAction(state, {
    type: "attachDon",
    donInstanceId: "missing-don" as never,
    target: {
      instanceId: must(state.players[p1], "p1").leader.instanceId,
      cardId: must(state.players[p1], "p1").leader.cardId,
      playerId: p1,
    },
  });

  assert.equal(result.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), before);
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
