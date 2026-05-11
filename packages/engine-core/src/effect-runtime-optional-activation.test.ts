import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  CardInstance,
  EffectDefinition,
  EffectQueueEntry,
  EngineEvent,
  ResolvedCard,
} from "@optcg/types";

import { hashCanonicalStateValue } from "./canonical-state.js";
import {
  addExtraDeckCard,
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedMainEventDrawDefinition,
  reviewedOnPlayDrawDefinition,
  toEngineEventId,
} from "./action-test-fixtures.js";
import {
  processDefenderOpponentAttackTiming,
  processEffectRuntime,
  queueBattleKOTriggers,
} from "./effect-runtime.js";
import {
  attackQueueingState,
  opponentAttackQueueingState,
} from "./effect-runtime-trigger-queueing-test-support.js";
import {
  applyAction,
  queueDrawForP1,
  queuedEffect,
  toCardId,
  toEffectId,
  toInstanceId,
  toQueueEntryId,
  toSourceSnapshot,
  toStateSeq,
  toTimingWindowId,
  withCardInZone,
} from "./effect-runtime-queue-processing-test-support.js";
import { setupMainPlayState } from "./play-card-test-fixtures.js";

const installDefinition = (
  state: ReturnType<typeof createActiveState>,
  card: CardInstance,
  definition: EffectDefinition,
  category: ResolvedCard["category"] = "character",
  effectDefinitionId = `def-${String(card.cardId)}`,
): void => {
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[card.cardId] = resolvedCard({
    cardId: card.cardId,
    category,
    ...(category === "event" || category === "character" ? { cost: 0 } : {}),
    ...(category === "leader" || category === "character"
      ? { power: 5000 }
      : {}),
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: definition.metadata.rulesVersion,
      sourceTextHash: definition.metadata.sourceTextHash,
    },
  });
};

const optionalDefinition = (
  cardId: EffectDefinition["cardId"],
  support: ResolvedCard["support"],
  trigger: EffectDefinition["effects"][number]["trigger"],
  sourcePresencePolicy: EffectDefinition["effects"][number]["sourcePresencePolicy"] = "mustRemainInSameZone",
): EffectDefinition => {
  const base = reviewedOnPlayDrawDefinition(cardId, support);
  const baseEffect = must(base.effects[0], "base effect");
  return {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: `${String(cardId)}:optional:${trigger.type}` as typeof baseEffect.id,
        trigger,
        optional: true,
        sourcePresencePolicy,
      },
    ],
  };
};

const optionalMainDefinition = (
  cardId: EffectDefinition["cardId"],
  support: ResolvedCard["support"],
): EffectDefinition => {
  const base = reviewedMainEventDrawDefinition(cardId, support);
  const baseEffect = must(base.effects[0], "base main effect");
  return {
    ...base,
    effects: [{ ...baseEffect, optional: true }],
  };
};

const optionalThenRequiredDrawState = (): {
  state: ReturnType<typeof createActiveState>;
  optionalEntry: EffectQueueEntry;
  requiredEntry: EffectQueueEntry;
} => {
  const state = createActiveState();
  addExtraDeckCard(state, p1);
  addExtraDeckCard(state, p1);
  const p1State = must(state.players[p1], "p1");
  const source = p1State.leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base draw effect");
  const optionalEffect = {
    ...baseEffect,
    id: toEffectId("optional-decline-effect"),
    optional: true,
  };
  const requiredEffect = {
    ...baseEffect,
    id: toEffectId("required-followup-effect"),
  };
  installDefinition(
    state,
    source,
    {
      ...base,
      effects: [optionalEffect, requiredEffect],
    },
    "leader",
    "def-optional-decline",
  );

  const common = {
    source: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId: p1,
      zone: source.zone,
    },
    sourceSnapshot: toSourceSnapshot(source, p1, p1),
    sourcePresencePolicy: must(
      baseEffect.sourcePresencePolicy,
      "source presence policy",
    ),
    queuedAtStateSeq: toStateSeq(state.seq),
  } satisfies Pick<
    EffectQueueEntry,
    "source" | "sourceSnapshot" | "sourcePresencePolicy" | "queuedAtStateSeq"
  >;
  const optionalEntry: EffectQueueEntry = {
    ...queueDrawForP1(),
    ...common,
    id: toQueueEntryId("queue-entry-optional-decline"),
    timingWindowId: toTimingWindowId("timing-window-optional-decline"),
    generation: 0,
    effectBlockId: optionalEffect.id,
    createdAtEventSeq: 1,
  };
  const requiredEntry: EffectQueueEntry = {
    ...queueDrawForP1(),
    ...common,
    id: toQueueEntryId("queue-entry-required-after-decline"),
    timingWindowId: optionalEntry.timingWindowId,
    generation: 1,
    effectBlockId: requiredEffect.id,
    createdAtEventSeq: 2,
  };
  state.effectQueue = [optionalEntry, requiredEntry];
  return { state, optionalEntry, requiredEntry };
};

