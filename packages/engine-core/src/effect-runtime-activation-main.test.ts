import assert from "node:assert/strict";
import { test } from "vitest";

import { applyAction, getLegalActions } from "./actions.js";
import {
  installActivateMainDrawDefinition,
  makeMainPhaseLegalActionState,
  toCardId,
  toEffectId,
} from "./action-dispatcher-test-support.js";
import { must, p1, p2 } from "./action-test-fixtures.js";

test("getLegalActions exposes activateEffect only for controller during legal main-phase windows", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const character = must(p1State.characters[0], "character");
  const stageCard = must(p1State.hand[0], "stage hand card");
  p1State.stage = {
    ...stageCard,
    zone: { zone: "stageArea", playerId: p1, slot: "stage", index: 0 },
  };
  p1State.hand = p1State.hand.slice(1);

  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-leader",
    effectId: toEffectId("activate-main-leader-1"),
  });
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(character.cardId),
    category: "character",
    definitionId: "def-activate-main-character",
    effectId: toEffectId("activate-main-character-1"),
  });
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(stageCard.cardId),
    category: "stage",
    definitionId: "def-activate-main-stage",
    effectId: toEffectId("activate-main-stage-1"),
  });

  const p1Actions = getLegalActions(state, p1).filter(
    (action) => action.type === "activateEffect",
  );
  const p2Actions = getLegalActions(state, p2).filter(
    (action) => action.type === "activateEffect",
  );

  assert.equal(p1Actions.length, 3);
  assert.deepEqual(p2Actions, []);
});

test("applyAction accepts valid activate main action and resolves draw through runtime", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const beforeDeck = p1State.deck.length;
  const beforeHand = p1State.hand.length;
  const effectId = toEffectId("activate-main-leader-draw-1");
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-leader-draw",
    effectId,
  });

  const result = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });

  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p1], "p1 after").deck.length,
    beforeDeck - 1,
  );
  assert.equal(
    must(result.state.players[p1], "p1 after").hand.length,
    beforeHand + 1,
  );
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(
    result.events.some((event) => event.type === "effectQueued"),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "effectResolved"),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "cardDrawn"),
    true,
  );
});

test("once-per-turn activate main consumes on legal use, rejects same-turn repeat, and resets next turn", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-leader-once-1");
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-leader-once",
    effectId,
    oncePerTurn: true,
  });

  const first = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });
  assert.equal(first.errors, undefined);
  assert.equal(first.state.oncePerTurn.length, 1);

  const second = applyAction(first.state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });
  assert.equal(second.errors?.[0]?.type, "illegalAction");
  assert.deepEqual(second.state, first.state);

  const nextTurn = structuredClone(first.state);
  nextTurn.turn.globalTurn += 1;
  const third = applyAction(nextTurn, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });
  assert.equal(third.errors, undefined);
});

test("activate main wrong-phase and forged effect attempts fail closed without mutation", () => {
  const state = makeMainPhaseLegalActionState();
  const p1State = must(state.players[p1], "p1");
  const leader = p1State.leader;
  const effectId = toEffectId("activate-main-leader-forge-1");
  installActivateMainDrawDefinition({
    state,
    sourceCardId: toCardId(leader.cardId),
    category: "leader",
    definitionId: "def-activate-main-leader-forge",
    effectId,
  });

  const forgedBefore = JSON.stringify(state);
  const forged = applyAction(state, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId: toEffectId("activate-main-missing"),
  });
  assert.equal(forged.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(state), forgedBefore);

  const wrongPhase = structuredClone(state);
  wrongPhase.turn.phase = "draw";
  const wrongPhaseBefore = JSON.stringify(wrongPhase);
  const blocked = applyAction(wrongPhase, {
    type: "activateEffect",
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p1,
      zone: leader.zone,
    },
    effectId,
  });
  assert.equal(blocked.errors?.[0]?.type, "illegalAction");
  assert.equal(JSON.stringify(wrongPhase), wrongPhaseBefore);
});
