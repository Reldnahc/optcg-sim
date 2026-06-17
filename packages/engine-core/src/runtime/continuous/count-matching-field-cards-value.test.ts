import assert from "node:assert/strict";
import { test } from "vitest";
import type { DynamicNumberValue } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  resolvedCard,
  toCardId,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";
import { resolveDynamicNumberValue } from "./value-resolution.js";

test("countMatchingFieldCards dynamic value counts matching field cards", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const first = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(player.hand[0], "first character"),
      cardId: toCardId("neptunian-first"),
    },
    zone: "characterArea",
  });
  const second = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(player.hand[1], "second character"),
      cardId: toCardId("neptunian-second"),
    },
    zone: "characterArea",
  });
  for (const card of [first, second]) {
    state.cardManifest.cards[card.cardId] = {
      ...resolvedCard({
        cardId: card.cardId,
        category: "character",
      }),
      types: ["Neptunian"],
    };
  }

  const value = {
    type: "countMatchingFieldCards",
    player: "self",
    zone: "characterArea",
    filter: { categories: ["character"], typesAny: ["Neptunian"] },
    multiplier: 1,
  } as unknown as DynamicNumberValue;

  assert.equal(
    resolveDynamicNumberValue(state, value, { controllerId: p1 }),
    2,
  );
});

test("countMatchingZoneCards dynamic value applies offset and minimum after counting", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const value: DynamicNumberValue = {
    type: "countMatchingZoneCards",
    player: "self",
    zone: "life",
    per: 1,
    multiplier: 1,
    offset: -1,
    minimum: 0,
  };

  assert.equal(
    resolveDynamicNumberValue(state, value, { controllerId: p1 }),
    player.life.length - 1,
  );
  player.life = player.life.slice(0, 1);
  assert.equal(
    resolveDynamicNumberValue(state, value, { controllerId: p1 }),
    0,
  );
});