const assertOptionalDecision = (
  result: ReturnType<typeof processEffectRuntime>,
  entry: EffectQueueEntry,
): void => {
  const decision = must(result.state.pendingDecision, "optional decision");
  const decisionCreated = result.events.find(
    (event) => event.type === "decisionCreated",
  );

  assert.equal(result.errors, undefined);
  assert.equal(decision.type, "chooseOptionalActivation");
  assert.equal(decision.playerId, entry.controllerId);
  assert.equal(decision.effectId, entry.effectBlockId);
  assert.deepEqual(decision.source, entry.source);
  assert.deepEqual(decision.options, ["activate", "decline"]);
  assert.deepEqual(decision.visibility, {
    type: "private",
    playerId: entry.controllerId,
  });
  assert.deepEqual(decision.causedBy, {
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  });
  assert.deepEqual(result.state.effectQueue, [entry]);
  assert.equal(
    result.events.some((event) => event.type === "effectResolved"),
    false,
  );
  assert.equal(
    result.events.filter((event) => event.type === "decisionCreated").length,
    1,
  );
  assert.ok(decisionCreated !== undefined);
  assert.deepEqual(decisionCreated.visibility, {
    type: "private",
    playerId: entry.controllerId,
  });
  assert.deepEqual(decisionCreated.causedBy, decision.causedBy);
  assert.deepEqual(decisionCreated.payload, {
    decisionId: decision.id,
    decisionType: "chooseOptionalActivation",
    playerId: entry.controllerId,
  });
};

const processQueuedOptional = (
  state: ReturnType<typeof createActiveState>,
): ReturnType<typeof processEffectRuntime> => {
  const queued = processEffectRuntime(state);
  assert.equal(queued.errors, undefined);
  assert.deepEqual(
    queued.events.map((event) => event.type),
    ["effectQueued"],
  );
  return processEffectRuntime(queued.state);
};

const eventPayloadHasQueueEntryId = (
  event: EngineEvent,
  queueEntryId: EffectQueueEntry["id"],
): boolean =>
  typeof event.payload === "object" &&
  event.payload !== null &&
  "queueEntryId" in event.payload &&
  event.payload.queueEntryId === queueEntryId;

test("declining optional activation skips that queue entry and resumes later runtime work", () => {
  const { state, optionalEntry, requiredEntry } =
    optionalThenRequiredDrawState();
  const p1State = must(state.players[p1], "p1");
  const beforeHandCount = p1State.hand.length;
  const beforeDeckCount = p1State.deck.length;
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "optional decision");

  const declined = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "optionalActivation", choice: "decline" },
  });
  const replay = applyAction(structuredClone(paused.state), {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "optionalActivation", choice: "decline" },
  });
  const resultP1 = must(declined.state.players[p1], "declined p1");

  assert.equal(declined.errors, undefined);
  assert.equal(declined.state.pendingDecision, undefined);
  assert.deepEqual(declined.state.effectQueue, []);
  assert.equal(resultP1.hand.length, beforeHandCount + 1);
  assert.equal(resultP1.deck.length, beforeDeckCount - 1);
  assert.deepEqual(
    declined.events.map((event) => event.type),
    [
      "decisionResolved",
      "cardDrawn",
      "cardMoved",
      "cardMoved",
      "effectResolved",
      "ruleProcessingChecked",
    ],
  );
  assert.deepEqual(declined.events[0]?.payload, {
    decisionId: decision.id,
    decisionType: "chooseOptionalActivation",
    playerId: p1,
    responseType: "optionalActivation",
  });
  assert.equal(
    declined.events.some(
      (event) =>
        event.type === "effectResolved" &&
        eventPayloadHasQueueEntryId(event, optionalEntry.id),
    ),
    false,
  );
  assert.equal(
    declined.events.some(
      (event) =>
        event.type === "effectResolved" &&
        eventPayloadHasQueueEntryId(event, requiredEntry.id),
    ),
    true,
  );
  assert.equal(declined.stateHash, hashCanonicalStateValue(declined.state));
  assert.deepEqual(declined.events, replay.events);
  assert.equal(declined.stateHash, replay.stateHash);
});

