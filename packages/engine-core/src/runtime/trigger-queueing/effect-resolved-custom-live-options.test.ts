import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  ContinuousEffectRecord,
  EffectQueueEntry,
  EngineEvent,
  EngineResult,
  GameState,
} from "@optcg/types";

import { resolveImplementedDslEffectDefinition } from "../../effect-runtime-definition-lookup.js";
import {
  must,
  p1,
  queueDrawForP1,
  queueingState,
  setupCustomEffectResolvedDefinition,
  toCardId,
  toEffectId,
  toEngineEventId,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";
import { createKOTriggerQueueing } from "./ko.js";

const liveOptions = {
  includeStateHash: false,
  validateInvariants: false,
} as const;

const cardRef = (card: CardInstance) => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId: card.controller,
  zone: card.zone,
});

const invalidateCardEffectsRecord = (
  state: GameState,
  target: CardInstance,
): ContinuousEffectRecord => {
  const source = must(state.players[p1], "p1").leader;
  return {
    id: `continuous:invalidate-card:${String(target.instanceId)}`,
    source: cardRef(source),
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: source.owner,
      controllerId: source.controller,
      zone: source.zone,
      category: "leader",
      colors: ["red"],
      keywords: [],
      power: 5000,
    },
    controller: source.controller,
    modifier: {
      layer: "effectInvalidation",
      target: {
        type: "exactCard",
        card: cardRef(target),
        binding: {
          family: "selectedTargets",
          saveResultAs: "selected:negated-card",
        },
        createdAtStateSeq: state.seq,
      },
      operation: { type: "invalidateEffects" },
    },
    duration: { type: "thisTurn" },
    createdBy: { type: "ruleProcess", name: "test-negate-card" },
    createdAtStateSeq: state.seq,
  };
};

const createTriggerQueueing = () =>
  createKOTriggerQueueing(
    {
      resolveImplementedDslEffectDefinition,
      createUnsupportedPendingRuntimeWorkError: (work) => ({
        type: "effectRuntimeError",
        effectId: toEffectId("effect-runtime"),
        details: { reason: "unsupported-pending-runtime-work", work },
      }),
    },
    (reason) => ({
      type: "effectRuntimeError",
      effectId: toEffectId("on-ko-trigger-candidate-detection"),
      details: { reason },
    }),
  );

test("effect-resolved custom trigger queueing preserves omitted state hash", () => {
  const { state } = queueingState();
  const p1State = must(state.players[p1], "p1");
  const resolvedEntry = queueDrawForP1();
  const customSource = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(p1State.hand[1], "custom trigger source"),
      cardId: toCardId("custom-trigger-source"),
    },
    zone: "characterArea",
    index: 1,
  });
  setupCustomEffectResolvedDefinition(
    state,
    customSource,
    `effectResolved:${String(resolvedEntry.effectBlockId)}`,
  );
  const resolutionEvents: EngineEvent[] = [
    {
      id: toEngineEventId("event:resolved:1:effectResolved"),
      seq: state.eventJournal.length + 1,
      type: "effectResolved",
      payload: {
        queueEntryId: resolvedEntry.id,
        timingWindowId: resolvedEntry.timingWindowId,
        generation: resolvedEntry.generation,
        effectBlockId: resolvedEntry.effectBlockId,
        sourcePresencePolicy: resolvedEntry.sourcePresencePolicy,
      },
      visibility: { type: "public" },
      causedBy: {
        type: "effect",
        queueEntryId: resolvedEntry.id,
        effectId: resolvedEntry.effectBlockId,
      },
      createdAtStateSeq: state.seq,
    },
  ];
  const triggerQueueing = createTriggerQueueing();
  const queueCustomTriggers =
    triggerQueueing.queueEffectResolvedCustomTriggers as (
      state: GameState,
      resolvedEntry: EffectQueueEntry,
      resolutionEvents: readonly EngineEvent[],
      options: typeof liveOptions,
    ) => EngineResult | undefined;

  const result = queueCustomTriggers(
    state,
    resolvedEntry,
    resolutionEvents,
    liveOptions,
  );

  assert.ok(result !== undefined);
  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 1);
  assert.equal(result.stateHash, "");
});

