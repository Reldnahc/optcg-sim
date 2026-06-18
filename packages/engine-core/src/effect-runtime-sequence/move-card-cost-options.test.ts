import assert from "node:assert/strict";
import { test } from "vitest";
import type { OptionalCost } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  queueDrawForP1,
} from "../effect-runtime-queue/test-support.js";
import {
  expandMoveCardsCostRoutes,
  selectableMoveCardsCostIds,
} from "./move-card-cost-options.js";

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
