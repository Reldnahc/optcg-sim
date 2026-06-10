import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, EffectDefinition } from "@optcg/types";

import type { EffectQueueEntry } from "./effect-runtime-queue/test-support.js";
import { addExtraDeckCard } from "./action-test-fixtures.js";
import {
  cardRef,
  setupAttackState,
  withOnKODrawEffect,
  withOnOpponentAttackDrawEffect,
  withWhenAttackingDrawEffect,
} from "./battle/test-fixtures.js";
import { isSupportedQueuedDrawEffectBlock } from "./runtime/primitives/execute.js";
import { isSupportedEffectResolvedCustomEffect } from "./effect-runtime-custom-trigger-support.js";
import {
  applyAction,
  createActiveState,
  hashCanonicalStateValue,
  must,
  p1,
  p2,
  processEffectRuntime,
  queueDrawForP1,
  queueingState,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  setupCustomEffectResolvedDefinition,
  setupOnPlayDefinition,
  toCardId,
  toEffectId,
  toQueueEntryId,
  toStateSeq,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "./effect-runtime-queue/test-support.js";
import { resolveSupportedVanillaBattle } from "./index.js";
import { setupMainPlayState } from "./play-card/test-fixtures.js";

const assertStrictlyIncreasingSeq = (
  seqValues: readonly number[],
  label: string,
): void => {
  for (let index = 1; index < seqValues.length; index += 1) {
    const previous = seqValues[index - 1];
    const current = seqValues[index];
    assert.ok(previous !== undefined && current !== undefined);
    assert.ok(previous < current, `${label} must be strictly increasing`);
  }
};

const createOncePerTurnOnPlayEntry = (
  id: string,
  effectId: string,
): {
  state: ReturnType<typeof createActiveState>;
  entry: EffectQueueEntry;
} => {
  const { state, played } = queueingState();
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    played.cardId,
    supportCard.support,
  );
  setupOnPlayDefinition(
    state,
    played,
    {
      ...baseDefinition,
      effects: [
        {
          ...must(baseDefinition.effects[0], "on play draw effect"),
          id: toEffectId(effectId),
          oncePerTurn: true,
        },
      ],
    },
    `${id}:definition`,
  );
  const nextEntry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId(id),
    timingWindowId: toTimingWindowId(`${id}:window`),
    source: {
      instanceId: played.instanceId,
      cardId: played.cardId,
      playerId: p1,
      zone: played.zone,
    },
    sourceSnapshot: {
      ...queueDrawForP1().sourceSnapshot,
      instanceId: played.instanceId,
      cardId: played.cardId,
      zone: played.zone,
      category: "character",
    },
    effectBlockId: toEffectId(effectId),
    sourcePresencePolicy: "mustRemainInSameZone",
  };
  state.effectQueue = [nextEntry];
  return { state, entry: nextEntry };
};

const createOncePerTurnOptionalEntry = (
  id: string,
  effectId: string,
): {
  state: ReturnType<typeof createActiveState>;
  entry: EffectQueueEntry;
} => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const source = p1State.leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const baseEffect = must(baseDefinition.effects[0], "base optional effect");
  const effect = {
    ...baseEffect,
    id: toEffectId(effectId),
    optional: true,
    oncePerTurn: true,
  };
  const definition = {
    ...baseDefinition,
    effects: [effect],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-optional-once-per-turn": definition,
  };
  state.cardManifest.cards[source.cardId] = resolvedCard({
    cardId: source.cardId,
    category: "leader",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-optional-once-per-turn",
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
  const entry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId(id),
    timingWindowId: toTimingWindowId(`${id}:window`),
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: toSourceSnapshot(source, p1, p1),
    effectBlockId: effect.id,
    sourcePresencePolicy: must(
      effect.sourcePresencePolicy,
      "optional source presence policy",
    ),
    queuedAtStateSeq: toStateSeq(state.seq),
  };
  state.effectQueue = [entry];
  return { state, entry };
};

