import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardRef, EffectDefinition, EffectQueueEntry } from "@optcg/types";

import {
  createActiveState,
  must,
  p2,
  toCardId,
  toEngineEventId,
  toStateSeq,
} from "./action-test-fixtures.js";
import { toDecisionId } from "./action-results.js";
import { effectDefinition } from "./battle/test-fixtures.js";
import { hasExactDamageDeferredQueue } from "./effect-runtime-damage-deferred-queue.js";
import { cleanupResolvedLifeTrigger } from "./movement/life-trigger-cleanup.js";

const toEffectId = (value: string): EffectDefinition["effects"][number]["id"] =>
  value as EffectDefinition["effects"][number]["id"];

const deferredDrawEffect = (
  eventName: string,
): EffectDefinition["effects"][number] => {
  const cardId = toCardId("deferred-follow-up-source");
  const definition = effectDefinition(cardId, {
    type: "custom",
    event: eventName,
  });
  return must(definition.effects[0], "deferred draw effect");
};

const deferredDeckTopTrashEffect = (
  eventName: string,
): EffectDefinition["effects"][number] => {
  const cardId = toCardId("deferred-move-follow-up-source");
  const definition = effectDefinition(
    cardId,
    {
      type: "custom",
      event: eventName,
    },
    {
      type: "moveCards",
      count: 1,
      from: { player: "self", zone: "deck", position: "top" },
      to: { player: "self", zone: "trash" },
      order: "original",
    },
  );
  return must(definition.effects[0], "deferred moveCards effect");
};

const publicFieldDeferredEntry = (params: {
  readonly queueEntryId: string;
  readonly timingWindowId: string;
  readonly causedByQueueEntryId: string;
  readonly queueOrigin?: EffectQueueEntry["queueOrigin"];
}): EffectQueueEntry => {
  const state = createActiveState();
  const leader = must(state.players[p2], "p2").leader;
  const lifeEffectId = toEffectId("life-trigger:effect");
  return {
    id: params.queueEntryId as EffectQueueEntry["id"],
    state: "pending",
    timingWindowId: params.timingWindowId as EffectQueueEntry["timingWindowId"],
    ...(params.queueOrigin === undefined
      ? {}
      : { queueOrigin: params.queueOrigin }),
    generation: 1,
    controllerId: p2,
    source: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      playerId: p2,
      zone: leader.zone,
    },
    sourceSnapshot: {
      instanceId: leader.instanceId,
      cardId: leader.cardId,
      ownerId: leader.owner,
      controllerId: leader.controller,
      zone: leader.zone,
      category: "leader",
      colors: ["blue"],
      keywords: [],
      power: 5000,
    },
    triggerEventId: toEngineEventId("event:deferred-follow-up"),
    effectBlockId: toEffectId("follow-up:draw"),
    orderingGroup: "nonTurnPlayer",
    createdAtEventSeq: 1,
    queuedAtStateSeq: toStateSeq(7),
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: {
      type: "effect",
      queueEntryId: params.causedByQueueEntryId as EffectQueueEntry["id"],
      effectId: lifeEffectId,
    },
  };
};

test("damage deferred queue support uses structured life-trigger origin instead of queue id prefixes", () => {
  const supportedEntry = publicFieldDeferredEntry({
    queueEntryId: "queue-entry:non-prefixed-follow-up",
    timingWindowId: "timing-window:non-prefixed-follow-up",
    causedByQueueEntryId: "queue-entry:non-prefixed-life-trigger",
    queueOrigin: { type: "lifeTrigger" },
  });
  const forgedEntry = publicFieldDeferredEntry({
    queueEntryId: "queue-entry:life-trigger:forged-follow-up",
    timingWindowId: "timing-window:life-trigger:forged-follow-up",
    causedByQueueEntryId: "queue-entry:life-trigger:forged-source",
  });
  const resolveEffect = (
    _state: ReturnType<typeof createActiveState>,
    entry: EffectQueueEntry,
  ) =>
    deferredDrawEffect(
      `effectResolved:${String(
        (
          entry.causedBy as Extract<
            EffectQueueEntry["causedBy"],
            { type: "effect" }
          >
        ).effectId,
      )}`,
    );

  const supportedState = createActiveState();
  supportedState.effectQueue = [supportedEntry];
  supportedState.deferredTriggers = [
    {
      timingWindowId: supportedEntry.timingWindowId,
      generation: supportedEntry.generation,
      triggerIds: [String(supportedEntry.id)],
      releasePolicy: "afterCurrentProcess",
    },
  ];
  const forgedState = createActiveState();
  forgedState.effectQueue = [forgedEntry];
  forgedState.deferredTriggers = [
    {
      timingWindowId: forgedEntry.timingWindowId,
      generation: forgedEntry.generation,
      triggerIds: [String(forgedEntry.id)],
      releasePolicy: "afterCurrentProcess",
    },
  ];

  assert.equal(
    hasExactDamageDeferredQueue(supportedState, resolveEffect),
    true,
  );
  assert.equal(hasExactDamageDeferredQueue(forgedState, resolveEffect), false);
});

