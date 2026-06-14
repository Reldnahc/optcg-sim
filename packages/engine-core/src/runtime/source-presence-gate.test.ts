import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardRef } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  resolvedCard,
} from "../action-test-fixtures.js";
import {
  fieldSourceCanUseEffects,
  fieldSourceStillPresent,
  findFieldSource,
} from "./source-presence-gate.js";

test("findFieldSource finds a live leader source by instance/card/zone", () => {
  const state = createActiveState();
  const leader = must(state.players[p1], "p1").leader;
  state.cardManifest.cards[leader.cardId] = resolvedCard({
    cardId: leader.cardId,
    category: "leader",
  });

  const found = findFieldSource(state, {
    instanceId: leader.instanceId,
    cardId: leader.cardId,
    playerId: p1,
    zone: leader.zone,
  });

  assert.ok(found);
  assert.equal(found.card.instanceId, leader.instanceId);
  assert.equal(found.resolved.cardId, leader.cardId);
});

test("fieldSourceStillPresent rejects stale zone movement", () => {
  const state = createActiveState();
  const leader = must(state.players[p1], "p1").leader;
  state.cardManifest.cards[leader.cardId] = resolvedCard({
    cardId: leader.cardId,
    category: "leader",
  });
  const staleRef: CardRef = {
    instanceId: leader.instanceId,
    cardId: leader.cardId,
    playerId: p1,
    zone: { ...leader.zone, zone: "trash" },
  };

  assert.equal(fieldSourceStillPresent(state, staleRef), false);
});

test("fieldSourceCanUseEffects rejects negated live sources", () => {
  const state = createActiveState();
  const leader = must(state.players[p1], "p1").leader;
  state.effectInvalidations = [
    {
      cardInstanceId: leader.instanceId,
      until: { type: "endOfTurn" },
    },
  ];

  const found = fieldSourceCanUseEffects(state, {
    instanceId: leader.instanceId,
    cardId: leader.cardId,
    playerId: p1,
    zone: leader.zone,
  });

  assert.equal(found, undefined);
});