const installOncePerTurnDrawDefinition = (params: {
  state: ReturnType<typeof createActiveState>;
  source: CardInstance;
  category: "character" | "leader";
  trigger: EffectDefinition["effects"][number]["trigger"];
  effectDefinitionId: string;
  sourcePresencePolicy?: EffectQueueEntry["sourcePresencePolicy"];
}): EffectDefinition["effects"][number] => {
  const {
    state,
    source,
    category,
    trigger,
    effectDefinitionId,
    sourcePresencePolicy = "mustRemainInSameZone",
  } = params;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category,
    power: category === "leader" ? 5000 : 3000,
    ...(category === "character" ? { cost: 0 } : {}),
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: `${effectDefinitionId}:rules`,
      sourceTextHash: `${effectDefinitionId}:source`,
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const effect = {
    ...must(baseDefinition.effects[0], "base production effect"),
    id: toEffectId(`${effectDefinitionId}:effect`),
    trigger,
    oncePerTurn: true,
    sourcePresencePolicy,
  };
  const definition: EffectDefinition = {
    ...baseDefinition,
    effects: [effect],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  return effect;
};

const replaceOnlyEffect = (
  state: ReturnType<typeof createActiveState>,
  effectDefinitionId: string,
  update: (
    effect: EffectDefinition["effects"][number],
  ) => EffectDefinition["effects"][number],
): EffectDefinition["effects"][number] => {
  const definition = must(
    state.cardManifest.effectDefinitions?.[effectDefinitionId],
    `${effectDefinitionId} definition`,
  );
  const effect = update(must(definition.effects[0], "definition effect"));
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: {
      ...definition,
      effects: [effect],
    },
  };
  return effect;
};

test("supported queued no-choice draw consumes once-per-turn when resolution begins", () => {
  const { state, entry } = createOncePerTurnOnPlayEntry(
    "queue-entry-once-per-turn-first",
    "OP01-015:auto-on-play-1",
  );
  const beforeSeq = state.seq;

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.oncePerTurn.length, 1);
  assert.deepEqual(result.state.oncePerTurn[0], {
    cardInstanceId: entry.source.instanceId,
    effectId: entry.effectBlockId,
    turnNumber: state.turn.globalTurn,
    usedAtStateSeq: beforeSeq,
  });
  assertStrictlyIncreasingSeq(
    result.events.map((event) => event.seq),
    "first once-per-turn resolution events",
  );
});

const oncePerTurnNoChoiceDrawEffect = (
  trigger:
    | { type: "onPlay" }
    | { type: "whenAttacking" }
    | { type: "onOpponentAttack" }
    | { type: "onKO" }
    | { type: "custom"; event: string },
  sourcePresencePolicy:
    | "mustRemainInSameZone"
    | "resolveFromDestinationZone"
    | "resolveFromLastKnownInformation",
): EffectDefinition["effects"][number] => ({
  id: toEffectId(`predicate:${trigger.type}`),
  trigger,
  category: "auto",
  sourcePresencePolicy,
  oncePerTurn: true,
  effect: { type: "draw", player: "self", count: 1 },
});

test("non-optional once-per-turn onPlay draw block is queue-supported", () => {
  assert.equal(
    isSupportedQueuedDrawEffectBlock(
      oncePerTurnNoChoiceDrawEffect({ type: "onPlay" }, "mustRemainInSameZone"),
    ),
    true,
  );
});

test("non-optional once-per-turn whenAttacking draw block is queue-supported", () => {
  assert.equal(
    isSupportedQueuedDrawEffectBlock(
      oncePerTurnNoChoiceDrawEffect(
        { type: "whenAttacking" },
        "mustRemainInSameZone",
      ),
    ),
    true,
  );
});

test("non-optional once-per-turn onOpponentAttack draw block is queue-supported", () => {
  assert.equal(
    isSupportedQueuedDrawEffectBlock(
      oncePerTurnNoChoiceDrawEffect(
        { type: "onOpponentAttack" },
        "mustRemainInSameZone",
      ),
    ),
    true,
  );
});

test("non-optional once-per-turn onKO draw block is queue-supported", () => {
  assert.equal(
    isSupportedQueuedDrawEffectBlock(
      oncePerTurnNoChoiceDrawEffect(
        { type: "onKO" },
        "resolveFromDestinationZone",
      ),
    ),
    true,
  );
});

