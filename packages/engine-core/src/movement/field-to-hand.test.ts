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

test("field-to-hand movement clears field rest state from the moved hand card", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "player");
  const character = withCardInZone({
    card: must(player.deck[0], "character source"),
    playerId: p1,
    state,
    zone: "characterArea",
  });
  const restedCharacter = { ...character, state: "rested" as const };
  player.characters = player.characters.map((candidate) =>
    candidate.instanceId === character.instanceId ? restedCharacter : candidate,
  );
  const events: EngineEvent[] = [];

  const moved = moveFieldCardToOwnerHand({
    card: restedCharacter,
    causedBy: { type: "ruleProcess", name: "turnFlow" },
    events,
    playerId: p1,
    sourceZone: "characterArea",
    state,
  });
  const nextPlayer = must(moved.state.players[p1], "next player");
  const movedCharacter = must(
    nextPlayer.hand.find((card) => card.instanceId === character.instanceId),
    "moved character",
  );

  assert.equal(movedCharacter.zone.zone, "hand");
  assert.equal(movedCharacter.state, undefined);
});
