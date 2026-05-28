import assert from "node:assert/strict";
import { test } from "vitest";
import type { Condition, PlayerId } from "@optcg/types";

import {
  createActiveState,
  filterStateForPlayer,
  hashCanonicalStateValue,
  must,
  p1,
  p2,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  setupOnPlayDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
} from "./effect-runtime-queue-processing-test-support.js";
import { evaluateQueuedEffectCondition } from "./effect-runtime-conditions.js";

const setTrashCount = (
  state: ReturnType<typeof createActiveState>,
  playerId: PlayerId,
  count: number,
): void => {
  const player = must(state.players[playerId], "player");
  while (player.trash.length < count) {
    const nextCard = must(
      player.hand.shift() ?? player.donDeck.shift() ?? player.deck.pop(),
      "trash source card",
    );
    const trashCard = {
      ...nextCard,
      zone: {
        zone: "trash" as const,
        playerId,
        slot: "trash" as const,
        index: player.trash.length,
      },
    };
    player.trash.push(trashCard);
  }
};

const addTrashCard = (
  state: ReturnType<typeof createActiveState>,
  playerId: PlayerId,
  category: "character" | "event",
  index: number,
): void => {
  const player = must(state.players[playerId], "player");
  const source = must(player.deck.pop() ?? player.hand.shift(), "trash source");
  const cardId =
    `${String(playerId)}-${category}-${String(index)}` as typeof source.cardId;
  state.cardManifest.cards[cardId] = resolvedCard({ cardId, category });
  player.trash.push({
    ...source,
    cardId,
    zone: {
      zone: "trash",
      playerId,
      slot: "trash",
      index: player.trash.length,
    },
  });
};

const evaluateTrashCount = (
  condition: Extract<Condition, { type: "trashCount" }>,
  counts: { self: number; opponent?: number },
) => {
  const state = createActiveState();
  setTrashCount(state, p1, counts.self);
  setTrashCount(state, p2, counts.opponent ?? 0);
  return evaluateQueuedEffectCondition(state, queueDrawForP1(), condition);
};

const setupQueuedDrawWithCondition = (
  state: ReturnType<typeof createActiveState>,
  condition: Condition,
  effectIdSuffix: string,
): void => {
  const source = must(state.players[p1], "p1").leader;
  const leaderCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, leaderCard.support);
  const effect = must(base.effects[0], "effect");
  const effectBlockId = toEffectId(effectIdSuffix);
  setupOnPlayDefinition(
    state,
    source,
    {
      ...base,
      effects: [
        {
          ...effect,
          id: effectBlockId,
          condition,
        },
      ],
    },
    `def-${effectIdSuffix}`,
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId(`queue-entry-${effectIdSuffix}`),
      effectBlockId,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      sourcePresencePolicy: "mustRemainInSameZone",
    },
  ];
};

test("self trashCount gte 7 evaluates below, at, and above threshold", () => {
  const condition = {
    type: "trashCount",
    player: "self",
    op: "gte",
    value: 7,
  } satisfies Extract<Condition, { type: "trashCount" }>;

  assert.deepEqual(evaluateTrashCount(condition, { self: 6 }), {
    supported: true,
    passed: false,
  });
  assert.deepEqual(evaluateTrashCount(condition, { self: 7 }), {
    supported: true,
    passed: true,
  });
  assert.deepEqual(evaluateTrashCount(condition, { self: 8 }), {
    supported: true,
    passed: true,
  });
});

test("opponent trashCount gte threshold evaluates below, at, and above threshold", () => {
  const condition = {
    type: "trashCount",
    player: "opponent",
    op: "gte",
    value: 3,
  } satisfies Extract<Condition, { type: "trashCount" }>;

  assert.deepEqual(evaluateTrashCount(condition, { self: 0, opponent: 2 }), {
    supported: true,
    passed: false,
  });
  assert.deepEqual(evaluateTrashCount(condition, { self: 0, opponent: 3 }), {
    supported: true,
    passed: true,
  });
  assert.deepEqual(evaluateTrashCount(condition, { self: 0, opponent: 4 }), {
    supported: true,
    passed: true,
  });
});

test("trashCount supports reusable category filters for Events", () => {
  const state = createActiveState();
  addTrashCard(state, p1, "event", 0);
  addTrashCard(state, p1, "event", 1);
  addTrashCard(state, p1, "event", 2);
  addTrashCard(state, p1, "event", 3);
  addTrashCard(state, p1, "character", 4);

  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "trashCount",
      player: "self",
      filter: { categories: ["event"] },
      op: "gte",
      value: 4,
    }),
    { supported: true, passed: true },
  );
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "trashCount",
      player: "self",
      filter: { categories: ["event"] },
      op: "gte",
      value: 5,
    }),
    { supported: true, passed: false },
  );
});

