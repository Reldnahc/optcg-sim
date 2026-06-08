import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, EffectQueueEntry } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  setupOnPlayDefinition,
  toCardId,
  toEffectId,
} from "./test-support.js";
import { createQueuedEffectResolvers } from "./effect-resolution.js";
import { resolveImplementedDslEffectDefinition } from "../effect-runtime.js";

const createResolvers = () =>
  createQueuedEffectResolvers({ resolveImplementedDslEffectDefinition });

test("queued draw resolver supports the same draw body under two wrappers", () => {
  const wrappers = ["onPlay", "whenAttacking"] as const;

  for (const wrapper of wrappers) {
    const state = createActiveState();
    const entry: EffectQueueEntry = {
      ...queueDrawForP1(),
      sourcePresencePolicy: "mustRemainInSameZone",
    };
    const supportCard = resolvedCard({
      cardId: entry.source.cardId,
      category: "character",
    });
    const base = reviewedOnPlayDrawDefinition(
      entry.source.cardId,
      supportCard.support,
    );
    const definition: EffectDefinition = {
      ...base,
      effects: [
        {
          ...must(base.effects[0], "draw effect"),
          id: entry.effectBlockId,
          trigger: { type: wrapper },
          sourcePresencePolicy: "mustRemainInSameZone",
        },
      ],
    };
    setupOnPlayDefinition(
      state,
      {
        ...must(state.players[p1], "p1").leader,
        cardId: entry.source.cardId,
      },
      definition,
      `def:${wrapper}`,
    );

    const resolved = createResolvers().resolveQueuedDrawEffect(state, entry);

    assert.deepEqual(resolved, { type: "draw", player: "self", count: 1 });
  }
});

test("queued primitive resolvers keep one wrapper reusable across draw and search bodies", () => {
  const state = createActiveState();
  const entry: EffectQueueEntry = {
    ...queueDrawForP1(),
    effectBlockId: toEffectId("OP01-015:auto-on-play-search"),
    sourcePresencePolicy: "mustRemainInSameZone",
  };
  const supportCard = resolvedCard({
    cardId: entry.source.cardId,
    category: "character",
  });
  const base = reviewedOnPlayDrawDefinition(
    entry.source.cardId,
    supportCard.support,
  );
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "draw effect"),
        id: entry.effectBlockId,
        trigger: { type: "onPlay" },
        effect: {
          type: "search",
          request: {
            zone: "deck",
            player: "self",
            min: 0,
            max: 1,
            destination: "hand",
            revealTo: "all",
            shuffleAfter: true,
            filter: { categories: ["character"] },
          },
        },
      },
    ],
  };
  setupOnPlayDefinition(
    state,
    {
      ...must(state.players[p1], "p1").leader,
      cardId: toCardId("OP01-015"),
    },
    definition,
    "def:on-play-search",
  );

  const resolvers = createResolvers();

  assert.equal(resolvers.resolveQueuedDrawEffect(state, entry), undefined);
  assert.equal(
    resolvers.resolveQueuedSearchRevealEffect(state, entry)?.type,
    "search",
  );
});
