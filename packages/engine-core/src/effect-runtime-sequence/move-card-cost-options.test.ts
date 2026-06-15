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
