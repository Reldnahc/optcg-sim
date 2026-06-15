import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  ContinuousEffectRecord,
  EngineResult,
} from "@optcg/types";

import { must, p1, resolvedCard } from "../action-test-fixtures.js";
import { applyPlayCard, applyPlayCardDecisionResponse } from "./core.js";
import { setupMainPlayState } from "./test-fixtures.js";

const applyPlayCardTestAction = (
  state: Parameters<typeof applyPlayCard>[0],
  action:
    | Extract<Action, { type: "playCard" }>
    | Extract<Action, { type: "respondToDecision" }>,
): EngineResult => {
  if (action.type === "playCard") {
    return applyPlayCard(state, action);
  }
  const result = applyPlayCardDecisionResponse(state, action);
  assert.ok(result !== null, "expected play-card decision response");
  return result;
};

const addCharacterEnterRestedModifier = (
  state: Parameters<typeof applyPlayCard>[0],
): void => {
  const source = must(state.players[p1], "p1").leader;
  state.continuousEffects.push({
    id: "test:enter-rested",
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: source.owner,
      controllerId: source.controller,
      zone: source.zone,
      category: "leader",
      colors: [],
      keywords: [],
    },
    controller: p1,
    duration: { type: "permanent" },
    createdBy: { type: "ruleProcess", name: "test" },
    createdAtStateSeq: state.seq,
    modifier: {
      layer: "playEntryState",
      target: { type: "player", player: "self" },
      operation: {
        type: "enterRested",
        filter: { categories: ["character"] },
      },
    },
  } as unknown as ContinuousEffectRecord);
};

test("matching continuous entry-state modifier makes normally played Characters enter rested", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const card = must(p1State.hand[0], "card");
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category: "character",
    cost: 0,
    power: 3000,
  });
  addCharacterEnterRestedModifier(state);

  const result = applyPlayCardTestAction(state, {
    type: "playCard",
    cardInstanceId: card.instanceId,
  });

  assert.equal(result.errors, undefined);
  const resolvedP1 = must(result.state.players[p1], "p1 after play");
  const played = must(resolvedP1.characters[0], "played character");
  assert.equal(played.instanceId, card.instanceId);
  assert.equal(played.state, "rested");
});
