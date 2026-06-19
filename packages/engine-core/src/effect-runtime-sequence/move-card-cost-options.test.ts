import assert from "node:assert/strict";
import { test } from "vitest";
import type { CardInstance, OptionalCost } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  queueDrawForP1,
  resolvedCard,
} from "../effect-runtime-queue/test-support.js";
import {
  expandMoveCardsCostRoutes,
  selectableMoveCardsCostIds,
} from "./move-card-cost-options.js";

const attachFirstCostDonToLeader = (
  player: ReturnType<typeof createActiveState>["players"][typeof p1],
): CardInstance["instanceId"] => {
  const don = must(player.costArea[0], "cost DON");
  player.leader = {
    ...player.leader,
    attachedDon: [...player.leader.attachedDon, don.instanceId],
  };
  const attachedDon = { ...don };
  delete attachedDon.state;
  player.costArea = [{ ...attachedDon }, ...player.costArea.slice(1)];
  return don.instanceId;
};

const placeFirstDonInCostArea = (
  player: ReturnType<typeof createActiveState>["players"][typeof p1],
): void => {
  const don = must(player.donDeck[0], "DON deck card");
  player.donDeck = player.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  player.costArea = [
    {
      ...don,
      zone: {
        zone: "costArea",
        playerId: p1,
        slot: "cost",
        index: player.costArea.length,
      },
      state: "active",
    },
  ];
};

test("move-card cost options expose hand-to-deck-bottom payment routes", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "player");
  const cost: Extract<OptionalCost, { type: "moveCards" }> = {
    type: "moveCards",
    count: 2,
    chooser: "self",
    from: { player: "self", zone: "hand" },
    to: { player: "self", zone: "deck", position: "bottom" },
    order: "chooserChoice",
    optional: true,
  };

  const options = expandMoveCardsCostRoutes(cost);

  assert.deepEqual(options, [
    {
      id: "moveCards",
      type: "moveCards",
      count: 2,
      from: { player: "self", zone: "hand" },
      to: { player: "self", zone: "deck", position: "bottom" },
    },
  ]);
  assert.deepEqual(
    selectableMoveCardsCostIds(
      state,
      queueDrawForP1().controllerId,
      player,
      must(options[0], "option"),
    ),
    player.hand.map((card) => card.instanceId),
  );
});

test("move-card cost options expose source character-to-hand payment routes", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "player");
  const source = must(player.hand[0], "source");
  player.hand = player.hand.slice(1);
  player.characters = [
    {
      ...source,
      controller: p1,
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 0,
      },
    },
  ];
  const cost: Extract<OptionalCost, { type: "moveCards" }> = {
    type: "moveCards",
    count: 1,
    chooser: "self",
    from: {
      player: "self",
      zone: "characterArea",
      source: "effectSource",
    },
    to: { player: "self", zone: "hand" },
    order: "chooserChoice",
    optional: true,
  };

  const options = expandMoveCardsCostRoutes(cost, source.instanceId);

  assert.deepEqual(options, [
    {
      id: "moveCards",
      type: "moveCards",
      count: 1,
      from: {
        player: "self",
        zone: "characterArea",
        source: "effectSource",
      },
      to: { player: "self", zone: "hand" },
      sourceInstanceId: source.instanceId,
    },
  ]);
  assert.deepEqual(
    selectableMoveCardsCostIds(
      state,
      queueDrawForP1().controllerId,
      player,
      must(options[0], "option"),
    ),
    [source.instanceId],
  );
});

test("move-card cost options expose variable character-to-hand payment routes", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "player");
  const first = must(player.hand[0], "first character");
  const second = must(player.hand[1], "second character");
  state.cardManifest.cards[first.cardId] = resolvedCard({
    cardId: first.cardId,
    category: "character",
  });
  state.cardManifest.cards[second.cardId] = resolvedCard({
    cardId: second.cardId,
    category: "character",
  });
  player.hand = player.hand.slice(2);
  player.characters = [
    {
      ...first,
      controller: p1,
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 0,
      },
    },
    {
      ...second,
      controller: p1,
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 1,
      },
    },
  ];
  const cost: Extract<OptionalCost, { type: "moveCards" }> = {
    type: "moveCards",
    count: 0,
    maxCount: "available",
    chooser: "self",
    from: { player: "self", zone: "characterArea" },
    to: { player: "self", zone: "hand" },
    order: "chooserChoice",
    filter: { categories: ["character"] },
    optional: true,
  };

  const options = expandMoveCardsCostRoutes(cost);

  assert.deepEqual(options, [
    {
      id: "moveCards",
      type: "moveCards",
      count: 0,
      maxCount: "available",
      from: { player: "self", zone: "characterArea" },
      to: { player: "self", zone: "hand" },
      filter: { categories: ["character"] },
    },
  ]);
  assert.deepEqual(
    selectableMoveCardsCostIds(
      state,
      queueDrawForP1().controllerId,
      player,
      must(options[0], "option"),
    ),
    [first.instanceId, second.instanceId],
  );
});

test("move-card cost options reject malformed variable move-card routes", () => {
  const malformed: Extract<OptionalCost, { type: "moveCards" }> = {
    type: "moveCards",
    count: 0,
    maxCount: "available",
    chooser: "self",
    from: { player: "self", zone: "hand" },
    to: { player: "opponent", zone: "hand" },
    order: "chooserChoice",
    optional: true,
  };

  assert.deepEqual(expandMoveCardsCostRoutes(malformed), []);
});

test("move-card cost options expose attached DON to rested cost area payment routes", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "player");
  placeFirstDonInCostArea(player);
  const attachedDonId = attachFirstCostDonToLeader(player);
  const cost: Extract<OptionalCost, { type: "moveCards" }> = {
    type: "moveCards",
    count: 1,
    chooser: "self",
    from: { player: "self", zone: "costArea" },
    to: { player: "self", zone: "costArea" },
    order: "chooserChoice",
    filter: { categories: ["don"], state: "attached" },
    destinationState: "rested",
    optional: true,
  };

  const options = expandMoveCardsCostRoutes(cost);

  assert.deepEqual(options, [
    {
      id: "moveCards",
      type: "moveCards",
      count: 1,
      from: { player: "self", zone: "costArea" },
      to: { player: "self", zone: "costArea" },
      filter: { categories: ["don"], state: "attached" },
      destinationState: "rested",
    },
  ]);
  assert.deepEqual(
    selectableMoveCardsCostIds(
      state,
      queueDrawForP1().controllerId,
      player,
      must(options[0], "option"),
    ),
    [attachedDonId],
  );
});

test("move-card cost options expose top and bottom Life-to-trash payment routes", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "player");
  const cost: Extract<OptionalCost, { type: "moveCards" }> = {
    type: "moveCards",
    count: 1,
    chooser: "self",
    from: { player: "self", zone: "life", position: "topOrBottom" },
    to: { player: "self", zone: "trash" },
    order: "chooserChoice",
    optional: true,
  };

  const options = expandMoveCardsCostRoutes(cost);

  assert.deepEqual(
    options.map((option) => option.id),
    ["moveCards:top", "moveCards:bottom"],
  );
  assert.deepEqual(
    selectableMoveCardsCostIds(
      state,
      queueDrawForP1().controllerId,
      player,
      must(options[0], "top option"),
    ),
    [must(player.life[0], "top Life").card.instanceId],
  );
  assert.deepEqual(
    selectableMoveCardsCostIds(
      state,
      queueDrawForP1().controllerId,
      player,
      must(options[1], "bottom option"),
    ),
    [must(player.life.at(-1), "bottom Life").card.instanceId],
  );
});
