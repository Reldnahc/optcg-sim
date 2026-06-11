import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, EffectQueueEntry } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  queuedEffect,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  setupOnPlayDefinition,
  toCardId,
} from "./test-support.js";
import { createQueuedEffectResolvers } from "./effect-resolution.js";
import { resolveQueuedPrimitiveBody } from "./primitive-resolution.js";
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

test("primitive resolver registry resolves queued bodies from normalized effect block", () => {
  const entry = queuedEffect(toCardId("registry"));
  const block = {
    id: entry.effectBlockId,
    category: "auto",
    trigger: { type: "onPlay" },
    sourcePresencePolicy: entry.sourcePresencePolicy,
    effect: { type: "draw", count: 1, player: "self" },
  } satisfies EffectDefinition["effects"][number];

  const resolved = resolveQueuedPrimitiveBody(block, entry);

  assert.deepEqual(resolved, {
    kind: "draw",
    effect: block.effect,
  });
});
