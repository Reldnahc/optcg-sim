import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, EffectDefinition, GameState } from "@optcg/types";

import { applyAction } from "./actions.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
} from "./action-test-fixtures.js";
import { processEffectRuntime } from "./effect-runtime.js";
import {
  queueDrawForP1,
  toEffectId,
  toQueueEntryId,
  toTimingWindowId,
  withCardInZone,
} from "./effect-runtime-queue/test-support.js";

const installLifeRemovedReaction = (
  state: GameState,
  source: CardInstance,
): void => {
  const effectDefinitionId = "def-life-removed-reaction";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "life-removed-reaction-rules",
      sourceTextHash: "life-removed-reaction-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base draw effect"),
        id: toEffectId("life-removed-draw-then-lock"),
        trigger: { type: "lifeRemoved", players: ["self", "opponent"] },
        condition: { type: "yourTurn" },
        sourcePresencePolicy: "mustRemainInSameZone",
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
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
};

const installOpponentLifeToOwnerHandDefinition = (
  state: GameState,
): {
  readonly effectBlockId: EffectDefinition["effects"][number]["id"];
  readonly leader: CardInstance;
} => {
  const leader = must(must(state.players[p1], "p1").leader, "leader");
  const supportCard = resolvedCard({
    cardId: leader.cardId,
    category: "leader",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-opponent-life-to-owner-hand",
      rulesVersion: "opponent-life-to-owner-hand-rules",
      sourceTextHash: "opponent-life-to-owner-hand-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(leader.cardId, supportCard.support);
  const effectBlockId = toEffectId("opponent-life-to-owner-hand");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: effectBlockId,
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "moveCards",
          min: 0,
          count: 1,
          from: { player: "opponent", zone: "life", position: "top" },
          to: { player: "owner", zone: "hand" },
          order: "original",
        },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-opponent-life-to-owner-hand": definition,
  };
  state.cardManifest.cards[leader.cardId] = supportCard;
  return { effectBlockId, leader };
};

test("lifeRemoved reaction queues after opponent Life moves to owner hand", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  state.eventJournal = [];
  const player = must(state.players[p1], "p1");
  const reactionSource = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "reaction source"),
    zone: "characterArea",
  });
  player.hand = player.hand.filter(
    (card) => card.instanceId !== reactionSource.instanceId,
  );
  installLifeRemovedReaction(state, reactionSource);
  const { effectBlockId, leader } =
    installOpponentLifeToOwnerHandDefinition(state);
  const beforeP2 = must(state.players[p2], "p2 before");
  const topLife = must(beforeP2.life[0], "p2 top life").card;
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-opponent-life-to-owner-hand"),
      timingWindowId: toTimingWindowId(
        "timing-window-opponent-life-to-owner-hand",
      ),
      controllerId: p1,
      source: {
        instanceId: leader.instanceId,
        cardId: leader.cardId,
        playerId: p1,
        zone: leader.zone,
      },
      sourceSnapshot: {
        instanceId: leader.instanceId,
        cardId: leader.cardId,
        ownerId: p1,
        controllerId: p1,
        zone: leader.zone,
        category: "leader",
        colors: ["red"],
        cost: 0,
        keywords: [],
      },
      effectBlockId,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: {
        type: "ruleProcess",
        name: "test:opponent-life-to-owner-hand",
      },
    },
  ];

  const quantityPaused = processEffectRuntime(state);
  assert.equal(quantityPaused.errors, undefined);
  assert.equal(quantityPaused.state.pendingDecision?.type, "chooseQuantity");

  const resolved = applyAction(quantityPaused.state, {
    type: "respondToDecision",
    decisionId: quantityPaused.state.pendingDecision.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(
    must(resolved.state.players[p2], "p2 after move").hand.at(-1)?.instanceId,
    topLife.instanceId,
  );
  assert.equal(
    resolved.events.some(
      (event) =>
        event.type === "effectQueued" &&
        event.causedBy?.type === "ruleProcess" &&
        event.causedBy.name === "effectRuntime:lifeRemovedTriggerQueueing",
    ),
    true,
  );
});
