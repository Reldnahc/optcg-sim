import assert from "node:assert/strict";
import { test } from "vitest";
import type { CardInstance, Condition, PlayerId } from "@optcg/types";

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
  withCardInZone,
} from "./effect-runtime-queue-processing-test-support.js";
import { evaluateQueuedEffectCondition } from "./effect-runtime-conditions.js";

const removeFirstDonFromDeck = (
  state: ReturnType<typeof createActiveState>,
  playerId: PlayerId,
): CardInstance => {
  const player = must(state.players[playerId], "player");
  const next = must(player.donDeck.shift(), "don deck card");
  return { ...next, owner: playerId, controller: playerId };
};

const setDonFieldState = (
  state: ReturnType<typeof createActiveState>,
  playerId: PlayerId,
  counts: { costArea: number; attached: number; trash?: number },
): void => {
  const player = must(state.players[playerId], "player");
  player.costArea = [];
  player.leader = { ...player.leader, attachedDon: [] };
  player.characters = [];

  for (let index = 0; index < counts.costArea; index += 1) {
    const don = removeFirstDonFromDeck(state, playerId);
    player.costArea.push({
      ...don,
      zone: { zone: "costArea", playerId, slot: "cost", index },
      state: "active",
    });
  }

  if (counts.attached > 0) {
    const host = withCardInZone({
      state,
      playerId,
      card: must(player.hand[0], "attached host"),
      zone: "characterArea",
      index: 0,
    });
    const attachedIds: CardInstance["instanceId"][] = [];
    for (let offset = 0; offset < counts.attached; offset += 1) {
      const don = removeFirstDonFromDeck(state, playerId);
      const donCard: CardInstance = {
        ...don,
        zone: {
          zone: "costArea",
          playerId,
          slot: "cost",
          index: player.costArea.length,
        },
      };
      player.costArea.push(donCard);
      attachedIds.push(donCard.instanceId);
    }
    player.characters[0] = {
      ...host,
      attachedDon: attachedIds,
    };
  }

  const trashCount = counts.trash ?? 0;
  for (let index = 0; index < trashCount; index += 1) {
    const don = removeFirstDonFromDeck(state, playerId);
    player.trash.push({
      ...don,
      zone: {
        zone: "trash",
        playerId,
        slot: "trash",
        index: player.trash.length,
      },
    });
  }
};

const donFieldFilter = {
  categories: ["don"],
} satisfies NonNullable<Extract<Condition, { type: "fieldCount" }>["filter"]>;

const evaluateFieldCount = (
  condition: Extract<Condition, { type: "fieldCount" }>,
  counts: {
    selfCostArea: number;
    selfAttached: number;
    selfTrash?: number;
    opponentCostArea?: number;
    opponentAttached?: number;
    opponentTrash?: number;
  },
) => {
  const state = createActiveState();
  setDonFieldState(state, p1, {
    costArea: counts.selfCostArea,
    attached: counts.selfAttached,
    ...(counts.selfTrash === undefined ? {} : { trash: counts.selfTrash }),
  });
  setDonFieldState(state, p2, {
    costArea: counts.opponentCostArea ?? 0,
    attached: counts.opponentAttached ?? 0,
    ...(counts.opponentTrash === undefined
      ? {}
      : { trash: counts.opponentTrash }),
  });
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

test("fieldCount DON filter supports self and opponent eq/gte/lte comparators", () => {
  assert.deepEqual(
    evaluateFieldCount(
      {
        type: "fieldCount",
        player: "self",
        filter: donFieldFilter,
        op: "eq",
        value: 3,
      },
      { selfCostArea: 1, selfAttached: 2 },
    ),
    { supported: true, passed: true },
  );
  assert.deepEqual(
    evaluateFieldCount(
      {
        type: "fieldCount",
        player: "self",
        filter: donFieldFilter,
        op: "gte",
        value: 4,
      },
      { selfCostArea: 2, selfAttached: 1 },
    ),
    { supported: true, passed: false },
  );
  assert.deepEqual(
    evaluateFieldCount(
      {
        type: "fieldCount",
        player: "opponent",
        filter: donFieldFilter,
        op: "lte",
        value: 3,
      },
      {
        selfCostArea: 0,
        selfAttached: 0,
        opponentCostArea: 2,
        opponentAttached: 1,
      },
    ),
    { supported: true, passed: true },
  );
});

test("fieldCount counts cost-area plus attached DON and excludes DON deck/trash", () => {
  assert.deepEqual(
    evaluateFieldCount(
      {
        type: "fieldCount",
        player: "self",
        filter: donFieldFilter,
        op: "eq",
        value: 2,
      },
      { selfCostArea: 1, selfAttached: 1, selfTrash: 1 },
    ),
    { supported: true, passed: true },
  );
});

test("fieldCount honors DON filter state for active, rested, and attached", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  player.costArea = [];
  player.leader = { ...player.leader, attachedDon: [] };
  player.characters = [];

  const activeDon = removeFirstDonFromDeck(state, p1);
  const restedDon = removeFirstDonFromDeck(state, p1);
  const attachedDon = removeFirstDonFromDeck(state, p1);
  player.costArea.push(
    {
      ...activeDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "active",
    },
    {
      ...restedDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 1 },
      state: "rested",
    },
    {
      ...attachedDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 2 },
    },
  );
  player.characters = [
    {
      ...must(player.hand[0], "attach host"),
      zone: {
        zone: "characterArea",
        playerId: p1,
        slot: "character",
        index: 0,
      },
      state: "active",
      attachedDon: [attachedDon.instanceId],
      turnPlayed: state.turn.globalTurn,
    },
  ];

  const entry = queueDrawForP1();
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, entry, {
      type: "fieldCount",
      player: "self",
      filter: { categories: ["don"], state: "active" },
      op: "eq",
      value: 1,
    }),
    { supported: true, passed: true },
  );
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, entry, {
      type: "fieldCount",
      player: "self",
      filter: { categories: ["don"], state: "rested" },
      op: "eq",
      value: 1,
    }),
    { supported: true, passed: true },
  );
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, entry, {
      type: "fieldCount",
      player: "self",
      filter: { categories: ["don"], state: "attached" },
      op: "eq",
      value: 1,
    }),
    { supported: true, passed: true },
  );
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, entry, {
      type: "fieldCount",
      player: "self",
      filter: { categories: ["don"] },
      op: "eq",
      value: 3,
    }),
    { supported: true, passed: true },
  );
});