test("non-optional once-per-turn no-choice custom effect-resolved draw shape is queue-supported", () => {
  assert.equal(
    isSupportedEffectResolvedCustomEffect(
      oncePerTurnNoChoiceDrawEffect(
        { type: "custom", event: "effectResolved" },
        "mustRemainInSameZone",
      ),
      "effectResolved",
    ),
    true,
  );
});

test("production playCard path queues and consumes non-optional once-per-turn On Play", () => {
  const state = setupMainPlayState();
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "on-play source");
  const effect = installOncePerTurnDrawDefinition({
    state,
    source,
    category: "character",
    trigger: { type: "onPlay" },
    effectDefinitionId: "def-production-on-play-once",
  });

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: source.instanceId,
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.oncePerTurn.length, 1);
  assert.equal(result.state.oncePerTurn[0]?.effectId, effect.id);
  assert.equal(
    result.events.some((event) => event.type === "effectQueued"),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "effectResolved"),
    true,
  );
});

test("production attack timing queues and consumes non-optional once-per-turn attack triggers", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const defender = p2State.leader;
  const whenAttackingId = "def-production-when-attacking-once";
  const opponentAttackId = "def-production-on-opponent-attack-once";
  withWhenAttackingDrawEffect(state, attacker, whenAttackingId);
  withOnOpponentAttackDrawEffect(state, defender, opponentAttackId);
  const whenAttackingEffect = replaceOnlyEffect(
    state,
    whenAttackingId,
    (effect) => ({ ...effect, oncePerTurn: true }),
  );
  const opponentAttackEffect = replaceOnlyEffect(
    state,
    opponentAttackId,
    (effect) => ({ ...effect, oncePerTurn: true }),
  );
  addExtraDeckCard(state, p1);
  addExtraDeckCard(state, p2);

  const result = applyAction(state, {
    type: "declareAttack",
    attacker: cardRef(attacker, p1),
    target: cardRef(defender, p2),
  });

  assert.equal(result.errors, undefined);
  assert.deepEqual(
    result.state.oncePerTurn.map((record) => record.effectId),
    [whenAttackingEffect.id, opponentAttackEffect.id],
  );
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "effectQueued" &&
        (event.payload as { effectBlockId?: string }).effectBlockId ===
          whenAttackingEffect.id,
    ),
    true,
  );
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "effectQueued" &&
        (event.payload as { effectBlockId?: string }).effectBlockId ===
          opponentAttackEffect.id,
    ),
    true,
  );
});

test("production battle K.O. queues and consumes non-optional once-per-turn On K.O.", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = must(p1State.characters[0], "attacker");
  const target = must(p2State.characters[0], "target");
  state.cardManifest.cards[attacker.cardId] = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
    power: 7000,
  });
  const definitionId = "def-production-on-ko-once";
  withOnKODrawEffect(state, target, definitionId);
  const onKOEffect = replaceOnlyEffect(state, definitionId, (effect) => ({
    ...effect,
    oncePerTurn: true,
  }));
  addExtraDeckCard(state, p2);
  state.battle = {
    attacker: cardRef(attacker, p1),
    originalTarget: cardRef(target, p2),
    currentTarget: cardRef(target, p2),
    step: "counter",
    damageCount: 1,
  };

  const result = resolveSupportedVanillaBattle(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.oncePerTurn.length, 1);
  assert.equal(result.state.oncePerTurn[0]?.effectId, onKOEffect.id);
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "effectQueued" &&
        (event.payload as { effectBlockId?: string }).effectBlockId ===
          onKOEffect.id,
    ),
    true,
  );
});