test("optional activation decline of a lone effect clears the decision without resolving the effect", () => {
  const { state, optionalEntry } = optionalThenRequiredDrawState();
  state.effectQueue = [optionalEntry];
  const p1State = must(state.players[p1], "p1");
  const beforeHandCount = p1State.hand.length;
  const beforeDeckCount = p1State.deck.length;
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "optional decision");

  const declined = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "optionalActivation", choice: "decline" },
  });

  assert.equal(declined.errors, undefined);
  assert.equal(declined.state.pendingDecision, undefined);
  assert.deepEqual(declined.state.effectQueue, []);
  assert.equal(
    must(declined.state.players[p1], "declined p1").hand.length,
    beforeHandCount,
  );
  assert.equal(
    must(declined.state.players[p1], "declined p1").deck.length,
    beforeDeckCount,
  );
  assert.deepEqual(
    declined.events.map((event) => event.type),
    ["decisionResolved"],
  );
  assert.equal(
    declined.events.some((event) => event.type === "effectResolved"),
    false,
  );
  assert.equal(declined.stateHash, hashCanonicalStateValue(declined.state));
});

test("optional activation accept resumes prior trigger order group without re-prompting", () => {
  const { state, optionalEntry, requiredEntry } =
    optionalThenRequiredDrawState();
  const sameGroupRequiredEntry: EffectQueueEntry = {
    ...requiredEntry,
    generation: optionalEntry.generation,
  };
  state.effectQueue = [optionalEntry, sameGroupRequiredEntry];
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
      ids: [optionalEntry.id, sameGroupRequiredEntry.id],
    },
  });
  const optionalDecision = must(
    orderedOptionalFirst.state.pendingDecision,
    "optional decision",
  );
  assert.equal(optionalDecision.type, "chooseOptionalActivation");

  const accepted = applyAction(orderedOptionalFirst.state, {
    type: "respondToDecision",
    decisionId: optionalDecision.id,
    response: { type: "optionalActivation", choice: "activate" },
  });

  assert.equal(accepted.errors, undefined);
  assert.equal(accepted.state.pendingDecision, undefined);
  assert.deepEqual(accepted.state.effectQueue, []);
  assert.equal(
    accepted.events.some((event) => event.type === "decisionCreated"),
    false,
  );
  assert.equal(
    accepted.events.some(
      (event) =>
        event.type === "effectResolved" &&
        eventPayloadHasQueueEntryId(event, optionalEntry.id),
    ),
    true,
  );
  assert.equal(
    accepted.events.some(
      (event) =>
        event.type === "effectResolved" &&
        eventPayloadHasQueueEntryId(event, sameGroupRequiredEntry.id),
    ),
    true,
  );
  assert.equal(accepted.stateHash, hashCanonicalStateValue(accepted.state));
});

