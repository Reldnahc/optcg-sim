import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardId,
  CardRef,
  CardSnapshot,
  EffectId,
  EffectQueueEntry,
  InstanceId,
  PlayerId,
  QueueEntryId,
  StateSeq,
  TimingWindowId,
} from "@optcg/types";

import {
  findEarliestChoiceRequiredEffectQueueGroup,
  groupValidatedEffectQueueEntries,
  orderNoChoiceEffectQueueGroups,
  validateEffectQueueOrderingInput,
} from "../effect-queue-ordering.js";

const toCardId = (value: string): CardId => value as CardId;
const toEffectId = (value: string): EffectId => value as EffectId;
const toInstanceId = (value: string): InstanceId => value as InstanceId;
const toPlayerId = (value: string): PlayerId => value as PlayerId;
const toQueueEntryId = (value: string): QueueEntryId => value as QueueEntryId;
const toStateSeq = (value: number): StateSeq => value as StateSeq;
const toTimingWindowId = (value: string): TimingWindowId =>
  value as TimingWindowId;

const p1 = toPlayerId("p1");
const p2 = toPlayerId("p2");
const p3 = toPlayerId("p3");

const cardRef = (
  instanceId: InstanceId,
  cardId: CardId,
  playerId: PlayerId,
): CardRef => ({
  instanceId,
  cardId,
  playerId,
  zone: { zone: "characterArea", playerId, slot: "character", index: 0 },
});

const cardSnapshot = (
  instanceId: InstanceId,
  cardId: CardId,
  playerId: PlayerId,
): CardSnapshot => ({
  instanceId,
  cardId,
  ownerId: playerId,
  controllerId: playerId,
  zone: { zone: "characterArea", playerId, slot: "character", index: 0 },
  category: "character",
  colors: ["red"],
  keywords: [],
});

const queueEntry = (
  id: string,
  timingWindowId: string,
  overrides: Partial<EffectQueueEntry> = {},
): EffectQueueEntry => {
  const entryId = toQueueEntryId(id);
  const windowId = toTimingWindowId(timingWindowId);
  const playerId = overrides.controllerId ?? p1;
  const instanceId = toInstanceId(`${id}-instance`);
  const cardId = toCardId(`${id}-card`);

  return {
    id: entryId,
    state: "pending",
    timingWindowId: windowId,
    generation: 0,
    controllerId: playerId,
    source: cardRef(instanceId, cardId, playerId),
    sourceSnapshot: cardSnapshot(instanceId, cardId, playerId),
    effectBlockId: toEffectId(`${id}-effect`),
    orderingGroup: "turnPlayer",
    createdAtEventSeq: 0,
    queuedAtStateSeq: toStateSeq(0),
    sourcePresencePolicy: "noSourceRequired",
    causedBy: { type: "ruleProcess", name: "test" },
    ...overrides,
  };
};

test("rejects non-pending queue entries deterministically", () => {
  for (const state of ["resolving", "resolved", "cancelled"] as const) {
    const result = validateEffectQueueOrderingInput(
      [queueEntry(`q-${state}`, "w1", { state })],
      [{ timingWindowId: toTimingWindowId("w1"), rank: 0 }],
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, "nonPendingEntry");
  }
});

