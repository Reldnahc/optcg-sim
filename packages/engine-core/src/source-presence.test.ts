import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardInstance,
  CardRef,
  CardSnapshot,
  EffectId,
  EffectQueueEntry,
  GameState,
  InstanceId,
  PlayerId,
  QueueEntryId,
  StateSeq,
  TimingWindowId,
} from "@optcg/types";

import { createActiveState, must, p1 } from "./action-test-fixtures.js";
import { evaluateQueuedEffectSourcePresence } from "./source-presence.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toInstanceId = (value: string): InstanceId => value as InstanceId;
const toPlayerId = (value: string): PlayerId => value as PlayerId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;
const toStateSeq = (value: number): StateSeq => value as StateSeq;
const toTimingWindowId = (value: string): TimingWindowId =>
  value as TimingWindowId;

const sourceRef = (card: CardInstance, playerId: PlayerId): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

const sourceSnapshot = (
  card: CardInstance,
  controllerId: PlayerId = card.controller,
): CardSnapshot => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  ownerId: card.owner,
  controllerId,
  zone: card.zone,
  category: card.zone.zone === "leaderArea" ? "leader" : "character",
  colors: ["red"],
  keywords: [],
});

const queueEntry = (
  card: CardInstance,
  overrides: Partial<EffectQueueEntry> = {},
): EffectQueueEntry => ({
  id: toQueueEntryId("queue-entry-source-presence"),
  state: "pending",
  timingWindowId: toTimingWindowId("timing-window-source-presence"),
  generation: 0,
  controllerId: card.controller,
  source: sourceRef(card, card.controller),
  sourceSnapshot: sourceSnapshot(card),
  effectBlockId: toEffectId("effect-source-presence"),
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: toStateSeq(0),
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "source-presence-test" },
  ...overrides,
});

const p1Leader = (state: GameState): CardInstance =>
  must(state.players[p1], "p1").leader;

test("mustRemainInSameZone accepts only a live source in entry source zone", () => {
  const state = createActiveState();
  const source = p1Leader(state);
  const entry = queueEntry(source, {
    sourcePresencePolicy: "mustRemainInSameZone",
  });

  assert.deepEqual(evaluateQueuedEffectSourcePresence(state, entry), {
    ok: true,
    policy: "mustRemainInSameZone",
    sourcePresence: "present",
    sourceBasis: "liveZone",
  });

  const missingZoneEntry = queueEntry(source, {
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
    },
    sourcePresencePolicy: "mustRemainInSameZone",
  });

  assert.deepEqual(
    evaluateQueuedEffectSourcePresence(state, missingZoneEntry),
    {
      ok: false,
      policy: "mustRemainInSameZone",
      sourcePresence: "failClosed",
      reason: "missingExpectedSourceZone",
    },
  );

  const moved = {
    ...state,
    players: {
      ...state.players,
      [p1]: {
        ...must(state.players[p1], "p1"),
        leader: {
          ...source,
          zone: {
            zone: "trash" as const,
            playerId: p1,
            slot: "trash" as const,
            index: 0,
          },
        },
      },
    },
  };

  assert.deepEqual(evaluateQueuedEffectSourcePresence(moved, entry), {
    ok: false,
    policy: "mustRemainInSameZone",
    sourcePresence: "failClosed",
    reason: "liveSourceNotInExpectedZone",
  });
});

