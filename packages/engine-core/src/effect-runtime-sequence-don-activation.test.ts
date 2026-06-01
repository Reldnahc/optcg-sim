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
  applyAction,
  createActiveState,
  hashCanonicalStateValue,
  must,
  p1,
  processEffectRuntime,
  resolvedCard,
  toInstanceId,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "./effect-runtime-queue-processing-test-support.js";

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-don-activation-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "don-activation-sequence-rules",
      sourceTextHash: "don-activation-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-don-activation-sequence"),
        effect,
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

const sequenceQueueState = (
  effect: Effect,
): { state: GameState; source: CardInstance } => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      id: toQueueEntryId("queue-entry-don-activation-sequence"),
      state: "pending",
      timingWindowId: toTimingWindowId("window-don-activation-sequence"),
      generation: 0,
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "sequence effect").id,
      orderingGroup: "turnPlayer",
      createdAtEventSeq: 0,
      queuedAtStateSeq: state.seq,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "don-activation-sequence-test" },
    },
  ];
  return { state, source };
};

const selectRestedDonThenActivateSavedTargetSequence = (
  max = 1,
): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "select-don",
      connector: "always",
      saveResultAs: "savedDon",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          zone: "costArea",
          player: "self",
          min: 0,
          max,
          allowFewerIfUnavailable: true,
          visibility: "public",
          filter: { categories: ["don"], state: "rested" },
        },
      },
    },
    {
      id: "activate-don",
      connector: "then",
      effect: {
        type: "activate",
        target: {
          type: "savedFieldObject",
          binding: { family: "selectedTargets", saveResultAs: "savedDon" },
          zone: "costArea",
          player: "self",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
  ],
});

test("selectTargets saved reference can feed activate for rested DON in cost area", () => {
  const { state } = sequenceQueueState(
    selectRestedDonThenActivateSavedTargetSequence(),
  );
  const p1State = must(state.players[p1], "p1");
  const restedDon = must(p1State.donDeck[0], "rested don");
  p1State.donDeck = p1State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  p1State.costArea = [
    {
      ...restedDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "rested",
    },
  ];
  state.cardManifest.cards[restedDon.cardId] = resolvedCard({
    cardId: restedDon.cardId,
    category: "don",
  });

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target selection");
  assert.equal(decision.type, "selectTargets");
  assert.equal(decision.candidates.length, 1);

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: [must(decision.candidates[0], "candidate").card],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  const afterDon = must(resolved.state.players[p1], "after p1").costArea.find(
    (card) => card.instanceId === restedDon.instanceId,
  );
  assert.equal(afterDon?.state, "active");
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("DON activation restriction blocks Character-source DON activation through saved target path", () => {
  const { source, state } = sequenceQueueState(
    selectRestedDonThenActivateSavedTargetSequence(),
  );
  const p1State = must(state.players[p1], "p1");
  const restedDon = must(p1State.donDeck[0], "rested don");
  p1State.donDeck = p1State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  p1State.costArea = [
    {
      ...restedDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "rested",
    },
  ];
  state.cardManifest.cards[restedDon.cardId] = resolvedCard({
    cardId: restedDon.cardId,
    category: "don",
  });
  state.continuousEffects = [
    {
      id: "continuous:don-activation-restriction",
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
          restriction: "cannotActivateDon",
          sourceCategories: ["character"],
        },
      },
      duration: { type: "thisTurn" },
      createdBy: { type: "ruleProcess", name: "test" },
      createdAtStateSeq: state.seq,
    } satisfies ContinuousEffectRecord,
  ];

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target selection");
  assert.equal(decision.type, "selectTargets");
  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: [must(decision.candidates[0], "candidate").card],
    },
  });

  assert.equal(resolved.errors, undefined);
  const afterDon = must(resolved.state.players[p1], "after p1").costArea.find(
    (card) => card.instanceId === restedDon.instanceId,
  );
  assert.equal(afterDon?.state, "rested");
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("DON activation restriction materializes as source-category-scoped continuous restriction", () => {
  const { state } = sequenceQueueState({
    type: "preventDonActivation",
    player: "self",
    sourceCategories: ["character"],
    duration: { type: "thisTurn" },
  });

  const resolved = processEffectRuntime(state);
  const restriction = must(
    resolved.state.continuousEffects.find(
      (effect) =>
        effect.modifier.layer === "restriction" &&
        effect.modifier.operation.type === "restriction" &&
        effect.modifier.operation.restriction === "cannotActivateDon",
    ),
    "DON activation restriction",
  );

  assert.equal(resolved.errors, undefined);
  assert.equal(restriction.modifier.target.type, "player");
  const operation = restriction.modifier.operation;
  assert.equal(operation.type, "restriction");
  assert.deepEqual(operation.sourceCategories, ["character"]);
  assert.deepEqual(restriction.duration, { type: "thisTurn" });
});