test("normalizes valid caller-supplied timing-window ranks without sorting queue entries", () => {
  const first = queueEntry("q1", "younger-window");
  const second = queueEntry("q2", "older-window", { controllerId: p2 });
  const input = [first, second] as const;

  const result = validateEffectQueueOrderingInput(input, [
    { timingWindowId: toTimingWindowId("older-window"), rank: 0 },
    { timingWindowId: toTimingWindowId("younger-window"), rank: 1 },
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.entries, input);
  assert.equal(
    result.timingWindowRanks.get(toTimingWindowId("older-window")),
    0,
  );
  assert.equal(
    result.timingWindowRanks.get(toTimingWindowId("younger-window")),
    1,
  );
});

test("missing timing-window rank data fails closed without using ids or input order", () => {
  const result = validateEffectQueueOrderingInput(
    [queueEntry("q1", "a-window"), queueEntry("q2", "b-window")],
    [{ timingWindowId: toTimingWindowId("b-window"), rank: 0 }],
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "missingTimingWindowRank");
  assert.equal(result.timingWindowId, toTimingWindowId("a-window"));
});

test("invalid timing-window rank data fails closed deterministically", () => {
  const entries = [
    queueEntry("q1", "w1"),
    queueEntry("q2", "w2"),
    queueEntry("q3", "w3"),
  ];
  const cases = [
    {
      ranks: [
        { timingWindowId: toTimingWindowId("w1"), rank: 0 },
        { timingWindowId: toTimingWindowId("w1"), rank: 0 },
        { timingWindowId: toTimingWindowId("w2"), rank: 1 },
        { timingWindowId: toTimingWindowId("w3"), rank: 2 },
      ],
      reason: "duplicateTimingWindowRank",
    },
    {
      ranks: [
        { timingWindowId: toTimingWindowId("w1"), rank: 0 },
        { timingWindowId: toTimingWindowId("w1"), rank: 1 },
        { timingWindowId: toTimingWindowId("w2"), rank: 1 },
        { timingWindowId: toTimingWindowId("w3"), rank: 2 },
      ],
      reason: "conflictingTimingWindowRank",
    },
    {
      ranks: [
        { timingWindowId: toTimingWindowId("w1"), rank: 0 },
        { timingWindowId: toTimingWindowId("w2"), rank: 0 },
        { timingWindowId: toTimingWindowId("w3"), rank: 2 },
      ],
      reason: "duplicateRank",
    },
    {
      ranks: [
        { timingWindowId: toTimingWindowId("w1"), rank: 0.5 },
        { timingWindowId: toTimingWindowId("w2"), rank: 1 },
        { timingWindowId: toTimingWindowId("w3"), rank: 2 },
      ],
      reason: "invalidRank",
    },
    {
      ranks: [
        { timingWindowId: toTimingWindowId("w1"), rank: -1 },
        { timingWindowId: toTimingWindowId("w2"), rank: 1 },
        { timingWindowId: toTimingWindowId("w3"), rank: 2 },
      ],
      reason: "invalidRank",
    },
    {
      ranks: [
        { timingWindowId: toTimingWindowId("w1"), rank: 0 },
        { timingWindowId: toTimingWindowId("w2"), rank: 1 },
        { timingWindowId: toTimingWindowId("w3"), rank: 3 },
      ],
      reason: "nonContiguousRanks",
    },
    {
      ranks: [
        { timingWindowId: toTimingWindowId("w1"), rank: 0 },
        { timingWindowId: toTimingWindowId("w2"), rank: 1 },
        { timingWindowId: toTimingWindowId("w3"), rank: 2 },
        { timingWindowId: toTimingWindowId("extra"), rank: 3 },
      ],
      reason: "extraTimingWindowRank",
    },
  ] as const;

  for (const testCase of cases) {
    const result = validateEffectQueueOrderingInput(entries, testCase.ranks);

    assert.equal(result.ok, false);
    assert.equal(result.reason, testCase.reason);
  }
});

test("valid timing-window rank normalization is deterministic", () => {
  const entries = [queueEntry("q1", "w2"), queueEntry("q2", "w1")];
  const ranks = [
    { timingWindowId: toTimingWindowId("w1"), rank: 0 },
    { timingWindowId: toTimingWindowId("w2"), rank: 1 },
  ];

  const first = validateEffectQueueOrderingInput(entries, ranks);
  const second = validateEffectQueueOrderingInput(entries, ranks);

  assert.deepEqual(first, second);
});

test("validation does not mutate or reorder input queue entries", () => {
  const entries = [queueEntry("q1", "w2"), queueEntry("q2", "w1")];
  const before = JSON.stringify(entries);

  validateEffectQueueOrderingInput(entries, [
    { timingWindowId: toTimingWindowId("w1"), rank: 0 },
    { timingWindowId: toTimingWindowId("w2"), rank: 1 },
  ]);

  assert.equal(JSON.stringify(entries), before);
  assert.deepEqual(
    entries.map((entry) => entry.id),
    [toQueueEntryId("q1"), toQueueEntryId("q2")],
  );
});

test("groups validated entries by timing window, generation, bucket, and controller", () => {
  const entries = [
    queueEntry("q1", "w1", {
      generation: 0,
      orderingGroup: "turnPlayer",
      controllerId: p1,
    }),
    queueEntry("q2", "w1", {
      generation: 1,
      orderingGroup: "turnPlayer",
      controllerId: p1,
    }),
    queueEntry("q3", "w1", {
      generation: 0,
      orderingGroup: "nonTurnPlayer",
      controllerId: p2,
    }),
    queueEntry("q4", "w2", {
      generation: 0,
      orderingGroup: "turnPlayer",
      controllerId: p1,
    }),
  ];
  const validated = validateEffectQueueOrderingInput(entries, [
    { timingWindowId: toTimingWindowId("w1"), rank: 0 },
    { timingWindowId: toTimingWindowId("w2"), rank: 1 },
  ]);
  assert.equal(validated.ok, true);

  const groups = groupValidatedEffectQueueEntries(validated);

  assert.deepEqual(
    groups.map((group) => ({
      controllerId: group.controllerId,
      generation: group.generation,
      orderingGroup: group.orderingGroup,
      timingWindowId: group.timingWindowId,
      timingWindowRank: group.timingWindowRank,
    })),
    [
      {
        controllerId: p1,
        generation: 0,
        orderingGroup: "turnPlayer",
        timingWindowId: toTimingWindowId("w1"),
        timingWindowRank: 0,
      },
      {
        controllerId: p2,
        generation: 0,
        orderingGroup: "nonTurnPlayer",
        timingWindowId: toTimingWindowId("w1"),
        timingWindowRank: 0,
      },
      {
        controllerId: p1,
        generation: 1,
        orderingGroup: "turnPlayer",
        timingWindowId: toTimingWindowId("w1"),
        timingWindowRank: 0,
      },
      {
        controllerId: p1,
        generation: 0,
        orderingGroup: "turnPlayer",
        timingWindowId: toTimingWindowId("w2"),
        timingWindowRank: 1,
      },
    ],
  );
});

test("reports chooseTriggerOrder-required buckets for one player's multiple pending effects", () => {
  const entries = [
    queueEntry("q1", "w1", { controllerId: p1 }),
    queueEntry("q2", "w1", { controllerId: p1 }),
    queueEntry("q3", "w1", {
      controllerId: p2,
      orderingGroup: "nonTurnPlayer",
    }),
  ];
  const validated = validateEffectQueueOrderingInput(entries, [
    { timingWindowId: toTimingWindowId("w1"), rank: 0 },
  ]);
  assert.equal(validated.ok, true);

  const groups = groupValidatedEffectQueueEntries(validated);
  const p1Group = groups.find((group) => group.controllerId === p1);
  const p2Group = groups.find((group) => group.controllerId === p2);
  assert.ok(p1Group !== undefined);
  assert.ok(p2Group !== undefined);

  assert.equal(p1Group.requiresChooseTriggerOrder, true);
  assert.equal(p1Group.choicePlayerId, p1);
  assert.deepEqual(
    p1Group.entries.map((entry) => entry.id),
    [toQueueEntryId("q1"), toQueueEntryId("q2")],
  );
  assert.equal(p2Group.requiresChooseTriggerOrder, false);
  assert.equal(p2Group.choicePlayerId, undefined);
});

test("identifies single-entry groups as no-choice buckets", () => {
  const validated = validateEffectQueueOrderingInput(
    [queueEntry("q1", "w1")],
    [{ timingWindowId: toTimingWindowId("w1"), rank: 0 }],
  );
  assert.equal(validated.ok, true);

  const [group] = groupValidatedEffectQueueEntries(validated);
  assert.ok(group !== undefined);

  assert.equal(group.requiresChooseTriggerOrder, false);
  assert.equal(group.choicePlayerId, undefined);
});

test("finds earliest choice-required group by timing window then generation", () => {
  const entries = [
    queueEntry("younger-window-1", "w2", { controllerId: p1 }),
    queueEntry("younger-window-2", "w2", { controllerId: p1 }),
    queueEntry("older-window-lower-generation-1", "w1", {
      controllerId: p3,
      generation: 0,
    }),
    queueEntry("older-window-lower-generation-2", "w1", {
      controllerId: p3,
      generation: 0,
    }),
    queueEntry("older-window-1", "w1", {
      controllerId: p2,
      generation: 1,
    }),
    queueEntry("older-window-2", "w1", {
      controllerId: p2,
      generation: 1,
    }),
  ];
  const validated = validateEffectQueueOrderingInput(entries, [
    { timingWindowId: toTimingWindowId("w1"), rank: 0 },
    { timingWindowId: toTimingWindowId("w2"), rank: 1 },
  ]);
  assert.equal(validated.ok, true);

  const earliest = findEarliestChoiceRequiredEffectQueueGroup(
    groupValidatedEffectQueueEntries(validated),
  );

  assert.ok(earliest !== undefined);
  assert.equal(earliest.timingWindowId, toTimingWindowId("w1"));
  assert.equal(earliest.generation, 0);
  assert.equal(earliest.controllerId, p3);
  assert.equal(earliest.orderingGroup, "turnPlayer");
});

test("prefers turn-player choice-required group before non-turn-player group", () => {
  const entries = [
    queueEntry("non-turn-1", "w1", {
      controllerId: p2,
      orderingGroup: "nonTurnPlayer",
    }),
    queueEntry("non-turn-2", "w1", {
      controllerId: p2,
      orderingGroup: "nonTurnPlayer",
    }),
    queueEntry("turn-1", "w1", {
      controllerId: p1,
      orderingGroup: "turnPlayer",
    }),
    queueEntry("turn-2", "w1", {
      controllerId: p1,
      orderingGroup: "turnPlayer",
    }),
  ];
  const validated = validateEffectQueueOrderingInput(entries, [
    { timingWindowId: toTimingWindowId("w1"), rank: 0 },
  ]);
  assert.equal(validated.ok, true);

  const earliest = findEarliestChoiceRequiredEffectQueueGroup(
    groupValidatedEffectQueueEntries(validated),
  );

  assert.ok(earliest !== undefined);
  assert.equal(earliest.controllerId, p1);
  assert.equal(earliest.orderingGroup, "turnPlayer");
});

test("returns undefined when every group is single-entry", () => {
  const entries = [
    queueEntry("q1", "w1", { controllerId: p1, orderingGroup: "turnPlayer" }),
    queueEntry("q2", "w1", {
      controllerId: p2,
      orderingGroup: "nonTurnPlayer",
    }),
    queueEntry("q3", "w2", { controllerId: p3, orderingGroup: "turnPlayer" }),
  ];
  const validated = validateEffectQueueOrderingInput(entries, [
    { timingWindowId: toTimingWindowId("w1"), rank: 0 },
    { timingWindowId: toTimingWindowId("w2"), rank: 1 },
  ]);
  assert.equal(validated.ok, true);

  const earliest = findEarliestChoiceRequiredEffectQueueGroup(
    groupValidatedEffectQueueEntries(validated),
  );

  assert.equal(earliest, undefined);
});

test("choice-required group detection does not mutate queue groups", () => {
  const entries = [
    queueEntry("q1", "w2", { controllerId: p1 }),
    queueEntry("q2", "w2", { controllerId: p1 }),
    queueEntry("q3", "w1", { controllerId: p2 }),
    queueEntry("q4", "w1", { controllerId: p2 }),
  ];
  const validated = validateEffectQueueOrderingInput(entries, [
    { timingWindowId: toTimingWindowId("w1"), rank: 0 },
    { timingWindowId: toTimingWindowId("w2"), rank: 1 },
  ]);
  assert.equal(validated.ok, true);
  const groups = groupValidatedEffectQueueEntries(validated);
  const before = JSON.stringify(groups);

  findEarliestChoiceRequiredEffectQueueGroup(groups);

  assert.equal(JSON.stringify(groups), before);
});

test("grouping is deterministic for identical validated inputs", () => {
  const entries = [
    queueEntry("q1", "w2"),
    queueEntry("q2", "w1"),
    queueEntry("q3", "w1", {
      controllerId: p2,
      orderingGroup: "nonTurnPlayer",
    }),
  ];
  const ranks = [
    { timingWindowId: toTimingWindowId("w1"), rank: 0 },
    { timingWindowId: toTimingWindowId("w2"), rank: 1 },
  ];
  const firstValidated = validateEffectQueueOrderingInput(entries, ranks);
  const secondValidated = validateEffectQueueOrderingInput(entries, ranks);
  assert.equal(firstValidated.ok, true);
  assert.equal(secondValidated.ok, true);

  assert.deepEqual(
    groupValidatedEffectQueueEntries(firstValidated),
    groupValidatedEffectQueueEntries(secondValidated),
  );
});

test("grouping does not mutate or reorder input queue entries", () => {
  const entries = [queueEntry("q1", "w2"), queueEntry("q2", "w1")];
  const before = JSON.stringify(entries);
  const validated = validateEffectQueueOrderingInput(entries, [
    { timingWindowId: toTimingWindowId("w1"), rank: 0 },
    { timingWindowId: toTimingWindowId("w2"), rank: 1 },
  ]);
  assert.equal(validated.ok, true);

  groupValidatedEffectQueueEntries(validated);

  assert.equal(JSON.stringify(entries), before);
  assert.deepEqual(
    entries.map((entry) => entry.id),
    [toQueueEntryId("q1"), toQueueEntryId("q2")],
  );
});

test("orders no-choice groups by timing-window rank", () => {
  const older = queueEntry("older", "older-window");
  const younger = queueEntry("younger", "younger-window", {
    controllerId: p2,
    orderingGroup: "nonTurnPlayer",
  });
  const validated = validateEffectQueueOrderingInput(
    [younger, older],
    [
      { timingWindowId: toTimingWindowId("older-window"), rank: 0 },
      { timingWindowId: toTimingWindowId("younger-window"), rank: 1 },
    ],
  );
  assert.equal(validated.ok, true);

  const ordered = orderNoChoiceEffectQueueGroups(
    groupValidatedEffectQueueEntries(validated),
  );

  assert.equal(ordered.ok, true);
  assert.deepEqual(
    ordered.entries.map((entry) => entry.id),
    [toQueueEntryId("older"), toQueueEntryId("younger")],
  );
});

test("orders no-choice groups by generation within a timing window", () => {
  const laterGeneration = queueEntry("later-generation", "w1", {
    generation: 1,
  });
  const earlierGeneration = queueEntry("earlier-generation", "w1", {
    generation: 0,
    controllerId: p2,
    orderingGroup: "nonTurnPlayer",
  });
  const validated = validateEffectQueueOrderingInput(
    [laterGeneration, earlierGeneration],
    [{ timingWindowId: toTimingWindowId("w1"), rank: 0 }],
  );
  assert.equal(validated.ok, true);

  const ordered = orderNoChoiceEffectQueueGroups(
    groupValidatedEffectQueueEntries(validated),
  );

  assert.equal(ordered.ok, true);
  assert.deepEqual(
    ordered.entries.map((entry) => entry.id),
    [toQueueEntryId("earlier-generation"), toQueueEntryId("later-generation")],
  );
});

test("orders no-choice groups turn-player bucket before non-turn-player bucket", () => {
  const nonTurnPlayer = queueEntry("non-turn-player", "w1", {
    orderingGroup: "nonTurnPlayer",
    controllerId: p2,
  });
  const turnPlayer = queueEntry("turn-player", "w1", {
    orderingGroup: "turnPlayer",
    controllerId: p1,
  });
  const validated = validateEffectQueueOrderingInput(
    [nonTurnPlayer, turnPlayer],
    [{ timingWindowId: toTimingWindowId("w1"), rank: 0 }],
  );
  assert.equal(validated.ok, true);

  const ordered = orderNoChoiceEffectQueueGroups(
    groupValidatedEffectQueueEntries(validated),
  );

  assert.equal(ordered.ok, true);
  assert.deepEqual(
    ordered.entries.map((entry) => entry.id),
    [toQueueEntryId("turn-player"), toQueueEntryId("non-turn-player")],
  );
});

test("orders no-choice entries by created event sequence, source instance id, then effect id", () => {
  const byEffectId = queueEntry("by-effect-id", "w1", {
    controllerId: p1,
    createdAtEventSeq: 5,
    effectBlockId: toEffectId("b-effect"),
    source: cardRef(toInstanceId("source-2"), toCardId("card-2"), p1),
  });
  const byCreatedSeq = queueEntry("by-created-seq", "w1", {
    controllerId: p2,
    createdAtEventSeq: 4,
    effectBlockId: toEffectId("z-effect"),
    source: cardRef(toInstanceId("source-9"), toCardId("card-9"), p2),
  });
  const bySourceInstance = queueEntry("by-source-instance", "w1", {
    controllerId: p3,
    createdAtEventSeq: 5,
    effectBlockId: toEffectId("a-effect"),
    source: cardRef(toInstanceId("source-1"), toCardId("card-1"), p3),
  });
  const validated = validateEffectQueueOrderingInput(
    [byEffectId, byCreatedSeq, bySourceInstance],
    [{ timingWindowId: toTimingWindowId("w1"), rank: 0 }],
  );
  assert.equal(validated.ok, true);

  const ordered = orderNoChoiceEffectQueueGroups(
    groupValidatedEffectQueueEntries(validated),
  );

  assert.equal(ordered.ok, true);
  assert.deepEqual(
    ordered.entries.map((entry) => entry.id),
    [
      toQueueEntryId("by-created-seq"),
      toQueueEntryId("by-source-instance"),
      toQueueEntryId("by-effect-id"),
    ],
  );
});

test("fails closed instead of ordering choice-required groups", () => {
  const validated = validateEffectQueueOrderingInput(
    [queueEntry("q1", "w1"), queueEntry("q2", "w1")],
    [{ timingWindowId: toTimingWindowId("w1"), rank: 0 }],
  );
  assert.equal(validated.ok, true);

  const ordered = orderNoChoiceEffectQueueGroups(
    groupValidatedEffectQueueEntries(validated),
  );

  assert.equal(ordered.ok, false);
  assert.equal(ordered.reason, "choiceRequired");
  assert.equal(ordered.controllerId, p1);
});

test("no-choice ordering does not mutate queue entries or groups", () => {
  const entries = [queueEntry("q1", "w2"), queueEntry("q2", "w1")];
  const validated = validateEffectQueueOrderingInput(entries, [
    { timingWindowId: toTimingWindowId("w1"), rank: 0 },
    { timingWindowId: toTimingWindowId("w2"), rank: 1 },
  ]);
  assert.equal(validated.ok, true);
  const groups = groupValidatedEffectQueueEntries(validated);
  const entriesBefore = JSON.stringify(entries);
  const groupsBefore = JSON.stringify(groups);

  orderNoChoiceEffectQueueGroups(groups);

  assert.equal(JSON.stringify(entries), entriesBefore);
  assert.equal(JSON.stringify(groups), groupsBefore);
});