test("optional activation accept resolves single ordered entry before later trigger-order groups", () => {
  const { state, optionalEntry, requiredEntry } =
    optionalThenRequiredDrawState();
  const firstRequiredEntry: EffectQueueEntry = {
    ...requiredEntry,
    id: toQueueEntryId("queue-entry-required-before-optional"),
    generation: optionalEntry.generation,
    createdAtEventSeq: 0,
  };
  const laterEntryA: EffectQueueEntry = {
    ...requiredEntry,
    id: toQueueEntryId("queue-entry-later-choice-a"),
    timingWindowId: toTimingWindowId("timing-window-later-choice"),
    generation: 0,
    createdAtEventSeq: 20,
  };
  const laterEntryB: EffectQueueEntry = {
    ...requiredEntry,
    id: toQueueEntryId("queue-entry-later-choice-b"),
    timingWindowId: laterEntryA.timingWindowId,
    generation: laterEntryA.generation,
    createdAtEventSeq: 21,
  };
  state.effectQueue = [
    firstRequiredEntry,
    optionalEntry,
    laterEntryA,
    laterEntryB,
  ];

  const ordered = processEffectRuntime(state);
  const triggerOrderDecision = must(
    ordered.state.pendingDecision,
    "first trigger order decision",
  );
  assert.equal(triggerOrderDecision.type, "chooseTriggerOrder");
  const orderedOptionalSecond = applyAction(ordered.state, {
    type: "respondToDecision",
    decisionId: triggerOrderDecision.id,
    response: {
      type: "orderedIds",
      ids: [firstRequiredEntry.id, optionalEntry.id],
    },
  });
  const optionalDecision = must(
    orderedOptionalSecond.state.pendingDecision,
    "optional decision",
  );
  assert.equal(optionalDecision.type, "chooseOptionalActivation");
  assert.deepEqual(
    orderedOptionalSecond.state.effectQueue.map((entry) => entry.id),
    [optionalEntry.id, laterEntryA.id, laterEntryB.id],
  );

  const accepted = applyAction(orderedOptionalSecond.state, {
    type: "respondToDecision",
    decisionId: optionalDecision.id,
    response: { type: "optionalActivation", choice: "activate" },
  });

  assert.equal(accepted.errors, undefined);
  const laterTriggerOrderDecision = must(
    accepted.state.pendingDecision,
    "later trigger order decision",
  );
  assert.equal(laterTriggerOrderDecision.type, "chooseTriggerOrder");
  assert.deepEqual(laterTriggerOrderDecision.triggerIds, [
    laterEntryA.id,
    laterEntryB.id,
  ]);
  assert.deepEqual(
    accepted.state.effectQueue.map((entry) => entry.id),
    [laterEntryA.id, laterEntryB.id],
  );
  assert.equal(
    accepted.events.some(
      (event) =>
        event.type === "effectResolved" &&
        eventPayloadHasQueueEntryId(event, optionalEntry.id),
    ),
    true,
  );
  assert.equal(accepted.stateHash, hashCanonicalStateValue(accepted.state));
});

test("optional activation rejects non optionalActivation responses", () => {
  const { state } = optionalThenRequiredDrawState();
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "optional decision");

  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "orderedIds", ids: [] },
  });

  assert.deepEqual(result.state, paused.state);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "invalidDecisionResponse",
      reason:
        "Response type must be optionalActivation for chooseOptionalActivation.",
    },
  ]);
});

test("optional activation rejects malformed optionalActivation choices without mutation", () => {
  const { state } = optionalThenRequiredDrawState();
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "optional decision");
  const malformed = {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "optionalActivation", choice: "bogus" },
  } as unknown as Action;

  const result = applyAction(paused.state, malformed);

  assert.deepEqual(result.state, paused.state);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.errors, [
    {
      type: "invalidDecisionResponse",
      reason: "optionalActivation choice must be activate or decline.",
    },
  ]);
  assert.equal(result.stateHash, hashCanonicalStateValue(result.state));
});

test("direct queued optional no-choice draw creates private chooseOptionalActivation without resolving", () => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const source = p1State.leader;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "leader",
  });
  const definition = optionalDefinition(source.cardId, supportCard.support, {
    type: "onPlay",
  });
  const effect = must(definition.effects[0], "optional effect");
  installDefinition(state, source, definition, "leader", "def-direct-optional");
  const entry: EffectQueueEntry = {
    ...queueDrawForP1(),
    id: toQueueEntryId("queue-entry-direct-optional"),
    timingWindowId: toTimingWindowId("timing-window-direct-optional"),
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
      "direct source presence policy",
    ),
    queuedAtStateSeq: toStateSeq(state.seq),
  };
  state.effectQueue = [entry];
  const beforeP1 = structuredClone(p1State);
  const beforeSeq = state.seq;
  const beforeJournalLength = state.eventJournal.length;

  const first = processEffectRuntime(structuredClone(state));
  const second = processEffectRuntime(structuredClone(state));

  assertOptionalDecision(first, entry);
  assert.deepEqual(must(first.state.players[p1], "p1 result"), beforeP1);
  assert.equal(first.state.seq, toStateSeq(beforeSeq + 1));
  assert.deepEqual(
    first.state.eventJournal.slice(beforeJournalLength),
    first.events,
  );
  assert.equal(first.stateHash, hashCanonicalStateValue(first.state));
  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.state.pendingDecision, second.state.pendingDecision);
  assert.equal(first.stateHash, second.stateHash);
});

test("optional On Play queueing reaches chooseOptionalActivation", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "on-play source");
  const played = withCardInZone({
    state,
    playerId: p1,
    card: source,
    zone: "characterArea",
  });
  state.eventJournal.push({
    id: toEngineEventId(`event:${String(state.seq)}:1:cardPlayed`),
    seq: state.eventJournal.length + 1,
    type: "cardPlayed",
    payload: {
      playerId: p1,
      instanceId: played.instanceId,
      cardId: played.cardId,
      category: "character",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "optional-test" },
    createdAtStateSeq: state.seq,
  });
  const supportCard = resolvedCard({
    cardId: played.cardId,
    category: "character",
  });
  installDefinition(
    state,
    played,
    optionalDefinition(played.cardId, supportCard.support, { type: "onPlay" }),
    "character",
    "def-optional-on-play",
  );

  const result = processQueuedOptional(state);
  const entry = must(result.state.effectQueue[0], "queued optional");

  assertOptionalDecision(result, entry);
});

