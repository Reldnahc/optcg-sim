import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import { createActiveState, must, p1 } from "./action-test-fixtures.js";
import { isEffectBlockInvalidated } from "./effect-invalidation.js";

type EffectBlock = EffectDefinition["effects"][number];

const effectBlock = (
  trigger: EffectBlock["trigger"],
  id: string,
): EffectBlock => ({
  id: id as EffectBlock["id"],
  category: trigger.type === "activateMain" ? "activate" : "auto",
  trigger,
  sourcePresencePolicy: "mustRemainInSameZone",
  effect: { type: "draw", count: 1, player: "self" },
});

test("entry-point effect invalidation only invalidates matching effect blocks", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const source = player.leader;
  state.continuousEffects.push({
    id: "continuous:invalidate-self-on-play-effects",
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
      colors: [],
      keywords: [],
    },
    controller: p1,
    modifier: {
      layer: "effectInvalidation",
      target: { type: "player", player: "self" },
      operation: {
        type: "invalidateEffectEntryPoint",
        effectEntryPoint: { type: "onPlay" },
      },
    },
    duration: { type: "whileSourceOnField" },
    createdBy: { type: "ruleProcess", name: "test-effect-invalidation" },
    createdAtStateSeq: state.seq,
  });

  assert.equal(
    isEffectBlockInvalidated(
      state,
      source,
      effectBlock({ type: "onPlay" }, "effect:on-play"),
    ),
    true,
  );
  assert.equal(
    isEffectBlockInvalidated(
      state,
      source,
      effectBlock({ type: "activateMain" }, "effect:activate-main"),
    ),
    false,
  );
});
