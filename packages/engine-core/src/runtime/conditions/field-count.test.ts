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
} from "../../effect-runtime-queue-processing-test-support.js";
import { applyDeclareAttack } from "../../battle-actions.js";
import {
  setupAttackState,
  withWhenAttackingDrawEffect,
} from "../../battle-actions-test-fixtures.js";
import { evaluateQueuedEffectCondition } from "./evaluator.js";

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
  player.donDeck = player.donDeck.map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId, slot: "donDeck", index },
  }));
};

const donFieldFilter = {
  categories: ["don"],
} satisfies NonNullable<Extract<Condition, { type: "fieldCount" }>["filter"]>;

const evaluateFieldCount = (
  condition: Extract<
    Condition,
    { type: "fieldCount" | "fieldCountDifference" }
  >,
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

test("fieldCountDifference compares reusable DON count operands", () => {
  assert.deepEqual(
    evaluateFieldCount(
      {
        type: "fieldCountDifference",
        minuend: {
          player: "opponent",
          filter: donFieldFilter,
        },
        subtrahend: {
          player: "self",
          filter: donFieldFilter,
        },
        op: "gte",
        value: 2,
      },
      {
        selfCostArea: 1,
        selfAttached: 0,
        opponentCostArea: 3,
        opponentAttached: 0,
      },
    ),
    { supported: true, passed: true },
  );
  assert.deepEqual(
    evaluateFieldCount(
      {
        type: "fieldCountDifference",
        minuend: {
          player: "opponent",
          filter: donFieldFilter,
        },
        subtrahend: {
          player: "self",
          filter: donFieldFilter,
        },
        op: "gte",
        value: 2,
      },
      {
        selfCostArea: 1,
        selfAttached: 0,
        opponentCostArea: 2,
        opponentAttached: 0,
      },
    ),
    { supported: true, passed: false },
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

test("fieldCount state-only filter counts rested public field cards across zones", () => {
  const state = createActiveState();
  const player = must(state.players[p1], "p1");
  player.costArea = [];
  player.characters = [];
  player.leader = { ...player.leader, state: "rested", attachedDon: [] };
  const restedCharacter = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[0], "rested character"),
    zone: "characterArea",
    index: 0,
  });
  const activeCharacter = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[1], "active character"),
    zone: "characterArea",
    index: 1,
  });
  const stage = withCardInZone({
    state,
    playerId: p1,
    card: must(player.hand[2], "stage"),
    zone: "stageArea",
  });
  player.characters = [
    { ...restedCharacter, state: "rested" },
    { ...activeCharacter, state: "active" },
  ];
  player.stage = { ...stage, state: "rested" };
  const restedDon = removeFirstDonFromDeck(state, p1);
  const activeDon = removeFirstDonFromDeck(state, p1);
  const attachedDon = removeFirstDonFromDeck(state, p1);
  player.costArea = [
    {
      ...restedDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "rested",
    },
    {
      ...activeDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 1 },
      state: "active",
    },
    {
      ...attachedDon,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 2 },
      state: "rested",
    },
  ];
  player.characters[1] = {
    ...must(player.characters[1], "attached host"),
    attachedDon: [attachedDon.instanceId],
  };

  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "fieldCount",
      player: "self",
      filter: { state: "rested" },
      op: "eq",
      value: 4,
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
      filter: { categories: ["stage"] },
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

test("fieldCount fails closed for malformed DON filter.state values", () => {
  const state = createActiveState();
  setDonFieldState(state, p1, { costArea: 2, attached: 1 });
  const entry = queueDrawForP1();
  const malformed = {
    type: "fieldCount",
    player: "self",
    filter: { categories: ["don"], state: "charged" },
    op: "gte",
    value: 1,
  } as unknown as Condition;

  assert.deepEqual(evaluateQueuedEffectCondition(state, entry, malformed), {
    supported: false,
  });
});

test("When Attacking fieldCount condition gates body resolution and preserves event order", () => {
  const run = (selfCostArea: number) => {
    const state = setupAttackState();
    const p1State = must(state.players[p1], "p1");
    const p2State = must(state.players[p2], "p2");
    const definition = withWhenAttackingDrawEffect(
      state,
      p1State.leader,
      "def-when-attacking-field-count",
    );
    const effect = must(definition.effects[0], "when attacking effect");
    const conditioned = {
      ...effect,
      condition: {
        type: "fieldCount",
        player: "self",
        filter: { categories: ["don"] },
        op: "gte",
        value: 2,
      } satisfies Condition,
    };
    const effectDefinitions = must(
      state.cardManifest.effectDefinitions,
      "effect definitions",
    );
    effectDefinitions["def-when-attacking-field-count"] = {
      ...definition,
      effects: [conditioned],
    };
    setDonFieldState(state, p1, { costArea: selfCostArea, attached: 0 });
    const beforeDeck = p1State.deck.length;
    const beforeHand = p1State.hand.length;
    const beforeLife = p2State.life.length;

    const result = applyDeclareAttack(state, {
      type: "declareAttack",
      attacker: {
        instanceId: p1State.leader.instanceId,
        cardId: p1State.leader.cardId,
        playerId: p1,
      },
      target: {
        instanceId: p2State.leader.instanceId,
        cardId: p2State.leader.cardId,
        playerId: p2,
      },
    });
    return {
      result,
      effectId: conditioned.id,
      beforeDeck,
      beforeHand,
      beforeLife,
    };
  };

  const passed = run(2);
  assert.equal(passed.result.errors, undefined);
  assert.equal(passed.result.state.effectQueue.length, 0);
  assert.equal(
    must(passed.result.state.players[p1], "passed p1").deck.length,
    passed.beforeDeck - 1,
  );
  assert.equal(
    must(passed.result.state.players[p1], "passed p1").hand.length,
    passed.beforeHand + 1,
  );
  assert.ok(
    must(passed.result.state.players[p2], "passed p2").life.length <=
      passed.beforeLife,
  );
  const passedTypes = passed.result.events.map((event) => event.type);
  const passedAttackIndex = passedTypes.indexOf("attackDeclared");
  const passedResolvedIndex = passed.result.events.findIndex((event) => {
    const payload = event.payload as Partial<{ effectBlockId: string }>;
    return (
      event.type === "effectResolved" &&
      payload.effectBlockId === passed.effectId
    );
  });
  const passedDrawIndex = passedTypes.indexOf("cardDrawn");
  assert.notEqual(passedAttackIndex, -1);
  assert.notEqual(passedResolvedIndex, -1);
  assert.notEqual(passedDrawIndex, -1);
  assert.ok(passedAttackIndex < passedResolvedIndex);
  assert.ok(passedResolvedIndex >= passedDrawIndex);

  const failed = run(1);
  assert.equal(failed.result.errors, undefined);
  assert.equal(failed.result.state.effectQueue.length, 0);
  assert.equal(
    must(failed.result.state.players[p1], "failed p1").deck.length,
    failed.beforeDeck,
  );
  assert.equal(
    must(failed.result.state.players[p1], "failed p1").hand.length,
    failed.beforeHand,
  );
  assert.ok(
    must(failed.result.state.players[p2], "failed p2").life.length <=
      failed.beforeLife,
  );
  assert.equal(
    failed.result.events.some((event) => event.type === "cardDrawn"),
    false,
  );
  assert.equal(
    failed.result.events.some((event) => {
      const payload = event.payload as Partial<{ effectBlockId: string }>;
      return (
        event.type === "effectResolved" &&
        payload.effectBlockId === failed.effectId
      );
    }),
    false,
  );
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
