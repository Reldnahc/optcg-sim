import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  resolvedCard,
  reviewedMainEventDrawDefinition,
  reviewedOnPlayDrawDefinition,
  toEngineEventId,
} from "./action-test-fixtures.js";
import { processEffectRuntime } from "./effect-runtime.js";
import {
  queueingState,
  setupOnPlayDefinition,
} from "./runtime/trigger-queueing/test-support.js";

test("live runtime trigger queueing preserves omitted state hash", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  setupOnPlayDefinition(
    state,
    played,
    reviewedOnPlayDrawDefinition(played.cardId, supportCard.support),
    "def-live-runtime-on-play",
  );

  const result = processEffectRuntime(state, {
    includeStateHash: false,
    validateInvariants: false,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.stateHash, "");
});

test("live runtime no-choice resolution preserves omitted state hash", () => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  setupOnPlayDefinition(
    state,
    played,
    reviewedOnPlayDrawDefinition(played.cardId, supportCard.support),
    "def-live-runtime-no-choice",
  );

  const queued = processEffectRuntime(state);
  const beforeDeck = must(queued.state.players[p1], "p1").deck.length;
  const result = processEffectRuntime(queued.state, {
    includeStateHash: false,
    validateInvariants: false,
  });

  assert.equal(result.errors, undefined);
  assert.equal(
    must(result.state.players[p1], "p1").deck.length,
    beforeDeck - 1,
  );
  assert.equal(result.stateHash, "");
});

test("live runtime main event queueing preserves omitted state hash", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  state.cardManifest.effectDefinitionsVersion = "0.1.0";
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "event source");
  const eventInTrash: CardInstance = {
    ...source,
    zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 },
  };
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  p1State.trash = [eventInTrash];

  const implemented = resolvedCard({
    cardId: eventInTrash.cardId,
    category: "event",
    cost: 1,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-live-runtime-main-event",
    },
  });
  state.cardManifest.cards[eventInTrash.cardId] = implemented;
  state.cardManifest.effectDefinitions = {
    "def-live-runtime-main-event": reviewedMainEventDrawDefinition(
      implemented.cardId,
      implemented.support,
    ),
  };
  state.eventJournal.push({
    id: toEngineEventId(`event:${String(state.seq)}:1:cardPlayed`),
    seq: state.eventJournal.length + 1,
    type: "cardPlayed",
    payload: {
      playerId: p1,
      instanceId: eventInTrash.instanceId,
      cardId: eventInTrash.cardId,
      category: "event",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "turnFlow" },
    createdAtStateSeq: state.seq,
  });

  const result = processEffectRuntime(state, {
    includeStateHash: false,
    validateInvariants: false,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.stateHash, "");
});
