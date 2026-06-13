import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
} from "@optcg/types";

import { applyAction } from "../actions.js";
import {
  createActiveState,
  must,
  p1,
  p2,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
} from "../effect-runtime-queue/test-support.js";

const addActiveDonFromDonDeckEffect = (
  player: "self" | "opponent" = "self",
  chooser?: "self" | "opponent",
): Effect => ({
  type: "moveCards",
  min: 0,
  count: 1,
  ...(chooser === undefined ? {} : { chooser }),
  from: { player, zone: "donDeck", position: "top" },
  to: { player, zone: "costArea" },
  order: "original",
  destinationState: "active",
});

const setupMoveCardsDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-move-cards";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "event",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "move-cards-rules",
      sourceTextHash: "move-cards-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-move-cards"),
        category: "auto",
        effect,
        sourcePresencePolicy: "noSourceRequired",
        trigger: { type: "trigger" },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const triggerDonMoveQueueStateFor = (
  player: "self" | "opponent",
): {
  state: GameState;
  movedDon: CardInstance;
} => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = must(p1State.hand[0], "source");
  const movedDon = must(
    player === "self" ? p1State.donDeck[0] : p2State.donDeck[0],
    "top DON",
  );
  const definition = setupMoveCardsDefinition(
    state,
    source,
    addActiveDonFromDonDeckEffect(player, player),
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-trigger-don-move"),
      timingWindowId: toTimingWindowId("window-trigger-don-move"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "DON move effect").id,
      sourcePresencePolicy: "noSourceRequired",
      causedBy: { type: "ruleProcess", name: "trigger-don-move-test" },
    },
  ];
  return { state, movedDon };
};

const triggerDonMoveQueueState = (): {
  state: GameState;
  movedDon: CardInstance;
} => triggerDonMoveQueueStateFor("self");

test("moveCards DON deck to cost area resolves from a trigger body", () => {
  const { state, movedDon } = triggerDonMoveQueueState();
  const originalDonDeckSize = must(state.players[p1], "p1").donDeck.length;

  const quantityPrompt = processEffectRuntime(state);
  const decision = must(
    quantityPrompt.state.pendingDecision,
    "DON quantity decision",
  );
  assert.equal(quantityPrompt.errors, undefined);
  assert.equal(decision.type, "chooseQuantity");

  const result = applyAction(quantityPrompt.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });
  const player = must(result.state.players[p1], "p1 result");
  const moved = must(player.costArea.at(-1), "moved DON");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(player.donDeck.length, originalDonDeckSize - 1);
  assert.equal(moved.instanceId, movedDon.instanceId);
  assert.equal(moved.state, "active");
  assert.equal(moved.zone.zone, "costArea");
  assert.equal(moved.zone.slot, "cost");
});

test("moveCards opponent DON deck to cost area prompts the opponent", () => {
  const { state, movedDon } = triggerDonMoveQueueStateFor("opponent");
  const originalDonDeckSize = must(state.players[p2], "p2").donDeck.length;

  const quantityPrompt = processEffectRuntime(state);
  const decision = must(
    quantityPrompt.state.pendingDecision,
    "opponent DON quantity decision",
  );
  assert.equal(quantityPrompt.errors, undefined);
  assert.equal(decision.type, "chooseQuantity");
  assert.equal(decision.playerId, p2);

  const result = applyAction(quantityPrompt.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });
  const player = must(result.state.players[p2], "p2 result");
  const moved = must(player.costArea.at(-1), "moved DON");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(player.donDeck.length, originalDonDeckSize - 1);
  assert.equal(moved.instanceId, movedDon.instanceId);
  assert.equal(moved.state, "active");
  assert.equal(moved.zone.zone, "costArea");
  assert.equal(moved.zone.slot, "cost");
});