test("fieldCount fails closed for unsupported DON filter shapes", () => {
  const state = createActiveState();
  setDonFieldState(state, p1, { costArea: 2, attached: 1 });
  const entry = queueDrawForP1();
  const before = hashCanonicalStateValue(state);
  const unsupported = [
    {
      type: "fieldCount",
      player: "self",
      filter: { categories: ["don"], state: "active", colorsAny: ["red"] },
      op: "gte",
      value: 1,
    },
    {
      type: "fieldCount",
      player: "self",
      filter: { categories: ["character"] },
      op: "gte",
      value: 1,
    },
  ] as unknown as Condition[];

  for (const condition of unsupported) {
    assert.deepEqual(evaluateQueuedEffectCondition(state, entry, condition), {
      supported: false,
    });
  }
  assert.equal(hashCanonicalStateValue(state), before);
});

test("queued effect condition gate resolves only when fieldCount passes", () => {
  const runTrue = () => {
    const state = createActiveState();
    setDonFieldState(state, p1, { costArea: 1, attached: 2 });
    setupQueuedDrawWithCondition(
      state,
      {
        type: "fieldCount",
        player: "self",
        filter: donFieldFilter,
        op: "gte",
        value: 3,
      },
      "field-count-queue-true",
    );
    return processEffectRuntime(state);
  };
  const runFalse = () => {
    const state = createActiveState();
    setDonFieldState(state, p1, { costArea: 1, attached: 1 });
    setupQueuedDrawWithCondition(
      state,
      {
        type: "fieldCount",
        player: "self",
        filter: donFieldFilter,
        op: "gte",
        value: 3,
      },
      "field-count-queue-false",
    );
    return processEffectRuntime(state);
  };

  const passed = runTrue();
  assert.equal(passed.errors, undefined);
  assert.deepEqual(passed.events.map((event) => event.type).slice(0, 4), [
    "cardDrawn",
    "cardMoved",
    "cardMoved",
    "effectResolved",
  ]);

  const failed = runFalse();
  assert.equal(failed.errors, undefined);
  assert.deepEqual(failed.events, []);
});

test("fieldCount true/false paths keep deterministic state hash and hidden-info filtering", () => {
  const runTrue = () => {
    const state = createActiveState();
    setDonFieldState(state, p1, { costArea: 2, attached: 1 });
    setupQueuedDrawWithCondition(
      state,
      {
        type: "fieldCount",
        player: "self",
        filter: donFieldFilter,
        op: "eq",
        value: 3,
      },
      "field-count-deterministic-true",
    );
    return processEffectRuntime(state);
  };
  const runFalse = () => {
    const state = createActiveState();
    setDonFieldState(state, p1, { costArea: 2, attached: 0, trash: 1 });
    setupQueuedDrawWithCondition(
      state,
      {
        type: "fieldCount",
        player: "self",
        filter: donFieldFilter,
        op: "eq",
        value: 3,
      },
      "field-count-deterministic-false",
    );
    return processEffectRuntime(state);
  };

  const firstTrue = runTrue();
  const secondTrue = runTrue();
  assert.equal(firstTrue.stateHash, hashCanonicalStateValue(firstTrue.state));
  assert.equal(firstTrue.stateHash, secondTrue.stateHash);

  const firstFalse = runFalse();
  const secondFalse = runFalse();
  assert.deepEqual(firstFalse.events, []);
  assert.equal(firstFalse.stateHash, hashCanonicalStateValue(firstFalse.state));
  assert.equal(firstFalse.stateHash, secondFalse.stateHash);

  const view = filterStateForPlayer(firstTrue.state, p1);
  assert.equal(
    JSON.stringify(view).includes("field-count-deterministic"),
    false,
  );
});
