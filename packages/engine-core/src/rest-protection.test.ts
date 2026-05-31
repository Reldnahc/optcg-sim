import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  CardRef,
  ContinuousEffectRecord,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  PlayerId,
  Protection,
} from "@optcg/types";

import {
  applyAction,
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
  withCardInZone,
} from "./effect-runtime-queue-processing-test-support.js";

const cardRef = (card: CardInstance, playerId: PlayerId): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

const restLeaderOrCharacterEffect = (): Extract<Effect, { type: "rest" }> => ({
  type: "rest",
  target: {
    type: "chooseFromZones",
    request: {
      timing: "onResolution",
      chooser: "self",
      player: "opponent",
      zones: ["leaderArea", "characterArea"],
      min: 0,
      max: 1,
      allowFewerIfUnavailable: true,
      visibility: "public",
      filter: { categories: ["leader", "character"] },
    },
  },
});

const setupRestQueueState = (
  sourceCategory: "leader" | "character" | "event",
) => {
  const state = createActiveState();
  state.turn.turnPlayerId = p2;
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const target = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "target"),
    zone: "characterArea",
  });
  target.state = "active";
  const source = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "source"),
    zone: "characterArea",
  });
  source.state = "active";
  const effectDefinitionId = `def-rest-protection-${sourceCategory}`;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: sourceCategory === "event" ? "event" : "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "rest-protection-rules",
      sourceTextHash: "rest-protection-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId(`effect-rest-protection-${sourceCategory}`),
        effect: {
          type: "sequence",
          effects: [
            {
              id: "rest-target",
              connector: "always",
              effect: restLeaderOrCharacterEffect(),
            },
          ],
        },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.cards[p1State.leader.cardId] = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
  });
  const sourceSnapshot = {
    ...toSourceSnapshot(source, p2, p2),
    category: sourceCategory,
  } satisfies EffectQueueEntry["sourceSnapshot"];
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId(`queue-entry-rest-protection-${sourceCategory}`),
      timingWindowId: toTimingWindowId(
        `window-rest-protection-${sourceCategory}`,
      ),
      controllerId: p2,
      source: cardRef(source, p2),
      sourceSnapshot,
      effectBlockId: must(definition.effects[0], "rest effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "rest-protection-test" },
    },
  ];
  return { source, state, target };
};

const protectFromOpponentLeaderAndCharacterEffectRest = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
): void => {
  const protection = {
    process: "rest",
    sourceKind: "cardEffect",
    sourceControllerRelation: "opponentControlled",
    sourceCardCategories: ["leader", "character"],
  } as unknown as Protection;
  state.continuousEffects.push({
    id: `rest-protection:${String(source.instanceId)}`,
    source: cardRef(source, source.controller),
    sourceSnapshot: toSourceSnapshot(source, source.owner, source.controller),
    controller: source.controller,
    modifier: {
      layer: "protection",
      target: { type: "self" },
      operation: { type: "protection", protection },
    },
    duration: { type: "whileSourceOnField" },
    createdBy: { type: "ruleProcess", name: "rest-protection-test" },
    createdAtStateSeq: state.seq,
  } satisfies ContinuousEffectRecord);
};

test("opponent Character effect rest attempt is prevented by rest protection", () => {
  const { state, target } = setupRestQueueState("character");
  protectFromOpponentLeaderAndCharacterEffectRest(state, target);

  const paused = processEffectRuntime(state);
  assert.equal(paused.errors, undefined);
  const decision = must(paused.state.pendingDecision, "target decision");
  assert.equal(decision.type, "selectTargets");

  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "targets", targets: [cardRef(target, p1)] },
  });
  const nextTarget = must(
    must(result.state.players[p1], "next p1").characters.find(
      (card) => card.instanceId === target.instanceId,
    ),
    "target",
  );

  assert.equal(result.errors, undefined);
  assert.equal(nextTarget.state, "active");
});

test("opponent Leader effect rest attempt is prevented by rest protection", () => {
  const { state, target } = setupRestQueueState("leader");
  protectFromOpponentLeaderAndCharacterEffectRest(state, target);

  const paused = processEffectRuntime(state);
  assert.equal(paused.errors, undefined);
  const decision = must(paused.state.pendingDecision, "target decision");
  assert.equal(decision.type, "selectTargets");

  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "targets", targets: [cardRef(target, p1)] },
  });
  const nextTarget = must(
    must(result.state.players[p1], "next p1").characters.find(
      (card) => card.instanceId === target.instanceId,
    ),
    "target",
  );

  assert.equal(result.errors, undefined);
  assert.equal(nextTarget.state, "active");
});

test("opponent Event effect rest attempt is not prevented by Leader or Character effect rest protection", () => {
  const { state, target } = setupRestQueueState("event");
  protectFromOpponentLeaderAndCharacterEffectRest(state, target);

  const paused = processEffectRuntime(state);
  assert.equal(paused.errors, undefined);
  const decision = must(paused.state.pendingDecision, "target decision");
  assert.equal(decision.type, "selectTargets");

  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "targets", targets: [cardRef(target, p1)] },
  });
  const nextTarget = must(
    must(result.state.players[p1], "next p1").characters.find(
      (card) => card.instanceId === target.instanceId,
    ),
    "target",
  );

  assert.equal(result.errors, undefined);
  assert.equal(nextTarget.state, "rested");
});
