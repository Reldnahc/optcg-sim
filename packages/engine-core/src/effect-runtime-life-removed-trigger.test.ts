import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEngineEventId,
} from "./action-test-fixtures.js";
import {
  executeNoChoiceEffectPrimitive,
  processEffectRuntime,
} from "./effect-runtime.js";
import {
  queueDrawForP1,
  toEffectId,
  withCardInZone,
} from "./effect-runtime-queue-processing-test-support.js";

const setupLifeRemovedDefinition = (
  state: ReturnType<typeof createActiveState>,
): void => {
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  p1State.hand = p1State.hand.filter(
    (card) => card.instanceId !== source.instanceId,
  );
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-life-removed",
      rulesVersion: "life-removed-rules",
      sourceTextHash: "life-removed-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const definition: EffectDefinition = {
    ...baseDefinition,
    effects: [
      {
        ...must(baseDefinition.effects[0], "base draw effect"),
        id: toEffectId("life-removed-draw-lock"),
        trigger: { type: "lifeRemoved", players: ["self", "opponent"] },
        condition: { type: "yourTurn" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "draw", count: 1, player: "self" },
            },
            {
              connector: "then",
              effect: {
                type: "preventDraw",
                player: "self",
                source: "ownEffects",
                duration: { type: "thisTurn" },
              },
            },
          ],
        },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-life-removed": definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
};

test("lifeRemoved reaction queues from Life movement and prevents later own-effect draws", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  state.eventJournal = [];
  setupLifeRemovedDefinition(state);
  const before = must(state.players[p1], "p1 before");
  const movedLife = must(before.life[0], "life card").card;
  state.eventJournal.push({
    id: toEngineEventId("event:life-removed:public"),
    seq: 1,
    type: "cardMoved",
    payload: {
      from: { zone: "life", playerId: p1, slot: "life", index: 0 },
      to: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
      reason: "moveCards",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "test:life-removed" },
    createdAtStateSeq: state.seq,
  });
  state.eventJournal.push({
    id: toEngineEventId("event:life-removed:private"),
    seq: 2,
    type: "cardMoved",
    payload: {
      instanceId: movedLife.instanceId,
      cardId: movedLife.cardId,
      from: { zone: "life", playerId: p1, slot: "life", index: 0 },
      to: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
      reason: "moveCards",
    },
    visibility: { type: "private", playerId: p1 },
    causedBy: { type: "ruleProcess", name: "test:life-removed" },
    createdAtStateSeq: state.seq,
  });

  const queued = processEffectRuntime(state);
  assert.equal(queued.errors, undefined);
  assert.equal(queued.state.effectQueue.length, 1);
  assert.equal(
    queued.events.map((event) => event.type).join(","),
    "effectQueued",
  );

  const resolved = processEffectRuntime(queued.state);
  assert.equal(resolved.errors, undefined);
  const afterResolved = must(resolved.state.players[p1], "p1 resolved");
  assert.equal(afterResolved.hand.length, before.hand.length + 1);
  assert.equal(
    resolved.state.continuousEffects.some(
      (effect) =>
        effect.modifier.layer === "restriction" &&
        effect.modifier.operation.type === "restriction" &&
        effect.modifier.operation.restriction === "cannotDrawByOwnEffects" &&
        effect.controller === p1,
    ),
    true,
  );

  const blockedDraw = executeNoChoiceEffectPrimitive(
    resolved.state,
    queueDrawForP1(),
    { type: "draw", count: 1, player: "self" },
  );
  assert.equal(blockedDraw.errors, undefined);
  assert.equal(
    must(blockedDraw.state.players[p1], "p1 after blocked draw").hand.length,
    afterResolved.hand.length,
  );
  assert.equal(
    must(blockedDraw.state.players[p2], "p2 unaffected").hand.length,
    must(resolved.state.players[p2], "p2 before unrelated").hand.length,
  );
});
