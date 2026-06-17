import assert from "node:assert/strict";
import { test } from "vitest";

import type { Effect } from "@optcg/types";

import { resolveQueuedDamagePrimitive } from "./damage.js";
import {
  createActiveState,
  must,
  p2,
  queueDrawForP1,
  resolvedCard,
} from "./test-support.js";

const liveOptions = {
  includeStateHash: false,
  validateInvariants: false,
} as const;

test("queued damage pending decision preserves omitted state hash", () => {
  const state = createActiveState();
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life");
  state.cardManifest.cards[topLife.card.cardId] = resolvedCard({
    cardId: topLife.card.cardId,
    category: "event",
  });
  const entry = queueDrawForP1();
  const damageEffect = {
    type: "damage",
    target: "leader",
    player: "opponent",
    count: 1,
  } satisfies Extract<Effect, { type: "damage" }>;

  const resolution = resolveQueuedDamagePrimitive(
    state,
    entry,
    damageEffect,
    [],
    liveOptions,
  );

  assert.equal(resolution.status, "pendingDecision");
  assert.equal(
    resolution.result.state.pendingDecision?.type,
    "confirmLifeTrigger",
  );
  assert.equal(resolution.result.stateHash, "");
});
