import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectQueueEntry, EngineResult } from "@optcg/types";

import {
  applyDeclareAttack,
  resolveSupportedVanillaBattle,
} from "./battle-actions.js";
import { applyAction, getLegalActions } from "./actions.js";
import {
  must,
  p1,
  p2,
  resolvedCard,
  toCardId,
  toEngineEventId,
  toStateSeq,
} from "./action-test-fixtures.js";
import {
  addTrashMarker,
  continuousKeywordEffectRecord,
  effectDefinition,
  setupAttackState,
} from "./battle-actions-test-fixtures.js";
import { hashCanonicalStateValue } from "./canonical-state.js";
import { filterStateForPlayer } from "./filter-state-for-player.js";

const setupLeaderBattleWithDamageCount = (
  damageCount: number,
  options: { doubleAttack?: boolean; unsupportedDoubleAttack?: boolean } = {},
) => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  if (
    options.doubleAttack === true ||
    options.unsupportedDoubleAttack === true
  ) {
    const attacker = p1State.leader;
    const doubleAttackCard = resolvedCard({
      cardId: attacker.cardId,
      category: "leader",
      power: 5000,
    });
    state.cardManifest.cards[attacker.cardId] = {
      ...doubleAttackCard,
      support: {
        ...doubleAttackCard.support,
        status:
          options.doubleAttack === true
            ? "implemented-dsl"
            : doubleAttackCard.support.status,
      },
      printedKeywords: ["doubleAttack"],
    };
  }
  state.battle = {
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    originalTarget: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
    currentTarget: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
    step: "attack",
    damageCount,
  };
  return state;
};

