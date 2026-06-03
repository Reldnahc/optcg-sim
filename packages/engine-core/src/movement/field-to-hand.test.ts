import assert from "node:assert/strict";
import { test } from "vitest";

import type { EngineEvent } from "@optcg/types";

import { moveFieldCardToOwnerHand } from "./field-to-hand.js";
import {
  createActiveState,
  must,
  p1,
  withCardInZone,
} from "../effect-runtime-queue/test-support.js";

test("field-to-hand movement clears a moved stage slot", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "player");
  const stage = withCardInZone({
    card: must(player.deck[0], "stage source"),
    playerId: p1,
    state,
    zone: "stageArea",
  });
  const events: EngineEvent[] = [];

  const moved = moveFieldCardToOwnerHand({
    card: stage,
    causedBy: { type: "ruleProcess", name: "turnFlow" },
    events,
    playerId: p1,
    sourceZone: "stageArea",
    state,
  });
  const nextPlayer = must(moved.state.players[p1], "next player");
  const movedStage = nextPlayer.hand.find(
    (card) => card.instanceId === stage.instanceId,
  );

  assert.equal(nextPlayer.stage, undefined);
  assert.equal(movedStage?.zone.zone, "hand");
});