test("production effect-resolved trigger queues and consumes non-optional once-per-turn custom draw", () => {
  const { state, played } = queueingState();
  const p1State = must(state.players[p1], "p1");
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  const onPlayDefinition = reviewedOnPlayDrawDefinition(
    played.cardId,
    supportCard.support,
  );
  const onPlayEffect = must(onPlayDefinition.effects[0], "on-play effect");
  setupOnPlayDefinition(
    state,
    played,
    onPlayDefinition,
    "def-production-custom-source",
  );
  const customSource = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(p1State.hand[1], "custom trigger source"),
      cardId: toCardId("once-custom-trigger-source"),
    },
    zone: "characterArea",
    index: 1,
  });
  const customDefinitionId = "def-production-custom-once";
  setupCustomEffectResolvedDefinition(
    state,
    customSource,
    `effectResolved:${String(onPlayEffect.id)}`,
    customDefinitionId,
  );
  const customEffect = replaceOnlyEffect(
    state,
    customDefinitionId,
    (effect) => ({
      ...effect,
      id: toEffectId("def-production-custom-once:effect"),
      oncePerTurn: true,
    }),
  );
  addExtraDeckCard(state, p1);
  addExtraDeckCard(state, p1);

  const queued = processEffectRuntime(state);
  assert.equal(queued.errors, undefined);
  const result = processEffectRuntime(queued.state);

  assert.equal(result.errors, undefined);
  assert.equal(
    result.state.oncePerTurn.some(
      (record) => record.effectId === customEffect.id,
    ),
    true,
  );
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "effectQueued" &&
        (event.payload as { effectBlockId?: string }).effectBlockId ===
          customEffect.id,
    ),
    true,
  );
});

test("first once-per-turn resolution is deterministic for events, journal, and state hash", () => {
  const run = () => {
    const { state } = createOncePerTurnOnPlayEntry(
      "queue-entry-once-per-turn-determinism",
      "OP01-015:auto-on-play-1",
    );
    return processEffectRuntime(state);
  };

  const first = run();
  const second = run();

  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.state.eventJournal, second.state.eventJournal);
  assert.equal(first.stateHash, second.stateHash);
  assertStrictlyIncreasingSeq(
    first.events.map((event) => event.seq),
    "deterministic first once-per-turn events",
  );
});

test("once-per-turn consumption changes stateHash deterministically when consumed", () => {
  const run = () => {
    const { state } = createOncePerTurnOnPlayEntry(
      "queue-entry-once-per-turn-hash-shift",
      "OP01-015:auto-on-play-1",
    );
    const beforeHash = hashCanonicalStateValue(state);
    const result = processEffectRuntime(state);
    return { beforeHash, result };
  };

  const first = run();
  const second = run();

  assert.equal(first.result.errors, undefined);
  assert.equal(second.result.errors, undefined);
  assert.equal(first.result.state.oncePerTurn.length, 1);
  assert.equal(second.result.state.oncePerTurn.length, 1);
  assert.notEqual(first.beforeHash, first.result.stateHash);
  assert.notEqual(second.beforeHash, second.result.stateHash);
  assert.equal(
    first.result.stateHash,
    hashCanonicalStateValue(first.result.state),
  );
  assert.equal(
    second.result.stateHash,
    hashCanonicalStateValue(second.result.state),
  );
  assert.equal(first.beforeHash, second.beforeHash);
  assert.equal(first.result.stateHash, second.result.stateHash);
});

test("once-per-turn use is still consumed when resolution follows a do-as-much-as-possible path", () => {
  const { state, entry } = createOncePerTurnOnPlayEntry(
    "queue-entry-once-per-turn-partial-consume",
    "OP01-015:auto-on-play-1",
  );
  const p1State = must(state.players[p1], "p1 state");
  p1State.deck = [];
  const beforeHand = p1State.hand.length;

  const result = processEffectRuntime(state);
  const afterP1 = must(result.state.players[p1], "p1 after");

  assert.equal(result.errors, undefined);
  assert.equal(result.state.oncePerTurn.length, 1);
  assert.deepEqual(result.state.oncePerTurn[0], {
    cardInstanceId: entry.source.instanceId,
    effectId: entry.effectBlockId,
    turnNumber: state.turn.globalTurn,
    usedAtStateSeq: toStateSeq(state.seq),
  });
  assert.equal(afterP1.hand.length, beforeHand);
  assert.equal(
    result.events.some((event) => event.type === "cardDrawn"),
    false,
  );
  assert.equal(result.state.effectQueue.length, 0);
});