test("resolveFromDestinationZone uses entry source zone as the expected live destination", () => {
  const state = createActiveState();
  const source = p1Leader(state);
  const trashedSource: CardInstance = {
    ...source,
    zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 },
  };
  const destinationState: GameState = {
    ...state,
    players: {
      ...state.players,
      [p1]: {
        ...must(state.players[p1], "p1"),
        leader: trashedSource,
      },
    },
  };
  const entry = queueEntry(trashedSource, {
    sourcePresencePolicy: "resolveFromDestinationZone",
  });

  assert.deepEqual(
    evaluateQueuedEffectSourcePresence(destinationState, entry),
    {
      ok: true,
      policy: "resolveFromDestinationZone",
      sourcePresence: "present",
      sourceBasis: "liveZone",
    },
  );

  const absentState: GameState = {
    ...destinationState,
    players: {
      ...destinationState.players,
      [p1]: {
        ...must(destinationState.players[p1], "p1"),
        leader: {
          ...trashedSource,
          instanceId: toInstanceId("different-live-source"),
        },
      },
    },
  };

  assert.deepEqual(evaluateQueuedEffectSourcePresence(absentState, entry), {
    ok: false,
    policy: "resolveFromDestinationZone",
    sourcePresence: "failClosed",
    reason: "liveSourceNotFound",
  });
});

test("resolveFromLastKnownInformation accepts only matching source snapshot identity", () => {
  const state = createActiveState();
  const source = p1Leader(state);
  const baseEntry = queueEntry(source, {
    sourcePresencePolicy: "resolveFromLastKnownInformation",
  });

  assert.deepEqual(evaluateQueuedEffectSourcePresence(state, baseEntry), {
    ok: true,
    policy: "resolveFromLastKnownInformation",
    sourcePresence: "absent",
    sourceBasis: "lastKnownInformation",
  });

  const mismatches: Array<{
    entry: EffectQueueEntry;
    reason:
      | "snapshotInstanceMismatch"
      | "snapshotCardMismatch"
      | "snapshotControllerMismatch";
  }> = [
    {
      entry: {
        ...baseEntry,
        sourceSnapshot: {
          ...baseEntry.sourceSnapshot,
          instanceId: toInstanceId("stale-instance"),
        },
      },
      reason: "snapshotInstanceMismatch",
    },
    {
      entry: {
        ...baseEntry,
        sourceSnapshot: {
          ...baseEntry.sourceSnapshot,
          cardId: toCardId("OP99-999"),
        },
      },
      reason: "snapshotCardMismatch",
    },
    {
      entry: {
        ...baseEntry,
        sourceSnapshot: sourceSnapshot(source, toPlayerId("not-a-player")),
      },
      reason: "snapshotControllerMismatch",
    },
  ];

  for (const mismatch of mismatches) {
    assert.deepEqual(
      evaluateQueuedEffectSourcePresence(state, mismatch.entry),
      {
        ok: false,
        policy: "resolveFromLastKnownInformation",
        sourcePresence: "failClosed",
        reason: mismatch.reason,
      },
    );
  }
});

test("noSourceRequired does not require live source-zone presence", () => {
  const state = createActiveState();
  const source = p1Leader(state);
  const entry = queueEntry(source, {
    source: {
      ...sourceRef(source, p1),
      instanceId: toInstanceId("missing-live-source"),
    },
    sourceSnapshot: {
      ...sourceSnapshot(source),
      instanceId: toInstanceId("missing-live-source"),
    },
    sourcePresencePolicy: "noSourceRequired",
  });

  assert.deepEqual(evaluateQueuedEffectSourcePresence(state, entry), {
    ok: true,
    policy: "noSourceRequired",
    sourcePresence: "absent",
    sourceBasis: "notRequired",
  });
});

test("source presence results are deterministic and do not include hidden identifiers", () => {
  const state = createActiveState();
  const source = p1Leader(state);
  const entry = queueEntry(source, {
    source: {
      ...sourceRef(source, p1),
      instanceId: toInstanceId("secret-instance"),
      cardId: toCardId("secret-card"),
    },
    sourceSnapshot: {
      ...sourceSnapshot(source),
      instanceId: toInstanceId("secret-instance"),
      cardId: toCardId("secret-card"),
    },
    sourcePresencePolicy: "noSourceRequired",
  });

  const first = evaluateQueuedEffectSourcePresence(state, entry);
  const second = evaluateQueuedEffectSourcePresence(state, entry);
  const serialized = JSON.stringify(first);

  assert.deepEqual(first, second);
  assert.equal(serialized.includes("secret-instance"), false);
  assert.equal(serialized.includes("secret-card"), false);
});
