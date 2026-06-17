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
  toEngineEventId,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  withCardInZone,
} from "../../effect-runtime-queue/test-support.js";
import { applyDeclareAttack } from "../../battle/actions.js";
import {
  setupAttackState,
  withWhenAttackingDrawEffect,
} from "../../battle/test-fixtures.js";
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
    {
      type:
        | "fieldCount"
        | "fieldCountDifference"
        | "lifeCountDifference"
        | "lifeCountTotal";
    }
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

const setLifeCount = (
  state: ReturnType<typeof createActiveState>,
  playerId: PlayerId,
  count: number,
): void => {
  const player = must(state.players[playerId], "player");
  const source = player.deck[0] ?? player.leader;
  player.life = Array.from({ length: count }, (_, index) => ({
    card: {
      ...source,
      instanceId:
        `${String(source.instanceId)}:life:${String(index)}` as CardInstance["instanceId"],
      zone: { zone: "life", playerId, slot: "life", index },
    },
    faceUp: false,
  }));
  player.deck = player.deck.map((card, index) => ({
    ...card,
    zone: { zone: "deck", playerId, slot: "deck", index },
  }));
};

test("lifeCountDifference compares reusable player life-count operands", () => {
  const state = createActiveState();
  setLifeCount(state, p1, 2);
  setLifeCount(state, p2, 3);

  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "lifeCountDifference",
      minuend: { player: "opponent" },
      subtrahend: { player: "self" },
      op: "gte",
      value: 0,
    } as unknown as Condition),
    { supported: true, passed: true },
  );
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "lifeCountDifference",
      minuend: { player: "self" },
      subtrahend: { player: "opponent" },
      op: "gte",
      value: 0,
    } as unknown as Condition),
    { supported: true, passed: false },
  );
});

test("lifeCountTotal sums reusable player life-count operands", () => {
  const state = createActiveState();
  setLifeCount(state, p1, 2);
  setLifeCount(state, p2, 3);

  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "lifeCountTotal",
      players: ["self", "opponent"],
      op: "lte",
      value: 5,
    } as unknown as Condition),
    { supported: true, passed: true },
  );
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "lifeCountTotal",
      players: ["self", "opponent"],
      op: "lt",
      value: 5,
    } as unknown as Condition),
    { supported: true, passed: false },
  );
});

test("lifeVisibilityCount counts only matching face-up or face-down Life cards", () => {
  const state = createActiveState();
  setLifeCount(state, p1, 3);
  setLifeCount(state, p2, 2);
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const p1FirstLife = must(p1State.life[0], "p1 life");
  const p2FirstLife = must(p2State.life[0], "p2 life");
  p1State.life[0] = { ...p1FirstLife, faceUp: true };
  p2State.life[0] = { ...p2FirstLife, faceUp: true };

  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "lifeVisibilityCount",
      player: "self",
      faceUp: true,
      op: "gte",
      value: 1,
    }),
    { supported: true, passed: true },
  );
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "lifeVisibilityCount",
      player: "opponent",
      faceUp: false,
      op: "eq",
      value: 1,
    }),
    { supported: true, passed: true },
  );
});

test("fieldStatTotal sums matching field Character costs", () => {
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
  const firstCharacter = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "first p1 hand card"),
    zone: "characterArea",
    index: 0,
  });
  const secondCharacter = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[1], "second p1 hand card"),
    zone: "characterArea",
    index: 1,
  });
  const stage = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[2], "p1 stage card"),
    zone: "stageArea",
  });
  const opponentCharacter = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "p2 hand card"),
    zone: "characterArea",
    index: 0,
  });
  state.cardManifest.cards[firstCharacter.cardId] = resolvedCard({
    cardId: firstCharacter.cardId,
    category: "character",
    cost: 2,
    power: 2000,
  });
  state.cardManifest.cards[secondCharacter.cardId] = resolvedCard({
    cardId: secondCharacter.cardId,
    category: "character",
    cost: 3,
    power: 3000,
  });
  state.cardManifest.cards[stage.cardId] = resolvedCard({
    cardId: stage.cardId,
    category: "stage",
    cost: 9,
  });
  state.cardManifest.cards[opponentCharacter.cardId] = resolvedCard({
    cardId: opponentCharacter.cardId,
    category: "character",
    cost: 9,
    power: 9000,
  });

  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "fieldStatTotal",
      player: "self",
      filter: { categories: ["character"] },
      stat: "cost",
      op: "gte",
      value: 5,
    } as unknown as Condition),
    { supported: true, passed: true },
  );
  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "fieldStatTotal",
      player: "self",
      filter: { categories: ["character"] },
      stat: "cost",
      op: "gt",
      value: 5,
    } as unknown as Condition),
    { supported: true, passed: false },
  );
});

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