test("damage deferred queue support accepts reusable non-draw follow-up bodies", () => {
  const supportedEntry = publicFieldDeferredEntry({
    queueEntryId: "queue-entry:deferred-move-follow-up",
    timingWindowId: "timing-window:deferred-move-follow-up",
    causedByQueueEntryId: "queue-entry:deferred-move-life-trigger",
    queueOrigin: { type: "lifeTrigger" },
  });
  const state = createActiveState();
  state.effectQueue = [supportedEntry];
  state.deferredTriggers = [
    {
      timingWindowId: supportedEntry.timingWindowId,
      generation: supportedEntry.generation,
      triggerIds: [String(supportedEntry.id)],
      releasePolicy: "afterCurrentProcess",
    },
  ];

  assert.equal(
    hasExactDamageDeferredQueue(state, () =>
      deferredDeckTopTrashEffect(
        `effectResolved:${String(
          (
            supportedEntry.causedBy as Extract<
              EffectQueueEntry["causedBy"],
              { type: "effect" }
            >
          ).effectId,
        )}`,
      ),
    ),
    true,
  );
});

const lifeTriggerCleanupEntry = (params: {
  readonly queueEntryId: string;
  readonly timingWindowId: string;
  readonly queueOrigin?: EffectQueueEntry["queueOrigin"];
}): EffectQueueEntry => {
  const cardId = toCardId("life-trigger-cleanup-card");
  const noZone = {
    zone: "noZone" as const,
    playerId: p2,
    slot: "temporary" as const,
  };
  const source: CardRef = {
    instanceId: "instance:life-trigger-cleanup" as CardRef["instanceId"],
    cardId,
    playerId: p2,
    zone: noZone,
  };
  return {
    id: params.queueEntryId as EffectQueueEntry["id"],
    state: "pending",
    timingWindowId: params.timingWindowId as EffectQueueEntry["timingWindowId"],
    ...(params.queueOrigin === undefined
      ? {}
      : { queueOrigin: params.queueOrigin }),
    generation: 0,
    controllerId: p2,
    source,
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId,
      ownerId: p2,
      controllerId: p2,
      zone: noZone,
      category: "event",
      colors: ["blue"],
      cost: 1,
      keywords: [],
    },
    triggerEventId: toEngineEventId("event:life-trigger-cleanup"),
    effectBlockId: toEffectId("life-trigger-cleanup:effect"),
    orderingGroup: "nonTurnPlayer",
    createdAtEventSeq: 1,
    queuedAtStateSeq: toStateSeq(7),
    sourcePresencePolicy: "resolveFromLastKnownInformation",
    causedBy: {
      type: "decision",
      decisionId: toDecisionId("decision:life-trigger"),
    },
  };
};

const stateWithRevealedLifeTrigger = (
  entry: EffectQueueEntry,
): ReturnType<typeof createActiveState> => {
  const state = createActiveState();
  state.revealedCards = [
    {
      id: "reveal:life-trigger-cleanup",
      cards: [entry.source],
      visibility: { type: "public" },
      origin: "lifeDamage",
      createdAtStateSeq: state.seq,
      cleanupPolicy: "trashAfterResolution",
    },
  ];
  return state;
};

test("life-trigger cleanup uses structured queue origin instead of queue id prefixes", () => {
  const supportedEntry = lifeTriggerCleanupEntry({
    queueEntryId: "queue-entry:non-prefixed-life-trigger-cleanup",
    timingWindowId: "timing-window:non-prefixed-life-trigger-cleanup",
    queueOrigin: { type: "lifeTrigger" },
  });
  const supported = cleanupResolvedLifeTrigger(
    stateWithRevealedLifeTrigger(supportedEntry),
    supportedEntry,
  );
  assert.equal(supported.events.length, 2);
  assert.equal(supported.state.revealedCards.length, 0);
  assert.equal(
    must(supported.state.players[p2], "p2").trash.some(
      (card) => card.instanceId === supportedEntry.source.instanceId,
    ),
    true,
  );

  const forgedEntry = lifeTriggerCleanupEntry({
    queueEntryId: "queue-entry:life-trigger:forged-cleanup",
    timingWindowId: "timing-window:life-trigger:forged-cleanup",
  });
  const forged = cleanupResolvedLifeTrigger(
    stateWithRevealedLifeTrigger(forgedEntry),
    forgedEntry,
  );
  assert.equal(forged.events.length, 0);
  assert.equal(forged.state.revealedCards.length, 1);
});
