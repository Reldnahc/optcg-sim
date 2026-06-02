import assert from "node:assert/strict";
import { test } from "vitest";

import type { ContinuousEffectRecord } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
} from "../action-test-fixtures.js";
import { computeView } from "./compute-view.js";

const handCostReductionRecord = (
  state: ReturnType<typeof createActiveState>,
): ContinuousEffectRecord => {
  const source = must(state.players[p1], "p1").leader;
  return {
    id: "supported-hand-cost-add",
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: source.controller,
      zone: source.zone,
    },
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: source.owner,
      controllerId: source.controller,
      zone: source.zone,
      category: "leader",
      colors: ["red"],
      power: 5000,
      keywords: [],
    },
    controller: p1,
    modifier: {
      layer: "costAdd",
      target: {
        type: "allMatching",
        zone: "hand",
        player: "self",
        filter: {
          categories: ["character"],
          typesAny: ["Test Pirates"],
          cost: { min: 2 },
        },
      },
      operation: { type: "addCost", value: -1 },
    },
    duration: {
      type: "whileConditionTrue",
      condition: { type: "yourTurn" },
    },
    createdBy: { type: "ruleProcess", name: "compute-view-cost-test" },
    createdAtStateSeq: state.seq,
  };
};

test("computeView accepts hand play-cost modifiers without changing combat projection", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  state.turn.phase = "main";
  state.turn.turnPlayerId = p1;
  state.cardManifest.cards[p1State.leader.cardId] = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[p2State.leader.cardId] = resolvedCard({
    cardId: p2State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  const leaderBefore = structuredClone(p1State.leader);
  state.continuousEffects = [handCostReductionRecord(state)];

  const view = computeView(state);

  assert.equal(view.cards[p1State.leader.instanceId]?.basePower, 5000);
  assert.equal(view.cards[p1State.leader.instanceId]?.currentPower, 5000);
  assert.deepEqual(p1State.leader, leaderBefore);
});