test("trashCount supports lte and exact equality comparator semantics", () => {
  assert.deepEqual(
    evaluateTrashCount(
      { type: "trashCount", player: "self", op: "lte", value: 2 },
      { self: 2 },
    ),
    { supported: true, passed: true },
  );
  assert.deepEqual(
    evaluateTrashCount(
      { type: "trashCount", player: "self", op: "lte", value: 2 },
      { self: 3 },
    ),
    { supported: true, passed: false },
  );
  assert.deepEqual(
    evaluateTrashCount(
      { type: "trashCount", player: "self", op: "eq", value: 4 },
      { self: 4 },
    ),
    { supported: true, passed: true },
  );
  assert.deepEqual(
    evaluateTrashCount(
      { type: "trashCount", player: "self", op: "eq", value: 4 },
      { self: 5 },
    ),
    { supported: true, passed: false },
  );
});

test("false trashCount condition skips queued effect body cleanly", () => {
  const state = createActiveState();
  setTrashCount(state, p1, 6);
  setupQueuedDrawWithCondition(
    state,
    { type: "trashCount", player: "self", op: "gte", value: 7 },
    "trash-count-false",
  );
  const beforeP1 = structuredClone(must(state.players[p1], "p1"));

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.deepEqual(result.events, []);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(
    must(result.state.players[p1], "p1").deck.length,
    beforeP1.deck.length,
  );
  assert.equal(
    must(result.state.players[p1], "p1").hand.length,
    beforeP1.hand.length,
  );
});

test("true, false, and unsupported trashCount paths keep deterministic event order and state hashes", () => {
  const runTrue = () => {
    const state = createActiveState();
    setTrashCount(state, p1, 7);
    setupQueuedDrawWithCondition(
      state,
      { type: "trashCount", player: "self", op: "gte", value: 7 },
      "trash-count-true-deterministic",
    );
    return processEffectRuntime(state);
  };
  const runFalse = () => {
    const state = createActiveState();
    setTrashCount(state, p1, 6);
    setupQueuedDrawWithCondition(
      state,
      { type: "trashCount", player: "self", op: "gte", value: 7 },
      "trash-count-false-deterministic",
    );
    return processEffectRuntime(state);
  };
  const runUnsupported = () => {
    const state = createActiveState();
    setTrashCount(state, p1, 7);
    setupQueuedDrawWithCondition(
      state,
      {
        type: "trashCount",
        player: "self",
        op: "gte",
        value: 7,
        filter: { categories: ["don"] },
      },
      "trash-count-unsupported-deterministic",
    );
    return processEffectRuntime(state);
  };

  const firstTrue = runTrue();
  const secondTrue = runTrue();
  assert.equal(firstTrue.errors, undefined);
  assert.deepEqual(firstTrue.events.map((event) => event.type).slice(0, 4), [
    "cardDrawn",
    "cardMoved",
    "cardMoved",
    "effectResolved",
  ]);
  assert.deepEqual(
    firstTrue.events.map((event) => event.seq),
    secondTrue.events.map((event) => event.seq),
  );
  assert.equal(firstTrue.stateHash, hashCanonicalStateValue(firstTrue.state));
  assert.equal(firstTrue.stateHash, secondTrue.stateHash);

  const firstFalse = runFalse();
  const secondFalse = runFalse();
  assert.equal(firstFalse.errors, undefined);
  assert.deepEqual(firstFalse.events, []);
  assert.equal(firstFalse.stateHash, hashCanonicalStateValue(firstFalse.state));
  assert.equal(firstFalse.stateHash, secondFalse.stateHash);

  const firstUnsupported = runUnsupported();
  const secondUnsupported = runUnsupported();
  assert.equal(
    must(firstUnsupported.errors, "unsupported errors")[0]?.type,
    "effectRuntimeError",
  );
  assert.deepEqual(firstUnsupported.events, []);
  assert.equal(
    firstUnsupported.stateHash,
    hashCanonicalStateValue(firstUnsupported.state),
  );
  assert.equal(firstUnsupported.stateHash, secondUnsupported.stateHash);
});

test("unsupported trashCount shapes and condition families fail closed without mutation or leakage", () => {
  const state = createActiveState();
  setTrashCount(state, p1, 7);
  const entry = queueDrawForP1();
  const beforeHash = hashCanonicalStateValue(state);
  const unsupportedConditions = [
    {
      type: "trashCount",
      player: "self",
      op: "gte",
      value: Number.MAX_SAFE_INTEGER + 1,
    },
    { type: "trashCount", player: "owner", op: "gte", value: 7 },
    { type: "trashCount", player: "notAPlayerRef", op: "gte", value: 7 },
    { type: "trashCount", player: "self", op: "between", value: 7 },
    {
      type: "trashCount",
      player: "self",
      op: "gte",
      value: 7,
      filter: { categories: ["don"] },
    },
    {
      type: "hasCardInZone",
      zone: "hand",
      player: "opponent",
      filter: { categories: ["event"] },
    },
    { type: "custom", check: "private-trash-count" },
    { type: "fieldCount", player: "self", op: "gte", value: 1 },
  ] as unknown as Condition[];

  for (const condition of unsupportedConditions) {
    assert.deepEqual(evaluateQueuedEffectCondition(state, entry, condition), {
      supported: false,
    });
  }
  assert.equal(hashCanonicalStateValue(state), beforeHash);
  const view = filterStateForPlayer(state, p1);
  assert.equal(JSON.stringify(view).includes("private-trash-count"), false);
});