const installSupportedLifeTriggerOnLife = (
  state: ReturnType<typeof setupAttackState>,
  lifeIndex = 0,
  idSuffix = "top",
) => {
  const p2State = must(state.players[p2], "p2");
  const life = must(p2State.life[lifeIndex], "life card");
  const lifeCardId = toCardId(`double-attack-trigger-life-${idSuffix}`);
  p2State.life[lifeIndex] = {
    ...life,
    card: { ...life.card, cardId: lifeCardId },
  };
  const definition = effectDefinition(lifeCardId, { type: "trigger" });
  const effect = must(definition.effects[0], "trigger effect");
  const effectWithoutFlags = { ...effect };
  delete effectWithoutFlags.optional;
  delete effectWithoutFlags.oncePerTurn;
  const supported = {
    ...definition,
    effects: [
      {
        ...effectWithoutFlags,
        sourcePresencePolicy: "resolveFromLastKnownInformation" as const,
      },
    ],
  };
  state.cardManifest.cards[lifeCardId] = {
    ...resolvedCard({
      cardId: lifeCardId,
      category: "character",
      power: 1000,
    }),
    triggerText: "TRIGGER: draw 1 card",
    support: {
      cardId: lifeCardId,
      status: "implemented-dsl",
      effectDefinitionId: `def-double-attack-life-trigger-${idSuffix}`,
      tested: true,
      rulesVersion: supported.metadata.rulesVersion,
      cardDataVersion: "fixture",
      sourceTextHash: supported.metadata.sourceTextHash,
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitionsVersion =
    supported.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...(state.cardManifest.effectDefinitions ?? {}),
    [`def-double-attack-life-trigger-${idSuffix}`]: supported,
  };
  return {
    cardId: lifeCardId,
    effectId: supported.effects[0]?.id,
    instanceId: life.card.instanceId,
  };
};

const installEffectResolvedDrawFollowUp = (
  state: ReturnType<typeof setupAttackState>,
  eventName: string,
) => {
  const p2State = must(state.players[p2], "p2");
  const source = must(p2State.characters[0], "follow-up source");
  const sourceCardId = toCardId("double-attack-follow-up-source");
  const sourceWithCardId = { ...source, cardId: sourceCardId };
  p2State.characters[0] = sourceWithCardId;
  const definition = effectDefinition(sourceCardId, {
    type: "custom",
    event: eventName,
  });
  state.cardManifest.cards[sourceCardId] = {
    ...resolvedCard({
      cardId: sourceCardId,
      category: "character",
      power: 1000,
    }),
    support: {
      cardId: sourceCardId,
      status: "implemented-dsl",
      effectDefinitionId: "def-double-attack-follow-up",
      tested: true,
      rulesVersion: definition.metadata.rulesVersion,
      cardDataVersion: "fixture",
      sourceTextHash: definition.metadata.sourceTextHash,
      behaviorHash: "behavior-hash",
    },
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...(state.cardManifest.effectDefinitions ?? {}),
    "def-double-attack-follow-up": definition,
  };
  return must(definition.effects[0], "follow-up effect");
};

const installSupportedDoubleAttackLeader = (
  state: ReturnType<typeof setupAttackState>,
) => {
  const p1State = must(state.players[p1], "p1");
  const attacker = p1State.leader;
  const doubleAttackCard = resolvedCard({
    cardId: attacker.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[attacker.cardId] = {
    ...doubleAttackCard,
    support: {
      ...doubleAttackCard.support,
      status: "implemented-dsl",
    },
    printedKeywords: ["doubleAttack"],
  };
};

const eventSequence = (result: EngineResult) =>
  result.events.map((event) => ({
    seq: event.seq,
    type: event.type,
    visibility: event.visibility.type,
  }));

const eventTypeVisibilitySequence = (result: EngineResult) =>
  result.events.map((event) => ({
    type: event.type,
    visibility: event.visibility.type,
  }));

const assertAcceptedHash = (result: EngineResult): void => {
  assert.equal(result.errors, undefined);
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
};

const assertRejectedHash = (
  result: EngineResult,
  beforeStateHash: string,
): void => {
  assert.equal(result.stateHash, beforeStateHash);
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
};

test("double attack leader damage processes two life cards sequentially", () => {
  const state = setupLeaderBattleWithDamageCount(2, { doubleAttack: true });
  const p2State = must(state.players[p2], "p2");
  const topLife = must(p2State.life[0], "top life").card.instanceId;
  const secondLife = must(p2State.life[1], "second life").card.instanceId;
  const beforeLife = p2State.life.length;
  const beforeHand = p2State.hand.length;

  const result = resolveSupportedVanillaBattle(state);

  assert.equal(result.errors, undefined);
  assertAcceptedHash(result);
  const nextP2 = must(result.state.players[p2], "p2");
  assert.equal(nextP2.life.length, beforeLife - 2);
  assert.equal(nextP2.hand.length, beforeHand + 2);
  assert.equal(nextP2.hand[0]?.instanceId, secondLife);
  assert.equal(nextP2.hand[1]?.instanceId, topLife);
  const movementEvents = result.events.filter(
    (event) =>
      event.type === "cardMoved" && event.visibility.type === "private",
  );
  assert.equal(movementEvents.length >= 2, true);
  const firstMove = movementEvents[0];
  const secondMove = movementEvents[1];
  assert.equal(
    (firstMove?.payload as { instanceId: string }).instanceId,
    topLife,
  );
  assert.equal(
    (secondMove?.payload as { instanceId: string }).instanceId,
    secondLife,
  );
  const damageAndLifeEvents = result.events
    .filter(
      (event) => event.type === "damageDealt" || event.type === "lifeTaken",
    )
    .map((event) => event.type);
  assert.deepEqual(damageAndLifeEvents, [
    "damageDealt",
    "lifeTaken",
    "damageDealt",
    "lifeTaken",
  ]);
  assert.deepEqual(eventTypeVisibilitySequence(result), [
    { type: "damageDealt", visibility: "public" },
    { type: "lifeTaken", visibility: "public" },
    { type: "cardMoved", visibility: "public" },
    { type: "cardMoved", visibility: "private" },
    { type: "damageDealt", visibility: "public" },
    { type: "lifeTaken", visibility: "public" },
    { type: "cardMoved", visibility: "public" },
    { type: "cardMoved", visibility: "private" },
    { type: "effectResolved", visibility: "replayOnly" },
    { type: "ruleProcessingChecked", visibility: "replayOnly" },
  ]);
});

test("damageCount values other than one or two fail closed without mutation", () => {
  for (const damageCount of [0, 3]) {
    const state = setupLeaderBattleWithDamageCount(damageCount);
    const before = JSON.stringify(state);
    const beforeHash = hashCanonicalStateValue(state);

    const result = resolveSupportedVanillaBattle(state);

    assert.deepEqual(result.errors, [
      {
        type: "illegalAction",
        reason:
          "Battle requires unsupported blocker, step, or multi-damage behavior.",
      },
    ]);
    assert.deepEqual(result.events, []);
    assertRejectedHash(result, beforeHash);
    assert.equal(JSON.stringify(state), before);
    assert.equal(JSON.stringify(result.state), before);
  }
});

test("two damage without Double Attack source fails closed without mutation", () => {
  const state = setupLeaderBattleWithDamageCount(2);
  const before = JSON.stringify(state);
  const beforeHash = hashCanonicalStateValue(state);

  const result = resolveSupportedVanillaBattle(state);

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Battle requires unsupported keyword or protection handling.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assertRejectedHash(result, beforeHash);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("unsupported Double Attack metadata cannot bypass source gate through direct resolution", () => {
  const state = setupLeaderBattleWithDamageCount(2, {
    unsupportedDoubleAttack: true,
  });
  const before = JSON.stringify(state);
  const beforeHash = hashCanonicalStateValue(state);

  const result = resolveSupportedVanillaBattle(state);

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Battle requires unsupported keyword or protection handling.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assertRejectedHash(result, beforeHash);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("two damage against Character target fails closed without mutation", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const target = must(p2State.characters[0], "p2 character");
  target.state = "rested";
  installSupportedDoubleAttackLeader(state);
  state.battle = {
    attacker: {
      instanceId: p1State.leader.instanceId,
      cardId: p1State.leader.cardId,
      playerId: p1,
    },
    originalTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
    currentTarget: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
    step: "attack",
    damageCount: 2,
  };
  const before = JSON.stringify(state);
  const beforeHash = hashCanonicalStateValue(state);

  const result = resolveSupportedVanillaBattle(state);

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason:
        "Battle requires unsupported blocker, step, or multi-damage behavior.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assertRejectedHash(result, beforeHash);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("first Double Attack damage point with supported Life Trigger pauses before second point", () => {
  const state = setupLeaderBattleWithDamageCount(2, { doubleAttack: true });
  const firstLife = installSupportedLifeTriggerOnLife(state, 0, "first");
  const secondLife = must(must(state.players[p2], "p2").life[1], "second life")
    .card.instanceId;
  const beforeP2 = must(state.players[p2], "p2 before");

  const result = resolveSupportedVanillaBattle(state);

  assert.equal(result.errors, undefined);
  assertAcceptedHash(result);
  assert.equal(result.state.pendingDecision?.type, "confirmLifeTrigger");
  assert.equal(result.state.pendingDecision.card.cardId, firstLife.cardId);
  const continuationBattle = must(result.state.battle, "continuation battle");
  const continuationBattleWithInternal =
    continuationBattle as typeof continuationBattle & {
      damageProcess?: {
        type: string;
        sourceKeyword: string;
        remainingDamagePoints: number;
      };
    };
  assert.equal(continuationBattle.damageCount, 1);
  assert.deepEqual(continuationBattleWithInternal.damageProcess, {
    type: "multipleDamage",
    sourceKeyword: "doubleAttack",
    remainingDamagePoints: 1,
  });
  const nextP2 = must(result.state.players[p2], "next p2");
  assert.equal(nextP2.life.length, beforeP2.life.length - 1);
  assert.equal(nextP2.hand.length, beforeP2.hand.length);
  assert.equal(
    nextP2.life.some((lifeCard) => lifeCard.card.instanceId === secondLife),
    true,
  );
  assert.deepEqual(
    result.events
      .filter(
        (event) =>
          event.type === "damageDealt" ||
          event.type === "lifeTaken" ||
          event.type === "decisionCreated",
      )
      .map((event) => event.type),
    ["damageDealt", "lifeTaken", "decisionCreated"],
  );
  const defenderView = filterStateForPlayer(result.state, p2);
  const attackerView = filterStateForPlayer(result.state, p1);
  assert.equal(JSON.stringify(defenderView).includes("damageProcess"), false);
  assert.equal(JSON.stringify(attackerView).includes("damageProcess"), false);
  assert.equal(
    JSON.stringify(defenderView).includes("remainingDamagePoints"),
    false,
  );
  assert.equal(
    JSON.stringify(attackerView).includes("remainingDamagePoints"),
    false,
  );
});

test("accepting first Double Attack Life Trigger resumes and can create second trigger decision", () => {
  const state = setupLeaderBattleWithDamageCount(2, { doubleAttack: true });
  const firstLife = installSupportedLifeTriggerOnLife(state, 0, "first");
  const secondLife = installSupportedLifeTriggerOnLife(state, 1, "second");
  const opened = resolveSupportedVanillaBattle(state);
  const firstDecision = must(
    opened.state.pendingDecision,
    "first life trigger decision",
  );

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: firstDecision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });

  assert.equal(result.errors, undefined);
  assertAcceptedHash(result);
  assert.equal(result.state.pendingDecision?.type, "confirmLifeTrigger");
  assert.equal(result.state.pendingDecision.card.cardId, secondLife.cardId);
  assert.notEqual(result.state.pendingDecision.id, firstDecision.id);
  assert.equal(result.state.battle, undefined);
  const nextP2 = must(result.state.players[p2], "next p2");
  assert.equal(
    nextP2.trash.some((card) => card.instanceId === firstLife.instanceId),
    true,
  );
  assert.equal(
    nextP2.life.some(
      (lifeCard) => lifeCard.card.instanceId === secondLife.instanceId,
    ),
    false,
  );
  const attackerView = filterStateForPlayer(result.state, p1);
  const defenderView = filterStateForPlayer(result.state, p2);
  assert.equal(
    JSON.stringify(attackerView.events).includes(String(firstLife.cardId)),
    true,
  );
  assert.equal(
    JSON.stringify(defenderView.events).includes(String(firstLife.cardId)),
    true,
  );
  assert.equal(
    JSON.stringify(attackerView).includes(String(secondLife.cardId)),
    false,
  );
  assert.equal(
    JSON.stringify(defenderView).includes(String(secondLife.cardId)),
    false,
  );
  assert.deepEqual(
    result.events
      .filter(
        (event) =>
          event.type === "decisionResolved" ||
          event.type === "triggerActivated" ||
          event.type === "damageDealt" ||
          event.type === "lifeTaken" ||
          event.type === "decisionCreated",
      )
      .map((event) => event.type),
    [
      "decisionResolved",
      "triggerActivated",
      "damageDealt",
      "lifeTaken",
      "decisionCreated",
    ],
  );
});

test("accepted Double Attack Life Trigger continuation keeps event order and state hash stable", () => {
  const run = () => {
    const state = setupLeaderBattleWithDamageCount(2, { doubleAttack: true });
    installSupportedLifeTriggerOnLife(state, 0, "first");
    installSupportedLifeTriggerOnLife(state, 1, "second");
    const opened = resolveSupportedVanillaBattle(state);
    const firstDecision = must(
      opened.state.pendingDecision,
      "first life trigger decision",
    );
    return applyAction(opened.state, {
      type: "respondToDecision",
      decisionId: firstDecision.id,
      response: { type: "lifeTrigger", choice: "activateTrigger" },
    });
  };

  const first = run();
  const second = run();

  assertAcceptedHash(first);
  assertAcceptedHash(second);
  assert.deepEqual(
    first.events
      .filter(
        (event) =>
          event.type === "decisionResolved" ||
          event.type === "cardRevealed" ||
          event.type === "triggerActivated" ||
          event.type === "effectQueued" ||
          event.type === "effectResolved" ||
          event.type === "damageDealt" ||
          event.type === "lifeTaken" ||
          event.type === "decisionCreated",
      )
      .map((event) => event.type),
    [
      "decisionResolved",
      "cardRevealed",
      "triggerActivated",
      "effectQueued",
      "effectResolved",
      "damageDealt",
      "lifeTaken",
      "decisionCreated",
      "effectResolved",
    ],
  );
  assert.deepEqual(eventSequence(first), eventSequence(second));
  assert.equal(first.stateHash, second.stateHash);
});

test("Double Attack defers Life Trigger effectResolved follow-up until all damage points complete", () => {
  const state = setupLeaderBattleWithDamageCount(2, { doubleAttack: true });
  const firstLife = installSupportedLifeTriggerOnLife(state, 0, "first");
  const firstLifeEffectId = must(firstLife.effectId, "first life effect id");
  const opened = resolveSupportedVanillaBattle(state);
  assert.equal(opened.errors, undefined);
  const followUp = installEffectResolvedDrawFollowUp(
    opened.state,
    `effectResolved:${String(firstLifeEffectId)}`,
  );
  const openedP2 = must(opened.state.players[p2], "opened p2");
  const lifeDrawRefill = must(openedP2.hand[0], "life draw refill");
  const followUpDrawRefill = must(openedP2.hand[1], "follow-up draw refill");
  opened.state.players[p2] = {
    ...openedP2,
    hand: openedP2.hand.slice(2).map((card, index) => ({
      ...card,
      zone: { zone: "hand", playerId: p2, slot: "hand", index },
    })),
    deck: [
      {
        ...lifeDrawRefill,
        zone: { zone: "deck", playerId: p2, slot: "deck", index: 0 },
      },
      {
        ...followUpDrawRefill,
        zone: { zone: "deck", playerId: p2, slot: "deck", index: 1 },
      },
    ],
  };
  const firstDecision = must(
    opened.state.pendingDecision,
    "first life trigger decision",
  );

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: firstDecision.id,
    response: { type: "lifeTrigger", choice: "activateTrigger" },
  });

  assert.equal(result.errors, undefined);
  assertAcceptedHash(result);
  assert.equal(result.state.pendingDecision, undefined);
  assert.deepEqual(result.state.effectQueue, []);
  assert.deepEqual(result.state.deferredTriggers, []);

  const followUpQueuedIndex = result.events.findIndex(
    (event) =>
      event.type === "effectQueued" &&
      (event.payload as { effectBlockId?: unknown }).effectBlockId ===
        followUp.id,
  );
  const secondDamageIndex = result.events.findIndex(
    (event, index) =>
      event.type === "damageDealt" && index > followUpQueuedIndex,
  );
  const finalDamageEventIndex = Math.max(
    ...result.events
      .map((event, index) =>
        event.type === "damageDealt" || event.type === "lifeTaken" ? index : -1,
      )
      .filter((index) => index >= 0),
  );
  const followUpResolvedIndex = result.events.findIndex(
    (event) =>
      event.type === "effectResolved" &&
      (event.payload as { effectBlockId?: unknown }).effectBlockId ===
        followUp.id,
  );

  assert.notEqual(followUpQueuedIndex, -1);
  assert.notEqual(secondDamageIndex, -1);
  assert.notEqual(followUpResolvedIndex, -1);
  assert.equal(followUpQueuedIndex < secondDamageIndex, true);
  assert.equal(finalDamageEventIndex < followUpResolvedIndex, true);
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
});

test("Double Attack rejects structurally deferred non-Life Trigger follow-up without mutation", () => {
  const state = setupLeaderBattleWithDamageCount(2, { doubleAttack: true });
  installSupportedLifeTriggerOnLife(state, 0, "first");
  const opened = resolveSupportedVanillaBattle(state);
  assert.equal(opened.errors, undefined);
  const followUp = installEffectResolvedDrawFollowUp(
    opened.state,
    "effectResolved:not-a-life-trigger",
  );
  const source = must(
    must(opened.state.players[p2], "opened p2").characters[0],
    "follow-up source",
  );
  const entry: EffectQueueEntry = {
    id: "queue-entry:unsupported-deferred-follow-up" as EffectQueueEntry["id"],
    state: "pending",
    timingWindowId:
      "timing-window:unsupported-deferred-follow-up" as EffectQueueEntry["timingWindowId"],
    generation: 1,
    controllerId: p2,
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p2,
      zone: source.zone,
    },
    sourceSnapshot: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      ownerId: source.owner,
      controllerId: source.controller,
      zone: source.zone,
      category: "character",
      colors: ["red"],
      power: 1000,
      keywords: [],
    },
    triggerEventId: toEngineEventId("event:unsupported-deferred-follow-up"),
    effectBlockId: followUp.id,
    orderingGroup: "nonTurnPlayer",
    createdAtEventSeq: 1,
    queuedAtStateSeq: toStateSeq(opened.state.seq + 1),
    sourcePresencePolicy: must(
      followUp.sourcePresencePolicy,
      "follow-up source presence policy",
    ),
    causedBy: { type: "playerAction", actionId: "unsupported-deferred" },
  };
  opened.state.effectQueue = [entry];
  opened.state.deferredTriggers = [
    {
      timingWindowId: entry.timingWindowId,
      generation: entry.generation,
      triggerIds: [String(entry.id)],
      releasePolicy: "afterCurrentProcess",
    },
  ];
  const before = JSON.stringify(opened.state);
  const beforeHash = hashCanonicalStateValue(opened.state);

  const result = resolveSupportedVanillaBattle(opened.state);

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason: "Battle requires unsupported trigger or replacement processing.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assertRejectedHash(result, beforeHash);
  assert.equal(JSON.stringify(opened.state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("declining first Double Attack Life Trigger moves it to hand then resumes to second trigger decision", () => {
  const state = setupLeaderBattleWithDamageCount(2, { doubleAttack: true });
  const firstLife = installSupportedLifeTriggerOnLife(state, 0, "first");
  const secondLife = installSupportedLifeTriggerOnLife(state, 1, "second");
  const opened = resolveSupportedVanillaBattle(state);
  const firstDecision = must(
    opened.state.pendingDecision,
    "first life trigger decision",
  );
  const beforeHand = must(opened.state.players[p2], "p2 before").hand.length;

  const result = applyAction(opened.state, {
    type: "respondToDecision",
    decisionId: firstDecision.id,
    response: { type: "lifeTrigger", choice: "addToHand" },
  });

  assert.equal(result.errors, undefined);
  assertAcceptedHash(result);
  assert.equal(result.state.pendingDecision?.type, "confirmLifeTrigger");
  assert.equal(result.state.pendingDecision.card.cardId, secondLife.cardId);
  assert.equal(result.state.battle, undefined);
  const nextP2 = must(result.state.players[p2], "next p2");
  assert.equal(nextP2.hand.length, beforeHand + 1);
  assert.equal(nextP2.hand[0]?.instanceId, firstLife.instanceId);
  assert.equal(
    nextP2.life.some(
      (lifeCard) => lifeCard.card.instanceId === secondLife.instanceId,
    ),
    false,
  );
  assert.deepEqual(
    result.events
      .filter(
        (event) =>
          event.type === "decisionResolved" ||
          event.type === "cardMoved" ||
          event.type === "damageDealt" ||
          event.type === "lifeTaken" ||
          event.type === "decisionCreated",
      )
      .map((event) => event.type),
    [
      "decisionResolved",
      "cardMoved",
      "cardMoved",
      "damageDealt",
      "lifeTaken",
      "decisionCreated",
    ],
  );
});

test("malformed Double Attack Life Trigger continuation fails closed without mutation", () => {
  const state = setupLeaderBattleWithDamageCount(2, { doubleAttack: true });
  installSupportedLifeTriggerOnLife(state, 0, "first");
  const opened = resolveSupportedVanillaBattle(state);
  const decision = must(opened.state.pendingDecision, "life trigger decision");
  const malformed = structuredClone(opened.state);
  malformed.battle = {
    ...must(malformed.battle, "continuation battle"),
    damageCount: 3,
  };
  const before = structuredClone(malformed);
  const beforeHash = hashCanonicalStateValue(malformed);

  const result = applyAction(malformed, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "addToHand" },
  });

  assert.deepEqual(result.errors, [
    {
      type: "invalidDecisionResponse",
      reason: "Life Trigger damage continuation is malformed.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assertRejectedHash(result, beforeHash);
  assert.deepEqual(result.state, before);
});

test("missing Double Attack Life Trigger continuation marker fails closed without mutation", () => {
  const state = setupLeaderBattleWithDamageCount(2, { doubleAttack: true });
  installSupportedLifeTriggerOnLife(state, 0, "first");
  const opened = resolveSupportedVanillaBattle(state);
  const decision = must(opened.state.pendingDecision, "life trigger decision");
  const malformed = structuredClone(opened.state);
  const battle = must(malformed.battle, "continuation battle");
  malformed.battle = {
    ...battle,
  };
  delete (
    malformed.battle as
      | (NonNullable<typeof malformed.battle> & { damageProcess?: unknown })
      | undefined
  )?.damageProcess;
  const before = structuredClone(malformed);
  const beforeHash = hashCanonicalStateValue(malformed);

  const result = applyAction(malformed, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "addToHand" },
  });

  assert.deepEqual(result.errors, [
    {
      type: "invalidDecisionResponse",
      reason: "Life Trigger damage continuation is malformed.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assertRejectedHash(result, beforeHash);
  assert.deepEqual(result.state, before);
});

test("stale Double Attack Life Trigger continuation response fails closed without mutation", () => {
  const state = setupLeaderBattleWithDamageCount(2, { doubleAttack: true });
  const firstLife = installSupportedLifeTriggerOnLife(state, 0, "first");
  const opened = resolveSupportedVanillaBattle(state);
  const decision = must(opened.state.pendingDecision, "life trigger decision");
  const stale = structuredClone(opened.state);
  const player = must(stale.players[p2], "stale p2");
  stale.players[p2] = {
    ...player,
    hand: [
      {
        instanceId: firstLife.instanceId,
        cardId: firstLife.cardId,
        owner: p2,
        controller: p2,
        attachedDon: [],
        zone: { zone: "hand", playerId: p2, slot: "hand", index: 0 },
      },
      ...player.hand.map((card, index) => ({
        ...card,
        zone: {
          zone: "hand" as const,
          playerId: p2,
          slot: "hand" as const,
          index: index + 1,
        },
      })),
    ],
  };
  const before = structuredClone(stale);
  const beforeHash = hashCanonicalStateValue(stale);

  const result = applyAction(stale, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "lifeTrigger", choice: "addToHand" },
  });

  assert.deepEqual(result.errors, [
    {
      type: "invalidDecisionResponse",
      reason: "Life Trigger card is stale for current state.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assertRejectedHash(result, beforeHash);
  assert.deepEqual(result.state, before);
});

test("supported doubleAttack declareAttack against leader applies two damage points", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  const target = p2State.leader;
  installSupportedDoubleAttackLeader(state);
  const beforeLife = p2State.life.length;

  const result = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: target.instanceId,
      cardId: target.cardId,
      playerId: p2,
    },
  });

  assert.equal(result.errors, undefined);
  assertAcceptedHash(result);
  const nextP2 = must(result.state.players[p2], "p2");
  assert.equal(nextP2.life.length, beforeLife - 2);
  assert.equal(
    result.events.filter((event) => event.type === "damageDealt").length,
    2,
  );
});

test("conditional continuous doubleAttack grant applies two leader damage points", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const attacker = p1State.leader;
  addTrashMarker(state, p1);
  state.continuousEffects = [
    continuousKeywordEffectRecord(
      state,
      "conditional-double-attack-grant",
      attacker,
      "doubleAttack",
      {
        condition: { type: "trashCount", player: "self", op: "gte", value: 1 },
      },
    ),
  ];
  const beforeLife = p2State.life.length;

  const result = applyDeclareAttack(state, {
    type: "declareAttack",
    attacker: {
      instanceId: attacker.instanceId,
      cardId: attacker.cardId,
      playerId: p1,
    },
    target: {
      instanceId: p2State.leader.instanceId,
      cardId: p2State.leader.cardId,
      playerId: p2,
    },
  });

  assert.equal(result.errors, undefined);
  assertAcceptedHash(result);
  assert.equal(
    must(result.state.players[p2], "p2").life.length,
    beforeLife - 2,
  );
  assert.equal(
    result.events.filter((event) => event.type === "damageDealt").length,
    2,
  );
});

test("getLegalActions exposes supported doubleAttack declareAttack against leader", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  installSupportedDoubleAttackLeader(state);

  const legal = getLegalActions(state, p1);

  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === p1State.leader.instanceId &&
        action.target.instanceId === p2State.leader.instanceId,
    ),
    true,
  );
});