test("DON activation restriction materialization keeps source category as data", () => {
  const { state } = sequenceQueueState({
    type: "preventDonActivation",
    player: "self",
    sourceCategories: ["event"],
    duration: { type: "thisTurn" },
  });

  const resolved = processEffectRuntime(state);
  const restriction = must(
    resolved.state.continuousEffects.find(
      (effect) =>
        effect.modifier.layer === "restriction" &&
        effect.modifier.operation.type === "restriction" &&
        effect.modifier.operation.restriction === "cannotActivateDon",
    ),
    "DON activation restriction",
  );

  assert.equal(resolved.errors, undefined);
  const operation = restriction.modifier.operation;
  assert.equal(operation.type, "restriction");
  assert.deepEqual(operation.sourceCategories, ["event"]);
});

test("DON activation restriction does not block non-matching source categories", () => {
  const { source, state } = sequenceQueueState(
    selectRestedDonThenActivateSavedTargetSequence(),
  );
  const entry = must(state.effectQueue[0], "queue entry");
  entry.sourceSnapshot = {
    ...entry.sourceSnapshot,
    category: "event",
  };
  const p1State = must(state.players[p1], "p1");
  const restedDon = must(p1State.donDeck[0], "rested don");
  p1State.donDeck = p1State.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  p1State.costArea = [
    {
      ...restedDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "rested",
    },
  ];
  state.cardManifest.cards[restedDon.cardId] = resolvedCard({
    cardId: restedDon.cardId,
    category: "don",
  });
  state.continuousEffects = [
    {
      id: "continuous:don-activation-restriction",
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
          restriction: "cannotActivateDon",
          sourceCategories: ["character"],
        },
      },
      duration: { type: "thisTurn" },
      createdBy: { type: "ruleProcess", name: "test" },
      createdAtStateSeq: state.seq,
    } satisfies ContinuousEffectRecord,
  ];

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target selection");
  assert.equal(decision.type, "selectTargets");
  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "targets",
      targets: [must(decision.candidates[0], "candidate").card],
    },
  });
  const afterDon = must(resolved.state.players[p1], "after p1").costArea.find(
    (card) => card.instanceId === restedDon.instanceId,
  );

  assert.equal(resolved.errors, undefined);
  assert.equal(afterDon?.state, "active");
});

test("sequence support admits selecting up to 10 DON in cost area", () => {
  const { state } = sequenceQueueState(
    selectRestedDonThenActivateSavedTargetSequence(10),
  );
  const p1State = must(state.players[p1], "p1");
  const donTemplate = must(p1State.donDeck[0], "don template");
  const restedDon = Array.from({ length: 10 }, (_, index) => ({
    ...donTemplate,
    instanceId: toInstanceId(`don-activation:${String(index)}`),
  }));
  p1State.donDeck = [];
  p1State.costArea = restedDon.map((card, index) => {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "don",
    });
    return {
      ...card,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index },
      state: "rested" as const,
    };
  });

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "target selection");

  assert.equal(paused.errors, undefined);
  assert.equal(decision.type, "selectTargets");
  assert.equal(decision.candidates.length, 10);
  assert.equal(decision.request.max, 10);
});
