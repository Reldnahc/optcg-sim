import assert from "node:assert/strict";
import { test } from "vitest";
import type { DynamicNumberValue } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
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

test("countMatchingZoneCards dynamic value counts rested cost-area DON", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  player.costArea = player.donDeck.slice(0, 3).map((card, index) => ({
    ...card,
    state: index === 0 ? "active" : "rested",
    zone: { zone: "costArea", playerId: p1, slot: "cost", index },
  }));
  player.donDeck = player.donDeck.slice(3);
  const value: DynamicNumberValue = {
    type: "countMatchingZoneCards",
    player: "self",
    zone: "costArea",
    filter: { categories: ["don"], state: "rested" },
    per: 1,
    multiplier: 1000,
  };

  assert.equal(
    resolveDynamicNumberValue(state, value, { controllerId: p1 }),
    2000,
  );
});

test("fieldCountDifference dynamic value floors zone count differences", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  const opponent = must(state.players[p2], "p2");
  player.costArea = player.donDeck.slice(0, 3).map((card, index) => ({
    ...card,
    zone: { zone: "costArea", playerId: p1, slot: "cost", index },
  }));
  opponent.costArea = opponent.donDeck.slice(0, 1).map((card, index) => ({
    ...card,
    zone: { zone: "costArea", playerId: p2, slot: "cost", index },
  }));
  const value = {
    type: "fieldCountDifference",
    minuend: {
      player: "self",
      zone: "costArea",
      filter: { categories: ["don"] },
    },
    subtrahend: {
      player: "opponent",
      zone: "costArea",
      filter: { categories: ["don"] },
    },
    minimum: 0,
  } as unknown as DynamicNumberValue;

  assert.equal(
    resolveDynamicNumberValue(state, value, { controllerId: p1 }),
    2,
  );

  opponent.costArea = opponent.donDeck.slice(0, 7).map((card, index) => ({
    ...card,
    zone: { zone: "costArea", playerId: p2, slot: "cost", index },
  }));

  assert.equal(
    resolveDynamicNumberValue(state, value, { controllerId: p1 }),
    0,
  );
});