const effectResolvedStatuses = (
  events: readonly { readonly payload: unknown; readonly type: string }[],
): unknown[] =>
  events
    .filter((event) => event.type === "effectResolved")
    .map((event) => (event.payload as { readonly status?: unknown }).status);

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
  const failedResolved = failed.result.events.find((event) => {
    const payload = event.payload as Partial<{
      effectBlockId: string;
      status: string;
    }>;
    return (
      event.type === "effectResolved" &&
      payload.effectBlockId === failed.effectId
    );
  });
  const failedPayload = must(
    failedResolved,
    "failed condition effectResolved event",
  ).payload as Partial<{ effectBlockId: string; status: string }>;
  assert.equal(failedPayload.effectBlockId, failed.effectId);
  assert.equal(failedPayload.status, "conditionFailed");
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
  assert.deepEqual(
    failed.events.map((event) => event.type),
    ["effectResolved"],
  );
  assert.deepEqual(effectResolvedStatuses(failed.events), ["conditionFailed"]);
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
  assert.deepEqual(
    firstFalse.events.map((event) => event.type),
    ["effectResolved"],
  );
  assert.deepEqual(effectResolvedStatuses(firstFalse.events), [
    "conditionFailed",
  ]);
  assert.deepEqual(
    firstFalse.events.map((event) => event.seq),
    secondFalse.events.map((event) => event.seq),
  );
  assert.equal(firstFalse.stateHash, hashCanonicalStateValue(firstFalse.state));
  assert.equal(firstFalse.stateHash, secondFalse.stateHash);

  const view = filterStateForPlayer(firstTrue.state, p1);
  assert.equal(
    JSON.stringify(view).includes("field-count-deterministic"),
    false,
  );
});

test("eventHistory condition counts matching cardPlayed events from this turn", () => {
  const state = createActiveState();
  const eventCard = must(must(state.players[p1], "p1").hand[0], "event");
  state.cardManifest.cards[eventCard.cardId] = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 3,
  });
  state.eventJournal.push({
    id: toEngineEventId("event:event-history-current:cardPlayed"),
    seq: state.eventJournal.length + 1,
    type: "cardPlayed",
    payload: {
      playerId: p1,
      instanceId: eventCard.instanceId,
      cardId: eventCard.cardId,
      category: "event",
      turnNumber: state.turn.globalTurn,
    },
    visibility: { type: "public" },
    createdAtStateSeq: state.seq,
  });

  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "eventHistory",
      event: "cardPlayed",
      player: "self",
      filter: { categories: ["event"], baseCost: { op: "gte", value: 3 } },
      window: "thisTurn",
      op: "gte",
      value: 1,
    }),
    { supported: true, passed: true },
  );
});

test("eventHistory condition ignores matching cardPlayed events from another turn", () => {
  const state = createActiveState();
  const eventCard = must(must(state.players[p1], "p1").hand[0], "event");
  state.cardManifest.cards[eventCard.cardId] = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 4,
  });
  state.eventJournal.push({
    id: toEngineEventId("event:event-history-old:cardPlayed"),
    seq: state.eventJournal.length + 1,
    type: "cardPlayed",
    payload: {
      playerId: p1,
      instanceId: eventCard.instanceId,
      cardId: eventCard.cardId,
      category: "event",
      turnNumber: state.turn.globalTurn - 1,
    },
    visibility: { type: "public" },
    createdAtStateSeq: state.seq,
  });

  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "eventHistory",
      event: "cardPlayed",
      player: "self",
      filter: { categories: ["event"], baseCost: { op: "gte", value: 3 } },
      window: "thisTurn",
      op: "gte",
      value: 1,
    }),
    { supported: true, passed: false },
  );
});

test("eventHistory condition fails closed for unsupported filters", () => {
  const state = createActiveState();

  assert.deepEqual(
    evaluateQueuedEffectCondition(state, queueDrawForP1(), {
      type: "eventHistory",
      event: "cardPlayed",
      player: "self",
      filter: { currentPower: { op: "gte", value: 1000 } },
      window: "thisTurn",
      op: "gte",
      value: 1,
    }),
    { supported: false },
  );
});
