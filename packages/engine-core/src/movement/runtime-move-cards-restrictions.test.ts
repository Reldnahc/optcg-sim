import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  ContinuousEffectRecord,
  Effect,
  EffectDefinition,
  GameState,
} from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
} from "../effect-runtime-queue/test-support.js";

const lifeTopToHandEffect = (count: number): Effect => ({
  type: "moveCards",
  count,
  from: { player: "self", zone: "life", position: "top" },
  to: { player: "self", zone: "hand" },
  order: "original",
});

const setupMoveCardsDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-restricted-move-cards";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "event",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "restricted-move-cards-rules",
      sourceTextHash: "restricted-move-cards-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-restricted-move-cards"),
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

test("own-effect Life-to-hand restriction blocks Life movement as a no-op", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "source");
  const topLife = must(p1State.life[0], "top life").card;
  const originalLifeLength = p1State.life.length;
  const originalHandLength = p1State.hand.length;
  const definition = setupMoveCardsDefinition(
    state,
    source,
    lifeTopToHandEffect(1),
  );
  const restriction: ContinuousEffectRecord = {
    id: "continuous:prevent-life-to-hand",
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: toSourceSnapshot(source, p1, p1),
    controller: p1,
    modifier: {
      layer: "restriction",
      target: { type: "player", player: "self" },
      operation: {
        type: "restriction",
        restriction: "cannotAddLifeToHandByOwnEffects",
      },
    },
    duration: { type: "thisTurn" },
    createdBy: { type: "ruleProcess", name: "prevent-life-to-hand-test" },
    createdAtStateSeq: state.seq,
  };
  state.continuousEffects = [restriction];
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-restricted-life-to-hand"),
      timingWindowId: toTimingWindowId("window-restricted-life-to-hand"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "life move effect").id,
      sourcePresencePolicy: "noSourceRequired",
      causedBy: { type: "ruleProcess", name: "life-to-hand-test" },
    },
  ];

  const result = processEffectRuntime(state);
  const player = must(result.state.players[p1], "p1 result");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(player.life.length, originalLifeLength);
  assert.equal(player.hand.length, originalHandLength);
  assert.equal(
    must(player.life[0], "top life after restriction").card.instanceId,
    topLife.instanceId,
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["effectResolved", "ruleProcessingChecked"],
  );
});