test("optional Main Event queueing reaches chooseOptionalActivation", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "event source");
  const eventInTrash: CardInstance = {
    ...source,
    zone: { zone: "trash", playerId: p1, slot: "trash", index: 0 },
  };
  p1State.hand = p1State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  p1State.trash = [eventInTrash];
  state.eventJournal.push({
    id: toEngineEventId(`event:${String(state.seq)}:1:cardPlayed`),
    seq: state.eventJournal.length + 1,
    type: "cardPlayed",
    payload: {
      playerId: p1,
      instanceId: eventInTrash.instanceId,
      cardId: eventInTrash.cardId,
      category: "event",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "optional-test" },
    createdAtStateSeq: state.seq,
  });
  const supportCard = resolvedCard({
    cardId: eventInTrash.cardId,
    category: "event",
    cost: 0,
  });
  installDefinition(
    state,
    eventInTrash,
    optionalMainDefinition(eventInTrash.cardId, supportCard.support),
    "event",
    "def-optional-main",
  );

  const result = processQueuedOptional(state);
  const entry = must(result.state.effectQueue[0], "queued optional");

  assertOptionalDecision(result, entry);
});

test("production playCard path supports optional On Play decision creation", () => {
  const state = setupMainPlayState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "optional on-play hand card");
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    cost: 0,
  });
  installDefinition(
    state,
    source,
    optionalDefinition(source.cardId, supportCard.support, { type: "onPlay" }),
    "character",
    "def-production-optional-on-play",
  );

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: source.instanceId,
  });
  const entry = must(result.state.effectQueue[0], "queued optional on-play");

  assert.equal(result.errors, undefined);
  assertOptionalDecision(result, entry);
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "cardRevealed",
      "cardMoved",
      "cardPlayed",
      "ruleProcessingChecked",
      "effectQueued",
      "decisionCreated",
    ],
  );
});

test("production playCard path supports optional Main Event decision creation", () => {
  const state = setupMainPlayState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.hand[0], "optional main event hand card");
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "event",
    cost: 0,
  });
  installDefinition(
    state,
    source,
    optionalMainDefinition(source.cardId, supportCard.support),
    "event",
    "def-production-optional-main",
  );

  const result = applyAction(state, {
    type: "playCard",
    cardInstanceId: source.instanceId,
  });
  const entry = must(result.state.effectQueue[0], "queued optional main event");

  assert.equal(result.errors, undefined);
  assertOptionalDecision(result, entry);
  assert.deepEqual(
    result.events.map((event) => event.type),
    [
      "cardRevealed",
      "cardMoved",
      "cardTrashed",
      "cardPlayed",
      "ruleProcessingChecked",
      "effectQueued",
      "decisionCreated",
    ],
  );
});

test("optional When Attacking queueing reaches chooseOptionalActivation", () => {
  const { state, attacker } = attackQueueingState();
  const supportCard = resolvedCard({
    cardId: attacker.cardId,
    category: "character",
  });
  installDefinition(
    state,
    attacker,
    optionalDefinition(attacker.cardId, supportCard.support, {
      type: "whenAttacking",
    }),
    "character",
    "def-optional-when-attacking",
  );

  const result = processQueuedOptional(state);
  const entry = must(result.state.effectQueue[0], "queued optional");

  assertOptionalDecision(result, entry);
});

test("optional On Opponent Attack queueing reaches chooseOptionalActivation", () => {
  const { state, target } = opponentAttackQueueingState();
  const supportCard = resolvedCard({
    cardId: target.cardId,
    category: "leader",
  });
  installDefinition(
    state,
    target,
    optionalDefinition(target.cardId, supportCard.support, {
      type: "onOpponentAttack",
    }),
    "leader",
    "def-optional-on-opponent-attack",
  );

  const result = processDefenderOpponentAttackTiming(state);
  const entry = must(result.state.effectQueue[0], "queued optional");

  assertOptionalDecision(result, entry);
});