test("repeated same-card same-effect queued no-choice draw is blocked before resolution", () => {
  const { state, entry } = createOncePerTurnOnPlayEntry(
    "queue-entry-once-per-turn-repeat",
    "OP01-015:auto-on-play-1",
  );
  state.oncePerTurn = [
    {
      cardInstanceId: entry.source.instanceId,
      effectId: entry.effectBlockId,
      turnNumber: state.turn.globalTurn,
      usedAtStateSeq: toStateSeq(state.seq),
    },
  ];
  state.effectQueue = [entry];
  const beforeDeck = must(state.players[p1], "p1 before").deck.length;
  const beforeHand = must(state.players[p1], "p1 before").hand.length;

  const result = processEffectRuntime(state);
  const afterP1 = must(result.state.players[p1], "p1 after");

  assert.ok(result.errors !== undefined);
  assert.deepEqual(result.state, state);
  assert.equal(result.state.effectQueue.length, 1);
  assert.equal(result.state.oncePerTurn.length, 1);
  assert.equal(afterP1.deck.length, beforeDeck);
  assert.equal(afterP1.hand.length, beforeHand);
  assert.equal(result.events.length, 0);
  assert.equal(
    result.events.filter((event) => event.type === "effectResolved").length,
    0,
  );
  assert.equal(
    result.events.some((event) => event.type === "cardDrawn"),
    false,
  );
  assert.equal(
    result.events.some((event) => event.type === "effectResolved"),
    false,
  );
  assertStrictlyIncreasingSeq(
    result.state.eventJournal.map((event) => event.seq),
    "blocked once-per-turn event journal",
  );
});

test("blocked repeated once-per-turn is deterministic for events, journal, and state hash", () => {
  const run = () => {
    const { state, entry } = createOncePerTurnOnPlayEntry(
      "queue-entry-once-per-turn-repeat-determinism",
      "OP01-015:auto-on-play-1",
    );
    state.oncePerTurn = [
      {
        cardInstanceId: entry.source.instanceId,
        effectId: entry.effectBlockId,
        turnNumber: state.turn.globalTurn,
        usedAtStateSeq: toStateSeq(state.seq),
      },
    ];
    state.effectQueue = [entry];
    return processEffectRuntime(state);
  };

  const first = run();
  const second = run();

  assert.equal(first.events.length, 0);
  assert.equal(second.events.length, 0);
  assert.ok(first.errors !== undefined);
  assert.ok(second.errors !== undefined);
  assert.equal(first.state.effectQueue.length, 1);
  assert.equal(second.state.effectQueue.length, 1);
  assert.equal(first.state.oncePerTurn.length, 1);
  assert.equal(second.state.oncePerTurn.length, 1);
  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.state.eventJournal, second.state.eventJournal);
  assert.equal(first.stateHash, second.stateHash);
});

