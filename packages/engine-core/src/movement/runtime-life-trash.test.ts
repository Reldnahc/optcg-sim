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

const opponentLifeTopToTrashEffect = (count: number, min: number): Effect => ({
  type: "moveCards",
  min,
  count,
  from: { player: "opponent", zone: "life", position: "top" },
  to: { player: "opponent", zone: "trash" },
  order: "original",
});

const setupMoveCardsDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-opponent-life-trash";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "event",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "opponent-life-trash-rules",
      sourceTextHash: "opponent-life-trash-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-opponent-life-trash"),
        category: "auto",
        effect,
        sourcePresencePolicy: "noSourceRequired",
        trigger: { type: "trigger" },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

test("up-to opponent life top to trash is movement, not damage or life trigger", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = must(p1State.hand[0], "source");
  const topLife = must(p2State.life[0], "top life").card;
  const definition = setupMoveCardsDefinition(
    state,
    source,
    opponentLifeTopToTrashEffect(1, 0),
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-opponent-up-to-life-trash"),
      timingWindowId: toTimingWindowId("window-opponent-up-to-life-trash"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "life trash effect").id,
      sourcePresencePolicy: "noSourceRequired",
      causedBy: { type: "ruleProcess", name: "up-to-life-trash-test" },
    },
  ];

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "quantity decision");
  assert.equal(paused.errors, undefined);
  assert.equal(decision.type, "chooseQuantity");

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });
  const resultP2 = must(resolved.state.players[p2], "p2 result");

  assert.equal(resolved.errors, undefined);
  assert.equal(resultP2.life.length, p2State.life.length - 1);
  assert.equal(
    must(resultP2.trash[0], "trash top").instanceId,
    topLife.instanceId,
  );
  assert.equal(
    resolved.events.some((event) => event.type === "damageDealt"),
    false,
  );
  assert.equal(
    resolved.state.effectQueue.some(
      (entry) =>
        entry.causedBy.type === "ruleProcess" &&
        entry.causedBy.name === "effectRuntime:lifeRemovedTriggerQueueing",
    ),
    false,
  );
});
