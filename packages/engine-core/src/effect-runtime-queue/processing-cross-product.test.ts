import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectQueueEntry } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  setupOnPlayDefinition,
} from "./test-support.js";

test("queue entry resolution keeps draw primitive reusable across queued wrappers", () => {
  const cases = [
    { name: "onPlay", trigger: { type: "onPlay" as const } },
    { name: "whenAttacking", trigger: { type: "whenAttacking" as const } },
  ];

  for (const testCase of cases) {
    const state = createActiveState();
    const entry: EffectQueueEntry = {
      ...queueDrawForP1(),
      sourcePresencePolicy: "mustRemainInSameZone",
    };
    const player = must(state.players[p1], "p1");
    player.leader = {
      ...player.leader,
      instanceId: entry.source.instanceId,
      cardId: entry.source.cardId,
      zone: must(entry.source.zone, "entry source zone"),
    };
    const supportCard = resolvedCard({
      cardId: entry.source.cardId,
      category: "character",
    });
    const base = reviewedOnPlayDrawDefinition(
      entry.source.cardId,
      supportCard.support,
    );
    setupOnPlayDefinition(
      state,
      {
        ...player.leader,
        cardId: entry.source.cardId,
      },
      {
        ...base,
        effects: [
          {
            ...must(base.effects[0], `${testCase.name} draw effect`),
            id: entry.effectBlockId,
            trigger: testCase.trigger,
            sourcePresencePolicy: "mustRemainInSameZone",
          },
        ],
      },
      `def:${testCase.name}:draw`,
    );
    state.effectQueue = [entry];
    const beforeDeck = must(state.players[p1], "p1").deck.length;
    const beforeHand = must(state.players[p1], "p1").hand.length;

    const result = processEffectRuntime(state);

    assert.equal(result.errors, undefined, testCase.name);
    assert.equal(result.state.effectQueue.length, 0, testCase.name);
    assert.equal(
      must(result.state.players[p1], "p1").deck.length,
      beforeDeck - 1,
    );
    assert.equal(
      must(result.state.players[p1], "p1").hand.length,
      beforeHand + 1,
    );
  }
});