test("once-per-turn keys remain independent across card or effect identity", () => {
  const { state, played } = queueingState();
  const p1State = must(state.players[p1], "p1");
  const secondSource = withCardInZone({
    state,
    playerId: p1,
    card: {
      ...must(p1State.hand[1], "second source"),
      cardId: played.cardId,
    },
    zone: "characterArea",
    index: 1,
  });
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    played.cardId,
    supportCard.support,
  );
  setupOnPlayDefinition(
    state,
    played,
    {
      ...baseDefinition,
      effects: [
        {
          ...must(baseDefinition.effects[0], "effect A"),
          id: toEffectId("OP01-015:auto-on-play-a"),
          oncePerTurn: true,
        },
        {
          ...must(baseDefinition.effects[0], "effect B"),
          id: toEffectId("OP01-015:auto-on-play-b"),
          oncePerTurn: true,
        },
      ],
    },
    "def-once-per-turn-independent-keys",
  );
  const base: EffectQueueEntry = {
    ...queueDrawForP1(),
    source: {
      instanceId: played.instanceId,
      cardId: played.cardId,
      playerId: p1,
      zone: played.zone,
    },
    sourceSnapshot: {
      ...queueDrawForP1().sourceSnapshot,
      instanceId: played.instanceId,
      cardId: played.cardId,
      zone: played.zone,
      category: "character",
    },
    effectBlockId: toEffectId("OP01-015:auto-on-play-a"),
    sourcePresencePolicy: "mustRemainInSameZone",
  };
  const sameCardDifferentEffect: EffectQueueEntry = {
    ...base,
    id: toQueueEntryId("queue-entry-same-card-different-effect"),
    timingWindowId: toTimingWindowId(
      "queue-entry-same-card-different-effect:window",
    ),
    effectBlockId: toEffectId("OP01-015:auto-on-play-b"),
  };
  const differentCardSameEffect: EffectQueueEntry = {
    ...base,
    id: toQueueEntryId("queue-entry-different-card-same-effect"),
    timingWindowId: toTimingWindowId(
      "queue-entry-different-card-same-effect:window",
    ),
    source: {
      ...base.source,
      instanceId: secondSource.instanceId,
      zone: secondSource.zone,
    },
    sourceSnapshot: {
      ...base.sourceSnapshot,
      instanceId: secondSource.instanceId,
      zone: secondSource.zone,
    },
    effectBlockId: toEffectId("OP01-015:auto-on-play-a"),
    orderingGroup: "nonTurnPlayer",
    createdAtEventSeq: base.createdAtEventSeq + 1,
  };
  const stateA = structuredClone(state);
  stateA.oncePerTurn = [
    {
      cardInstanceId: sameCardDifferentEffect.source.instanceId,
      effectId: "OP01-015:auto-on-play-a",
      turnNumber: stateA.turn.globalTurn,
      usedAtStateSeq: toStateSeq(stateA.seq),
    },
  ];
  stateA.effectQueue = [sameCardDifferentEffect];
  const beforeDeckA = must(stateA.players[p1], "p1 before A").deck.length;
  const resultA = processEffectRuntime(stateA);
  assert.equal(resultA.errors, undefined);
  assert.equal(
    must(resultA.state.players[p1], "p1 after A").deck.length,
    beforeDeckA - 1,
  );

  const stateB = structuredClone(state);
  stateB.oncePerTurn = [
    {
      cardInstanceId: played.instanceId,
      effectId: "OP01-015:auto-on-play-a",
      turnNumber: stateB.turn.globalTurn,
      usedAtStateSeq: toStateSeq(stateB.seq),
    },
  ];
  stateB.effectQueue = [differentCardSameEffect];
  const beforeDeckB = must(stateB.players[p1], "p1 before B").deck.length;
  const resultB = processEffectRuntime(stateB);
  assert.equal(resultB.errors, undefined);
  assert.equal(
    must(resultB.state.players[p1], "p1 after B").deck.length,
    beforeDeckB - 1,
  );
});

test("declining optional once-per-turn does not consume use", () => {
  const { state } = createOncePerTurnOptionalEntry(
    "queue-entry-optional-once-decline",
    "OP01-015:auto-optional-1",
  );
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "optional decision");

  const declined = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "optionalActivation", choice: "decline" },
  });

  assert.equal(declined.errors, undefined);
  assert.deepEqual(declined.state.oncePerTurn, []);
  assert.equal(declined.state.pendingDecision, undefined);
  assert.deepEqual(declined.state.effectQueue, []);
});

test("accepting optional once-per-turn consumes when the accepted entry begins resolution", () => {
  const { state, entry } = createOncePerTurnOptionalEntry(
    "queue-entry-optional-once-accept",
    "OP01-015:auto-optional-1",
  );
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "optional decision");

  const accepted = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "optionalActivation", choice: "activate" },
  });

  assert.equal(accepted.errors, undefined);
  assert.equal(accepted.state.oncePerTurn.length, 1);
  assert.deepEqual(accepted.state.oncePerTurn[0], {
    cardInstanceId: entry.source.instanceId,
    effectId: entry.effectBlockId,
    turnNumber: state.turn.globalTurn,
    usedAtStateSeq: toStateSeq(paused.state.seq + 1),
  });
});

