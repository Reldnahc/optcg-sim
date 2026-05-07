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

import { hashCanonicalStateValue } from "./canonical-state.js";
import { createActiveState, must, p1, p2 } from "./action-test-fixtures.js";
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

test("mustRemainInSameZone accepts matching live source instance, card, player, and zone data", () => {
  const state = createActiveState();
  const source = p1Leader(state);
  const entry = queueEntry(source, {
    source: sourceRef(source, p1),
    sourceSnapshot: sourceSnapshot(source, p1),
    sourcePresencePolicy: "mustRemainInSameZone",
  });

  assert.deepEqual(evaluateQueuedEffectSourcePresence(state, entry), {
    ok: true,
    policy: "mustRemainInSameZone",
    sourcePresence: "present",
    sourceBasis: "liveZone",
  });
});

test("mustRemainInSameZone rejects missing live source for current queue-entry source data", () => {
  const state = createActiveState();
  const source = p1Leader(state);
  const entry = queueEntry(source, {
    source: {
      ...sourceRef(source, p1),
      instanceId: toInstanceId("missing-live-source"),
    },
    sourceSnapshot: {
      ...sourceSnapshot(source, p1),
      instanceId: toInstanceId("missing-live-source"),
    },
    sourcePresencePolicy: "mustRemainInSameZone",
  });

  assert.deepEqual(evaluateQueuedEffectSourcePresence(state, entry), {
    ok: false,
    policy: "mustRemainInSameZone",
    sourcePresence: "failClosed",
    reason: "liveSourceNotFound",
  });
});

test("mustRemainInSameZone rejects mismatched live source identity data", () => {
  const state = createActiveState();
  const source = p1Leader(state);
  const entry = queueEntry(source, {
    sourcePresencePolicy: "mustRemainInSameZone",
  });
  const player = must(state.players[p1], "p1");
  state.players[p1] = {
    ...player,
    leader: {
      ...source,
      controller: toPlayerId("other-controller"),
    },
  };

  assert.deepEqual(evaluateQueuedEffectSourcePresence(state, entry), {
    ok: false,
    policy: "mustRemainInSameZone",
    sourcePresence: "failClosed",
    reason: "liveSourceIdentityMismatch",
  });
});

test("mustRemainInSameZone represents current same-zone trigger source expectations", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const playedSource: CardInstance = {
    ...must(p1State.hand[0], "played source"),
    zone: {
      zone: "characterArea",
      playerId: p1,
      slot: "character",
      index: 0,
    },
  };
  const whenAttackingSource = p1State.leader;
  const opponentAttackSource = p2State.leader;
  const sourceCases: Array<{
    effectBlockId: EffectId;
    playerId: PlayerId;
    source: CardInstance;
  }> = [
    {
      effectBlockId: toEffectId("fixture-on-play"),
      playerId: p1,
      source: playedSource,
    },
    {
      effectBlockId: toEffectId("fixture-when-attacking"),
      playerId: p1,
      source: whenAttackingSource,
    },
    {
      effectBlockId: toEffectId("fixture-on-opponent-attack"),
      playerId: p2,
      source: opponentAttackSource,
    },
  ];
  const sameZoneState: GameState = {
    ...state,
    players: {
      ...state.players,
      [p1]: {
        ...p1State,
        characters: [playedSource],
        hand: p1State.hand.slice(1).map((card, index) => ({
          ...card,
          zone: { zone: "hand", playerId: p1, slot: "hand", index },
        })),
      },
    },
  };

  for (const { effectBlockId, playerId, source } of sourceCases) {
    assert.deepEqual(
      evaluateQueuedEffectSourcePresence(
        sameZoneState,
        queueEntry(source, {
          effectBlockId,
          controllerId: playerId,
          source: sourceRef(source, playerId),
          sourceSnapshot: sourceSnapshot(source, playerId),
          sourcePresencePolicy: "mustRemainInSameZone",
        }),
      ),
      {
        ok: true,
        policy: "mustRemainInSameZone",
        sourcePresence: "present",
        sourceBasis: "liveZone",
      },
      effectBlockId,
    );
  }
});

test("mustRemainInSameZone accepted checks are deterministic and leave fixture state hash stable", () => {
  const state = createActiveState();
  const source = p1Leader(state);
  const entry = queueEntry(source, {
    sourcePresencePolicy: "mustRemainInSameZone",
  });
  const beforeHash = hashCanonicalStateValue(state);

  const first = evaluateQueuedEffectSourcePresence(state, entry);
  const second = evaluateQueuedEffectSourcePresence(state, entry);
  const afterHash = hashCanonicalStateValue(state);

  assert.deepEqual(first, second);
  assert.equal(afterHash, beforeHash);
  assert.deepEqual(first, {
    ok: true,
    policy: "mustRemainInSameZone",
    sourcePresence: "present",
    sourceBasis: "liveZone",
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