test("effect-resolved custom trigger queueing accepts every supported same-event block", () => {
  const { state } = queueingState();
  const p1State = must(state.players[p1], "p1");
  const resolvedEntry = queueDrawForP1();
  const customSource = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(p1State.hand[1], "custom trigger source"),
      cardId: toCardId("custom-trigger-source"),
    },
    zone: "characterArea",
    index: 1,
  });
  const definition = setupCustomEffectResolvedDefinition(
    state,
    customSource,
    `effectResolved:${String(resolvedEntry.effectBlockId)}`,
  );
  const effect = must(definition.effects[0], "custom effect");
  const secondEffect = {
    ...effect,
    id: toEffectId(`${String(effect.id)}:second`),
  };
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-effect-resolved": {
      ...definition,
      effects: [effect, secondEffect],
    },
  };
  const resolutionEvents: EngineEvent[] = [
    {
      id: toEngineEventId("event:resolved:1:effectResolved"),
      seq: state.eventJournal.length + 1,
      type: "effectResolved",
      payload: {
        queueEntryId: resolvedEntry.id,
        timingWindowId: resolvedEntry.timingWindowId,
        generation: resolvedEntry.generation,
        effectBlockId: resolvedEntry.effectBlockId,
        sourcePresencePolicy: resolvedEntry.sourcePresencePolicy,
      },
      visibility: { type: "public" },
      causedBy: {
        type: "effect",
        queueEntryId: resolvedEntry.id,
        effectId: resolvedEntry.effectBlockId,
      },
      createdAtStateSeq: state.seq,
    },
  ];
  const triggerQueueing = createTriggerQueueing();

  const result = triggerQueueing.queueEffectResolvedCustomTriggers(
    state,
    resolvedEntry,
    resolutionEvents,
  );

  assert.ok(result !== undefined);
  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.state.effectQueue.map((entry) => entry.effectBlockId),
    [effect.id, secondEffect.id],
  );
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["effectQueued", "effectQueued"],
  );
});

test("effect-resolved custom trigger queueing skips negated source effects", () => {
  const { state } = queueingState();
  const p1State = must(state.players[p1], "p1");
  const resolvedEntry = queueDrawForP1();
  const customSource = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(p1State.hand[1], "custom trigger source"),
      cardId: toCardId("custom-trigger-source"),
    },
    zone: "characterArea",
    index: 1,
  });
  setupCustomEffectResolvedDefinition(
    state,
    customSource,
    `effectResolved:${String(resolvedEntry.effectBlockId)}`,
  );
  state.continuousEffects.push(
    invalidateCardEffectsRecord(state, customSource),
  );
  const resolutionEvents: EngineEvent[] = [
    {
      id: toEngineEventId("event:resolved:1:effectResolved"),
      seq: state.eventJournal.length + 1,
      type: "effectResolved",
      payload: {
        queueEntryId: resolvedEntry.id,
        timingWindowId: resolvedEntry.timingWindowId,
        generation: resolvedEntry.generation,
        effectBlockId: resolvedEntry.effectBlockId,
        sourcePresencePolicy: resolvedEntry.sourcePresencePolicy,
      },
      visibility: { type: "public" },
      causedBy: {
        type: "effect",
        queueEntryId: resolvedEntry.id,
        effectId: resolvedEntry.effectBlockId,
      },
      createdAtStateSeq: state.seq,
    },
  ];
  const triggerQueueing = createTriggerQueueing();

  const result = triggerQueueing.queueEffectResolvedCustomTriggers(
    state,
    resolvedEntry,
    resolutionEvents,
  );

  assert.equal(result, undefined);
});