test("accepted optional once-per-turn blocks repeated same-turn optional use", () => {
  const { state, entry } = createOncePerTurnOptionalEntry(
    "queue-entry-optional-once-repeat",
    "OP01-015:auto-optional-1",
  );
  const firstDecisionResult = processEffectRuntime(state);
  const firstDecision = must(
    firstDecisionResult.state.pendingDecision,
    "first optional decision",
  );
  const accepted = applyAction(firstDecisionResult.state, {
    type: "respondToDecision",
    decisionId: firstDecision.id,
    response: { type: "optionalActivation", choice: "activate" },
  });
  assert.equal(accepted.errors, undefined);

  const repeatedState = structuredClone(accepted.state);
  repeatedState.effectQueue = [
    {
      ...entry,
      id: toQueueEntryId("queue-entry-optional-repeat-same-turn"),
      queuedAtStateSeq: toStateSeq(accepted.state.seq),
    },
  ];
  const blocked = processEffectRuntime(repeatedState);

  assert.ok(blocked.errors !== undefined);
  assert.equal(blocked.events.length, 0);
  assert.deepEqual(blocked.state, repeatedState);
});

test("accepted optional once-per-turn fails closed before resolving a same-key ordered-group repeat", () => {
  const { state, entry } = createOncePerTurnOptionalEntry(
    "queue-entry-optional-once-ordered",
    "OP01-015:auto-optional-1",
  );
  addExtraDeckCard(state, p1);
  addExtraDeckCard(state, p1);
  const repeatedEntry: EffectQueueEntry = {
    ...entry,
    id: toQueueEntryId("queue-entry-optional-once-ordered-repeat"),
    createdAtEventSeq: entry.createdAtEventSeq + 1,
  };
  state.effectQueue = [entry, repeatedEntry];
  const ordered = processEffectRuntime(state);
  const triggerOrderDecision = must(
    ordered.state.pendingDecision,
    "trigger order decision",
  );
  assert.equal(triggerOrderDecision.type, "chooseTriggerOrder");

  const orderedOptionalFirst = applyAction(ordered.state, {
    type: "respondToDecision",
    decisionId: triggerOrderDecision.id,
    response: {
      type: "orderedIds",
      ids: [entry.id],
    },
  });
  const optionalDecision = must(
    orderedOptionalFirst.state.pendingDecision,
    "optional decision",
  );
  assert.equal(optionalDecision.type, "chooseOptionalActivation");

  const blocked = applyAction(orderedOptionalFirst.state, {
    type: "respondToDecision",
    decisionId: optionalDecision.id,
    response: { type: "optionalActivation", choice: "activate" },
  });

  assert.ok(blocked.errors !== undefined);
  assert.equal(blocked.state.oncePerTurn.length, 1);
  assert.deepEqual(
    blocked.state.effectQueue.map((queued) => queued.id),
    [repeatedEntry.id],
  );
  assert.equal(
    blocked.events.some((event) => event.type === "effectResolved"),
    true,
  );
});

test("accepted optional once-per-turn does not block same optional effect next turn", () => {
  const { state, entry } = createOncePerTurnOptionalEntry(
    "queue-entry-optional-once-next-turn",
    "OP01-015:auto-optional-1",
  );
  const firstDecisionResult = processEffectRuntime(state);
  const firstDecision = must(
    firstDecisionResult.state.pendingDecision,
    "first optional decision",
  );
  const accepted = applyAction(firstDecisionResult.state, {
    type: "respondToDecision",
    decisionId: firstDecision.id,
    response: { type: "optionalActivation", choice: "activate" },
  });
  assert.equal(accepted.errors, undefined);

  const nextTurnState = structuredClone(accepted.state);
  nextTurnState.turn.globalTurn += 1;
  nextTurnState.effectQueue = [
    {
      ...entry,
      id: toQueueEntryId("queue-entry-optional-next-turn"),
      queuedAtStateSeq: toStateSeq(nextTurnState.seq),
    },
  ];

  const nextTurn = processEffectRuntime(nextTurnState);
  const nextTurnDecision = must(
    nextTurn.state.pendingDecision,
    "next-turn optional decision",
  );
  assert.equal(nextTurnDecision.type, "chooseOptionalActivation");
});
