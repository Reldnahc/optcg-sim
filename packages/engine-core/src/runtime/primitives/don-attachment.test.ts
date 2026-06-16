import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, CardRef, GameState, PlayerId } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  toDecisionId,
} from "../../effect-runtime-queue/test-support.js";
import { applyDonAttachment } from "./don-attachment.js";

const leaderRef = (state: GameState, playerId: PlayerId): CardRef => {
  const player = must(state.players[playerId], "player");
  return {
    instanceId: player.leader.instanceId,
    cardId: player.leader.cardId,
    playerId,
    zone: player.leader.zone,
  };
};

const placeCostDon = (
  state: ReturnType<typeof createActiveState>,
  playerId: PlayerId,
  donState: "active" | "rested",
): CardInstance => {
  const player = must(state.players[playerId], "player");
  const don = must(player.donDeck[0], "DON");
  player.donDeck = player.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId, slot: "donDeck", index },
  }));
  const costDon: CardInstance = {
    ...don,
    zone: { zone: "costArea", playerId, slot: "cost", index: 0 },
    state: donState,
  };
  player.costArea = [costDon];
  return costDon;
};

test("shared DON attachment primitive attaches selected cost-area DON and records events", () => {
  const state = createActiveState();
  const don = placeCostDon(state, p1, "active");
  const target = leaderRef(state, p1);

  const result = applyDonAttachment({
    causedBy: { type: "decision", decisionId: toDecisionId("decision-1") },
    selectedDonInstanceIds: [don.instanceId],
    sourcePlayerId: p1,
    sourceState: "active",
    state,
    target,
  });

  assert.equal(result.ok, true);
  const nextPlayer = must(result.players[p1], "next p1");
  assert.deepEqual(nextPlayer.leader.attachedDon, [don.instanceId]);
  assert.equal(
    nextPlayer.costArea.find((card) => card.instanceId === don.instanceId)
      ?.state,
    undefined,
  );
  assert.equal(result.events.length, 1);
  const event = must(result.events[0], "donAttached event");
  assert.equal(event.type, "donAttached");
  assert.deepEqual(event.causedBy, {
    type: "decision",
    decisionId: toDecisionId("decision-1"),
  });
});

test("DON attachment emits a public presentation-safe event", () => {
  const state = createActiveState();
  const don = placeCostDon(state, p1, "active");
  const target = leaderRef(state, p1);

  const result = applyDonAttachment({
    sourcePlayerId: p1,
    sourceState: "active",
    state,
    selectedDonInstanceIds: [don.instanceId],
    target,
  });

  assert.equal(result.ok, true);
  const attachedEvent = result.events.find(
    (event) => event.type === "donAttached",
  );
  assert.ok(attachedEvent);
  assert.deepEqual(attachedEvent.visibility, { type: "public" });
  assert.deepEqual(attachedEvent.payload, {
    playerId: p1,
    donInstanceId: don.instanceId,
    from: don.zone,
    to: target.zone,
    target,
  });
});

test("shared DON attachment primitive rejects invalid target-owner constraints without mutation", () => {
  const state = createActiveState();
  const opponentTarget = leaderRef(state, p2);
  const don = placeCostDon(state, p1, "active");

  const result = applyDonAttachment({
    requireTargetOwnerMatchesSource: true,
    selectedDonInstanceIds: [don.instanceId],
    sourcePlayerId: p1,
    sourceState: "active",
    state,
    target: opponentTarget,
  });

  assert.equal(result.ok, false);
  assert.equal(
    must(state.players[p1], "unchanged p1").costArea[0]?.state,
    "active",
  );
  assert.deepEqual(
    must(state.players[p2], "unchanged p2").leader.attachedDon,
    [],
  );
});
