import assert from "node:assert/strict";
import { test } from "vitest";

import { applyAttachDon } from "./don.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  toCardId,
} from "../action-test-fixtures.js";

test("applyAction attaches active DON!! to own leader/character during main phase", () => {
  const state = createActiveState();
  state.turn.phase = "main";
  const turnPlayer = must(state.players[p1], "p1");
  const don = must(turnPlayer.donDeck[0], "don");
  turnPlayer.donDeck = turnPlayer.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  turnPlayer.costArea = [
    {
      ...don,
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
  const targetCharacter = must(turnPlayer.characters[0], "target character");

  const result = applyAttachDon(state, {
    type: "attachDon",
    donInstanceId: don.instanceId,
    target: {
      instanceId: targetCharacter.instanceId,
      cardId: targetCharacter.cardId,
      playerId: p1,
    },
  });

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    must(result.state.players[p1], "p1").characters[0]?.attachedDon,
    [don.instanceId],
  );
  assert.equal(
    must(result.state.players[p1], "p1").costArea[0]?.state,
    undefined,
  );
});

test("applyAction rejects illegal attachDon variants", () => {
  const base = createActiveState();
  base.turn.phase = "main";
  const p1State = must(base.players[p1], "p1");
  const p2State = must(base.players[p2], "p2");
  const don = must(p1State.donDeck[0], "don");
  p1State.donDeck = p1State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  p1State.costArea = [
    {
      ...don,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "active",
    },
  ];

  const wrongPlayer = applyAttachDon(base, {
    type: "attachDon",
    donInstanceId: don.instanceId,
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });
  assert.equal(wrongPlayer.errors?.[0]?.type, "illegalAction");

  const wrongPhase = createActiveState();
  const wrongPhaseP1 = must(wrongPhase.players[p1], "wrong-phase p1");
  const wrongPhaseDon = must(wrongPhaseP1.donDeck[0], "wrong-phase don");
  wrongPhaseP1.donDeck = wrongPhaseP1.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  wrongPhaseP1.costArea = [
    {
      ...wrongPhaseDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "active",
    },
  ];
  wrongPhase.turn.phase = "draw";
  const wrongPhaseResult = applyAttachDon(wrongPhase, {
    type: "attachDon",
    donInstanceId: wrongPhaseDon.instanceId,
    target: {
      instanceId: wrongPhaseP1.leader.instanceId,
      cardId: wrongPhaseP1.leader.cardId,
      playerId: p1,
    },
  });
  assert.equal(wrongPhaseResult.errors?.[0]?.type, "illegalAction");

  const restedDon = createActiveState();
  restedDon.turn.phase = "main";
  const restedP1 = must(restedDon.players[p1], "rested p1");
  const restedDonCard = must(restedP1.donDeck[0], "rested don");
  restedP1.donDeck = restedP1.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  restedP1.costArea = [
    {
      ...restedDonCard,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "rested",
    },
  ];
  const restedResult = applyAttachDon(restedDon, {
    type: "attachDon",
    donInstanceId: restedDonCard.instanceId,
    target: {
      instanceId: restedP1.leader.instanceId,
      cardId: restedP1.leader.cardId,
      playerId: p1,
    },
  });
  assert.equal(restedResult.errors?.[0]?.type, "illegalAction");

  const invalidTarget = applyAttachDon(base, {
    type: "attachDon",
    donInstanceId: don.instanceId,
    target: {
      instanceId: don.instanceId,
      cardId: don.cardId,
      playerId: p1,
    },
  });
  assert.equal(invalidTarget.errors?.[0]?.type, "illegalAction");

  const malformedTargetCardId = applyAttachDon(base, {
    type: "attachDon",
    donInstanceId: don.instanceId,
    target: {
      instanceId: p1State.leader.instanceId,
      cardId: toCardId("forged-leader"),
      playerId: p1,
    },
  });
  assert.equal(malformedTargetCardId.errors?.[0]?.type, "illegalAction");

  const malformedTargetZone = applyAttachDon(base, {
    type: "attachDon",
    donInstanceId: don.instanceId,
    target: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
      zone: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
    },
  });
  assert.equal(malformedTargetZone.errors?.[0]?.type, "illegalAction");
});
