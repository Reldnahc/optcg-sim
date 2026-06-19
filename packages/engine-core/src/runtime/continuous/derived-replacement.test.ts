import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardRef, Effect, GameState, PlayerId } from "@optcg/types";

import { effectToDerivedModifier } from "./derived-modifier.js";

const playerId = "p1" as PlayerId;

const minimalState = (): GameState =>
  ({
    players: {},
    turn: { turnPlayerId: playerId, playerTurnCounts: {} },
    phase: "main",
    seq: 0,
    actionSeq: 0,
    eventSeq: 0,
    cardManifest: { cards: {} },
    continuousEffects: [],
    effectQueue: [],
    effectExecutionFrames: [],
    events: [],
    match: { status: "active" },
  }) as unknown as GameState;

const source = (): CardRef => ({
  instanceId: "replacement-source" as CardRef["instanceId"],
  cardId: "replacement-source" as CardRef["cardId"],
  playerId,
});

test("derived continuous materialization admits permanent replacement grants", () => {
  const effect: Effect = {
    type: "grantReplacement",
    duration: { type: "permanent" },
    replacement: {
      type: "replacement",
      when: {
        type: "wouldMoveZone",
        from: "life",
        to: "hand",
        lifeMatcher: { faceUp: true },
        target: { type: "all", zone: "life", player: "self" },
      },
      instead: {
        type: "bounce",
        target: { type: "replacementTarget" },
        destination: "deckBottom",
      },
    },
  };

  const modifier = effectToDerivedModifier(minimalState(), source(), effect);

  assert.deepEqual(modifier, {
    layer: "replacement",
    target: { type: "player", player: "self" },
    operation: { type: "replacement", replacement: effect.replacement },
  });
});
