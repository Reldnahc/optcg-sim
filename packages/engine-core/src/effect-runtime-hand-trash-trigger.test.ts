import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition, EngineEvent, GameState } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  processEffectRuntime,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toDecisionId,
  toEffectId,
  toEngineEventId,
  withCardInZone,
} from "./effect-runtime-queue/test-support.js";

const setupHandTrashReactionSource = (): GameState => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const effectDefinitionId = "def-hand-trash-reaction";
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "reaction source"),
    zone: "characterArea",
  });
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "hand-trash-reaction-rules",
      sourceTextHash: "hand-trash-reaction-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-hand-trash-invalidate-self"),
        category: "auto",
        trigger: { type: "handTrashedByEffect", player: "self" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "invalidateEffects",
          target: { type: "self" },
          duration: { type: "thisTurn" },
        },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.eventJournal.push({
    id: toEngineEventId("event:hand-trash:source-played"),
    seq: 1,
    type: "cardPlayed",
    payload: {
      playerId: p1,
      instanceId: source.instanceId,
      cardId: source.cardId,
      category: "character",
    },
    visibility: { type: "public" },
    createdAtStateSeq: state.seq,
  });
  return state;
};

const addHandTrashEvent = (
  state: GameState,
  options: { triggerSource?: "effect" } = {},
): void => {
  const handCard = must(must(state.players[p1], "p1").hand[1], "hand card");
  const event: EngineEvent = {
    id: toEngineEventId("event:hand-trash:body"),
    seq: state.eventJournal.length + 1,
    type: "cardTrashed",
    payload: {
      playerId: p1,
      instanceId: handCard.instanceId,
      cardId: handCard.cardId,
      reason: "trashFromHand",
      ...options,
    },
    visibility: { type: "public" },
    causedBy: { type: "decision", decisionId: toDecisionId("decision:test") },
    createdAtStateSeq: state.seq,
  };
  state.eventJournal.push(event);
};

test("handTrashedByEffect queues and resolves after effect-body hand trash", () => {
  const state = setupHandTrashReactionSource();
  addHandTrashEvent(state, { triggerSource: "effect" });

  const queued = processEffectRuntime(state);
  assert.equal(queued.errors, undefined);
  assert.deepEqual(
    queued.events.map((event) => event.type),
    ["effectQueued"],
  );
  assert.equal(queued.state.effectQueue.length, 1);

  const resolved = processEffectRuntime(queued.state);
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.effectQueue.length, 0);
  assert.equal(resolved.state.continuousEffects.length, 1);
  assert.deepEqual(resolved.state.continuousEffects[0]?.modifier.operation, {
    type: "invalidateEffects",
  });
});

test("handTrashedByEffect ignores untagged hand trash so costs do not trigger it", () => {
  const state = setupHandTrashReactionSource();
  addHandTrashEvent(state);

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.events, []);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(result.state.continuousEffects.length, 0);
});
