import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
} from "@optcg/types";

import { isCardEffectInvalidated } from "../effect-invalidation.js";
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
} from "../effect-runtime-queue/test-support.js";

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-invalidation-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    cost: 4,
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "invalidation-sequence-rules",
      sourceTextHash: "invalidation-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-invalidation-sequence"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const sequenceQueueState = (effect: Effect): GameState => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  state.cardManifest.cards[p1State.leader.cardId] = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[p2State.leader.cardId] = resolvedCard({
    cardId: p2State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-invalidation-sequence"),
      timingWindowId: toTimingWindowId("window-invalidation-sequence"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "sequence effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "invalidation-sequence-test" },
    },
  ];
  return state;
};

const selectTargetsThenInvalidateSavedTargetSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "select-target",
      connector: "always",
      saveResultAs: "savedTarget",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          zone: "characterArea",
          player: "opponent",
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
          filter: { categories: ["character"], cost: { max: 5 } },
        },
      },
    },
    {
      id: "invalidate-selected-target",
      connector: "then",
      effect: {
        type: "invalidateEffects",
        target: {
          type: "savedFieldObject",
          binding: { family: "selectedTargets", saveResultAs: "savedTarget" },
          zone: "characterArea",
          player: "opponent",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
        duration: { type: "thisTurn" },
      },
    },
  ],
});

test("selectTargets saved reference can feed effect invalidation sequence child", () => {
  const state = sequenceQueueState(
    selectTargetsThenInvalidateSavedTargetSequence(),
  );
  const p2State = must(state.players[p2], "p2");
  const target = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "target"),
    zone: "characterArea",
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    cost: 5,
    power: 2000,
  });

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
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(
    resolved.state.continuousEffects.some(
      (effect) =>
        effect.modifier.layer === "effectInvalidation" &&
        effect.modifier.operation.type === "invalidateEffects",
    ),
    true,
  );
});

const invalidateThenKoSequence = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "select-invalidate-target",
      connector: "always",
      saveResultAs: "selected:invalidate-effects-target",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          zone: "characterArea",
          player: "opponent",
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
          filter: { categories: ["character"] },
        },
      },
    },
    {
      id: "invalidate-selected-target",
      connector: "then",
      effect: {
        type: "invalidateEffects",
        target: {
          type: "savedFieldObject",
          binding: {
            family: "selectedTargets",
            saveResultAs: "selected:invalidate-effects-target",
          },
          zone: "characterArea",
          player: "opponent",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
        duration: { type: "thisTurn" },
      },
    },
    {
      id: "select-ko-target",
      connector: "then",
      saveResultAs: "selected:ko-target",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          zone: "characterArea",
          player: "opponent",
          min: 0,
          max: 1,
          allowFewerIfUnavailable: true,
          visibility: "public",
          filter: { categories: ["character"], cost: { max: 5 } },
        },
      },
    },
    {
      id: "ko-selected-target",
      connector: "then",
      effect: {
        type: "ko",
        target: {
          type: "savedFieldObject",
          binding: {
            family: "selectedTargets",
            saveResultAs: "selected:ko-target",
          },
          zone: "characterArea",
          player: "opponent",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
  ],
});

test("trigger sequence keeps effect invalidation when a later K.O. target resolves", () => {
  const state = sequenceQueueState(invalidateThenKoSequence());
  const p2State = must(state.players[p2], "p2");
  const invalidatedTarget = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "invalidation target"),
    zone: "characterArea",
    index: 0,
  });
  const koTarget = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[1], "K.O. target"),
    zone: "characterArea",
    index: 1,
  });
  state.cardManifest.cards[invalidatedTarget.cardId] = resolvedCard({
    cardId: invalidatedTarget.cardId,
    category: "character",
    cost: 6,
    power: 6000,
  });
  state.cardManifest.cards[koTarget.cardId] = resolvedCard({
    cardId: koTarget.cardId,
    category: "character",
    cost: 5,
    power: 5000,
  });

  const pausedForInvalidation = processEffectRuntime(state);
  const invalidationDecision = must(
    pausedForInvalidation.state.pendingDecision,
    "invalidation target selection",
  );
  assert.equal(invalidationDecision.type, "selectTargets");

  const pausedForKo = applyAction(pausedForInvalidation.state, {
    type: "respondToDecision",
    decisionId: invalidationDecision.id,
    response: {
      type: "targets",
      targets: [
        {
          instanceId: invalidatedTarget.instanceId,
          cardId: invalidatedTarget.cardId,
          playerId: p2,
          zone: invalidatedTarget.zone,
        },
      ],
    },
  });
  assert.equal(pausedForKo.errors, undefined);
  const koDecision = must(pausedForKo.state.pendingDecision, "K.O. selection");
  assert.equal(koDecision.type, "selectTargets");

  const resolved = applyAction(pausedForKo.state, {
    type: "respondToDecision",
    decisionId: koDecision.id,
    response: {
      type: "targets",
      targets: [
        {
          instanceId: koTarget.instanceId,
          cardId: koTarget.cardId,
          playerId: p2,
          zone: koTarget.zone,
        },
      ],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(
    isCardEffectInvalidated(resolved.state, invalidatedTarget),
    true,
  );
  assert.equal(
    must(resolved.state.players[p2], "resolved p2").trash.some(
      (card) => card.instanceId === koTarget.instanceId,
    ),
    true,
  );
});