test("supported doubleAttack declareAttack with available blocker fails closed without mutation", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const blocker = must(p2State.characters[0], "p2 blocker");
  blocker.state = "active";
  state.cardManifest.cards[blocker.cardId] = {
    ...resolvedCard({
      cardId: blocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
  };
  installSupportedDoubleAttackLeader(state);
  const before = JSON.stringify(state);
  const beforeHash = hashCanonicalStateValue(state);

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

  assert.deepEqual(result.errors, [
    {
      type: "illegalAction",
      reason:
        "declareAttack requires unsupported blocker handling for Double Attack.",
    },
  ]);
  assert.deepEqual(result.events, []);
  assertRejectedHash(result, beforeHash);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(result.state), before);
});

test("getLegalActions omits supported doubleAttack leader attack when blocker handling is unsupported", () => {
  const state = setupAttackState();
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const blocker = must(p2State.characters[0], "p2 blocker");
  blocker.state = "active";
  state.cardManifest.cards[blocker.cardId] = {
    ...resolvedCard({
      cardId: blocker.cardId,
      category: "character",
      power: 3000,
    }),
    printedKeywords: ["blocker"],
  };
  installSupportedDoubleAttackLeader(state);

  const legal = getLegalActions(state, p1);

  assert.equal(
    legal.some(
      (action) =>
        action.type === "declareAttack" &&
        action.attacker.instanceId === p1State.leader.instanceId &&
        action.target.instanceId === p2State.leader.instanceId,
    ),
    false,
  );
});