test("optional On K.O. queueing reaches chooseOptionalActivation", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p2State = must(state.players[p2], "p2");
  const source = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "K.O. source"),
    zone: "characterArea",
  });
  p2State.hand = p2State.hand.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p2, slot: "hand", index },
  }));
  const trashed: CardInstance = {
    ...source,
    zone: { zone: "trash", playerId: p2, slot: "trash", index: 0 },
  };
  p2State.characters = [];
  p2State.trash = [trashed];
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
  });
  installDefinition(
    state,
    trashed,
    optionalDefinition(
      source.cardId,
      supportCard.support,
      { type: "onKO" },
      "resolveFromDestinationZone",
    ),
    "character",
    "def-optional-on-ko",
  );
  const koEvent: EngineEvent = {
    id: toEngineEventId("event:optional:on-ko"),
    seq: state.eventJournal.length + 1,
    type: "cardKOd",
    payload: { playerId: p2, instanceId: source.instanceId },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "optional-test" },
    createdAtStateSeq: state.seq,
  };
  const movedEvent: EngineEvent = {
    id: toEngineEventId("event:optional:on-ko:moved"),
    seq: state.eventJournal.length + 2,
    type: "cardMoved",
    payload: {
      instanceId: source.instanceId,
      cardId: source.cardId,
      from: source.zone,
      to: trashed.zone,
      reason: "ko",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "optional-test" },
    createdAtStateSeq: state.seq,
  };
  const events = [koEvent, movedEvent];
  const queued = queueBattleKOTriggers(state, state, events);
  assert.equal(queued.ok, true);

  const result = processEffectRuntime(queued.state);
  const entry = must(result.state.effectQueue[0], "queued optional");

  assertOptionalDecision(result, entry);
});

test("optional life-trigger no-choice draw fails closed instead of creating optional decision", () => {
  const state = createActiveState();
  const cardId = toCardId("optional-life-trigger-card");
  const source = must(state.players[p1], "p1").leader;
  const supportCard = resolvedCard({ cardId, category: "event" });
  const definition = optionalDefinition(
    cardId,
    supportCard.support,
    { type: "trigger" },
    "noSourceRequired",
  );
  const effect = must(definition.effects[0], "optional life effect");
  installDefinition(
    state,
    { ...source, cardId },
    definition,
    "event",
    "def-optional-life-trigger",
  );
  state.effectQueue = [
    {
      ...queuedEffect(cardId),
      source: {
        instanceId: toInstanceId("optional-life-instance"),
        cardId,
        playerId: p1,
        zone: { zone: "life", playerId: p1, slot: "life", index: 0 },
      },
      sourceSnapshot: {
        ...queuedEffect(cardId).sourceSnapshot,
        instanceId: toInstanceId("optional-life-instance"),
        cardId,
      },
      effectBlockId: effect.id,
      sourcePresencePolicy: must(
        effect.sourcePresencePolicy,
        "life source presence policy",
      ),
    },
  ];
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "unsupported-effect-queue",
      details: {
        reason: "unsupported-pending-runtime-work",
        kind: "effectQueue",
        count: 1,
      },
    },
  ]);
});

test("optional custom effect-resolved no-choice draw fails closed instead of creating optional decision", () => {
  const state = createActiveState();
  const cardId = toCardId("optional-custom-card");
  const source = must(state.players[p1], "p1").leader;
  const supportCard = resolvedCard({ cardId, category: "leader" });
  const definition = optionalDefinition(
    cardId,
    supportCard.support,
    { type: "custom", event: "effectResolved:source" },
    "mustRemainInSameZone",
  );
  const effect = must(definition.effects[0], "optional custom effect");
  installDefinition(
    state,
    { ...source, cardId },
    definition,
    "leader",
    "def-optional-custom",
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      source: {
        instanceId: source.instanceId,
        cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: { ...toSourceSnapshot(source, p1, p1), cardId },
      effectBlockId: effect.id,
      sourcePresencePolicy: must(
        effect.sourcePresencePolicy,
        "custom source presence policy",
      ),
      causedBy: {
        type: "effect",
        queueEntryId: toQueueEntryId("resolved-source"),
        effectId: toEffectId("source"),
      },
    },
  ];
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.events, []);
  assert.deepEqual(result.state, before);
  assert.deepEqual(result.errors, [
    {
      type: "effectRuntimeError",
      effectId: "unsupported-effect-queue",
      details: {
        reason: "unsupported-pending-runtime-work",
        kind: "effectQueue",
        count: 1,
      },
    },
  ]);
});
