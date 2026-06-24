import assert from "node:assert/strict";
import { test } from "vitest";

import type { CardInstance, EffectDefinition } from "@optcg/types";

import {
  createActiveState,
  must,
  p1,
  p2,
  resolvedCard,
  reviewedMainEventDrawDefinition,
  reviewedOnPlayDrawDefinition,
  toEngineEventId,
  toStateSeq,
} from "./action-test-fixtures.js";
import {
  executeNoChoiceEffectPrimitive,
  processEffectRuntime,
} from "./effect-runtime.js";
import { applyAction } from "./actions.js";
import {
  cardRef,
  installSupportedCounterEvent,
  setupAttackState,
} from "./battle/test-fixtures.js";
import {
  queueDrawForP1,
  toCardId,
  toEffectId,
  toQueueEntryId,
  toTimingWindowId,
  withCardInZone,
} from "./effect-runtime-queue/test-support.js";

const setupLifeRemovedDefinition = (
  state: ReturnType<typeof createActiveState>,
): void => {
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  p1State.hand = p1State.hand.filter(
    (card) => card.instanceId !== source.instanceId,
  );
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-life-removed",
      rulesVersion: "life-removed-rules",
      sourceTextHash: "life-removed-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const definition: EffectDefinition = {
    ...baseDefinition,
    effects: [
      {
        ...must(baseDefinition.effects[0], "base draw effect"),
        id: toEffectId("life-removed-draw-lock"),
        trigger: { type: "lifeRemoved", players: ["self", "opponent"] },
        condition: { type: "yourTurn" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: { type: "draw", count: 1, player: "self" },
            },
            {
              connector: "then",
              effect: {
                type: "preventDraw",
                player: "self",
                source: "ownEffects",
                duration: { type: "thisTurn" },
              },
            },
          ],
        },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-life-removed": definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
};

const setupDelayedLifeMoveDefinition = (
  state: ReturnType<typeof createActiveState>,
) => {
  const leader = must(must(state.players[p1], "p1").leader, "leader");
  const supportCard = resolvedCard({
    cardId: leader.cardId,
    category: "leader",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-delayed-life-move",
      rulesVersion: "delayed-life-move-rules",
      sourceTextHash: "delayed-life-move-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    leader.cardId,
    supportCard.support,
  );
  const effectBlockId = toEffectId("delayed-life-move-sequence");
  const definition: EffectDefinition = {
    ...baseDefinition,
    effects: [
      {
        ...must(baseDefinition.effects[0], "base effect"),
        id: effectBlockId,
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "moveCards",
                count: 1,
                from: { player: "self", zone: "life", position: "top" },
                to: { player: "self", zone: "trash" },
                order: "original",
              },
            },
            {
              connector: "then",
              effect: { type: "drawUpTo", count: 1, player: "self" },
            },
          ],
        },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-delayed-life-move": definition,
  };
  state.cardManifest.cards[leader.cardId] = supportCard;
  return { effectBlockId, leader };
};

test("lifeRemoved reaction queues from Life movement and prevents later own-effect draws", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  state.eventJournal = [];
  setupLifeRemovedDefinition(state);
  const before = must(state.players[p1], "p1 before");
  const movedLife = must(before.life[0], "life card").card;
  state.eventJournal.push({
    id: toEngineEventId("event:life-removed:public"),
    seq: 1,
    type: "cardMoved",
    payload: {
      from: { zone: "life", playerId: p1, slot: "life", index: 0 },
      to: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
      reason: "moveCards",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "test:life-removed" },
    createdAtStateSeq: state.seq,
  });
  state.eventJournal.push({
    id: toEngineEventId("event:life-removed:private"),
    seq: 2,
    type: "cardMoved",
    payload: {
      instanceId: movedLife.instanceId,
      cardId: movedLife.cardId,
      from: { zone: "life", playerId: p1, slot: "life", index: 0 },
      to: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
      reason: "moveCards",
    },
    visibility: { type: "private", playerId: p1 },
    causedBy: { type: "ruleProcess", name: "test:life-removed" },
    createdAtStateSeq: state.seq,
  });

  const queued = processEffectRuntime(state);
  assert.equal(queued.errors, undefined);
  assert.equal(queued.state.effectQueue.length, 1);
  assert.equal(
    queued.events.map((event) => event.type).join(","),
    "effectQueued",
  );

  const resolved = processEffectRuntime(queued.state);
  assert.equal(resolved.errors, undefined);
  const afterResolved = must(resolved.state.players[p1], "p1 resolved");
  assert.equal(afterResolved.hand.length, before.hand.length + 1);
  assert.equal(
    resolved.state.continuousEffects.some(
      (effect) =>
        effect.modifier.layer === "restriction" &&
        effect.modifier.operation.type === "restriction" &&
        effect.modifier.operation.restriction === "cannotDrawByOwnEffects" &&
        effect.controller === p1,
    ),
    true,
  );

  const blockedDraw = executeNoChoiceEffectPrimitive(
    resolved.state,
    queueDrawForP1(),
    { type: "draw", count: 1, player: "self" },
  );
  assert.equal(blockedDraw.errors, undefined);
  assert.equal(
    must(blockedDraw.state.players[p1], "p1 after blocked draw").hand.length,
    afterResolved.hand.length,
  );
  assert.equal(
    must(blockedDraw.state.players[p2], "p2 unaffected").hand.length,
    must(resolved.state.players[p2], "p2 before unrelated").hand.length,
  );
});

test("lifeRemoved reaction queues from canonical moveCards after the moving effect resumes", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  state.eventJournal = [];
  setupLifeRemovedDefinition(state);
  const { effectBlockId, leader } = setupDelayedLifeMoveDefinition(state);
  const before = must(state.players[p1], "p1 before");
  const initialHandLength = before.hand.length;
  const topLife = must(before.life[0], "top life").card;
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-delayed-life-move"),
      timingWindowId: toTimingWindowId("timing-window-delayed-life-move"),
      controllerId: p1,
      source: {
        instanceId: leader.instanceId,
        cardId: leader.cardId,
        playerId: p1,
        zone: leader.zone,
      },
      sourceSnapshot: {
        instanceId: leader.instanceId,
        cardId: leader.cardId,
        ownerId: p1,
        controllerId: p1,
        zone: leader.zone,
        category: "leader",
        colors: ["red"],
        cost: 0,
        keywords: [],
      },
      effectBlockId,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "test:delayed-life-move" },
    },
  ];

  const pendingDrawChoice = processEffectRuntime(state);
  assert.equal(pendingDrawChoice.errors, undefined);
  assert.equal(pendingDrawChoice.state.pendingDecision?.type, "chooseQuantity");
  assert.equal(
    pendingDrawChoice.events.some(
      (event) =>
        event.type === "cardMoved" &&
        event.visibility.type === "public" &&
        JSON.stringify(event.payload).includes('"zone":"life"'),
    ),
    true,
  );
  assert.equal(
    must(pendingDrawChoice.state.players[p1], "p1 after move").trash[0]
      ?.instanceId,
    topLife.instanceId,
  );

  const drawChoice = must(
    pendingDrawChoice.state.pendingDecision,
    "draw choice",
  );
  const movedEffectResolved = applyAction(pendingDrawChoice.state, {
    type: "respondToDecision",
    decisionId: drawChoice.id,
    response: { type: "chooseQuantity", quantity: 0 },
  });
  assert.equal(movedEffectResolved.errors, undefined);
  assert.equal(movedEffectResolved.state.effectQueue.length, 0);
  assert.equal(movedEffectResolved.state.pendingDecision, undefined);
  assert.equal(
    movedEffectResolved.events.some((event) => {
      const causedBy = event.causedBy;
      return (
        event.type === "effectQueued" &&
        causedBy?.type === "ruleProcess" &&
        causedBy.name === "effectRuntime:eventReactionTriggerQueueing"
      );
    }),
    true,
  );
  assert.equal(
    must(movedEffectResolved.state.players[p1], "p1 after life removed trigger")
      .hand.length,
    initialHandLength + 1,
  );
  assert.equal(
    movedEffectResolved.state.continuousEffects.some(
      (effect) =>
        effect.modifier.layer === "restriction" &&
        effect.modifier.operation.type === "restriction" &&
        effect.modifier.operation.restriction === "cannotDrawByOwnEffects" &&
        effect.controller === p1,
    ),
    true,
  );
});

test("lifeRemoved reaction ignores movement before the source entered field", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  setupLifeRemovedDefinition(state);
  const source = must(
    must(state.players[p1], "p1").characters[0],
    "reaction source",
  );
  state.eventJournal = [
    {
      id: toEngineEventId("event:life-removed-before-source"),
      seq: 1,
      type: "cardMoved",
      payload: {
        from: { zone: "life", playerId: p1, slot: "life", index: 0 },
        to: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
        reason: "moveCards",
      },
      visibility: { type: "public" },
      causedBy: {
        type: "effect",
        queueEntryId: toQueueEntryId("queue-entry-before-source"),
        effectId: toEffectId("effect-before-source"),
      },
      createdAtStateSeq: toStateSeq(1),
    },
    {
      id: toEngineEventId("event:reaction-source-entered-after-life"),
      seq: 2,
      type: "cardPlayed",
      payload: {
        playerId: p1,
        instanceId: source.instanceId,
        cardId: source.cardId,
        category: "character",
      },
      visibility: { type: "public" },
      causedBy: { type: "ruleProcess", name: "test:source-entry" },
      createdAtStateSeq: toStateSeq(2),
    },
  ];
  state.seq = toStateSeq(10);

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(result.events.length, 0);
});

const installOpponentActivationRevealPowerDefinition = (
  state: ReturnType<typeof createActiveState>,
  source: CardInstance,
): void => {
  const p1State = must(state.players[p1], "p1");
  const topLife = must(p1State.life[0], "top life").card;
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-opponent-activation",
      rulesVersion: "opponent-activation-rules",
      sourceTextHash: "opponent-activation-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const definition: EffectDefinition = {
    ...baseDefinition,
    effects: [
      {
        ...must(baseDefinition.effects[0], "base draw effect"),
        id: toEffectId("opponent-activation-reveal-power"),
        trigger: {
          type: "opponentActivated",
          activations: ["event", "blocker"],
        },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "revealTop",
                player: "self",
                zone: "life",
                count: 1,
                min: 0,
                saveAs: "set:revealed-top-life" as never,
                visibility: "bothPlayers",
              },
            },
            {
              connector: "then",
              effect: {
                type: "modifyPower",
                target: { type: "self" },
                value: {
                  type: "sumSelectedCardCosts",
                  selection: "set:revealed-top-life" as never,
                  multiplier: 1000,
                },
                duration: { type: "thisTurn" },
              },
            },
          ],
        },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-opponent-activation": definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.cardManifest.cards[topLife.cardId] = resolvedCard({
    cardId: topLife.cardId,
    category: "character",
    cost: 4,
  });
  state.cardManifest.cards[toCardId("opponent-event")] = resolvedCard({
    cardId: toCardId("opponent-event"),
    category: "event",
  });
};

const setupOpponentActivationRevealPowerState = () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  state.eventJournal = [];
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  p1State.hand = p1State.hand.filter(
    (card) => card.instanceId !== source.instanceId,
  );
  installOpponentActivationRevealPowerDefinition(state, source);
  state.eventJournal.push({
    id: toEngineEventId("event:opponent-event-played"),
    seq: 1,
    type: "cardPlayed",
    payload: {
      playerId: p2,
      instanceId: "opponent-event-instance",
      cardId: "opponent-event",
      category: "event",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "test:opponent-event" },
    createdAtStateSeq: state.seq,
  });
  return { source, state };
};

const reviewedMainEventDrawUpToDefinition = (
  cardId: CardInstance["cardId"],
  support: ReturnType<typeof resolvedCard>["support"],
): EffectDefinition => {
  const base = reviewedMainEventDrawDefinition(cardId, support);
  return {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base main event effect"),
        effect: { type: "drawUpTo", count: 1, player: "self" },
      },
    ],
  };
};

test("opponent activation reaction can reveal Life and applies dynamic power from revealed cost", () => {
  const { source, state } = setupOpponentActivationRevealPowerState();
  const queued = processEffectRuntime(state);
  assert.equal(queued.errors, undefined);
  assert.equal(queued.state.effectQueue.length, 1);

  const paused = processEffectRuntime(queued.state);
  const decision = must(paused.state.pendingDecision, "reveal quantity");
  assert.equal(paused.errors, undefined);
  assert.equal(decision.type, "chooseQuantity");
  assert.equal(decision.min, 0);
  assert.equal(decision.max, 1);

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.revealedCards.length, 1);
  assert.equal(
    resolved.state.continuousEffects.some(
      (effect) =>
        effect.modifier.layer === "powerAdd" &&
        effect.modifier.operation.type === "addPower" &&
        effect.modifier.operation.value === 4000 &&
        effect.source.instanceId === source.instanceId,
    ),
    true,
  );
});

test("opponent activation reaction queues after the opponent Counter Event effect", () => {
  const state = setupAttackState();
  state.eventJournal = [];
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const source = must(p1State.characters[0], "reaction source");
  const counterEvent = must(p2State.hand[0], "counter event");
  installOpponentActivationRevealPowerDefinition(state, source);
  installSupportedCounterEvent(state, counterEvent, 2000);

  const opened = applyAction(state, {
    type: "declareAttack",
    attacker: cardRef(p1State.leader, p1),
    target: cardRef(p2State.leader, p2),
  });
  assert.equal(opened.errors, undefined);

  const countered = applyAction(opened.state, {
    type: "useCounter",
    cardInstanceId: counterEvent.instanceId,
    target: must(opened.state.battle, "battle").currentTarget,
  });
  assert.equal(countered.errors, undefined);
  assert.deepEqual(
    countered.events.map((event) => event.type),
    [
      "counterUsed",
      "spotlightEntryCreated",
      "cardMoved",
      "cardTrashed",
      "effectResolved",
      "effectQueued",
      "decisionCreated",
    ],
  );
  const reactionDecision = must(
    countered.state.pendingDecision,
    "reaction reveal",
  );
  assert.equal(reactionDecision.type, "chooseQuantity");
  assert.equal(reactionDecision.playerId, p1);

  const resumedCounter = applyAction(countered.state, {
    type: "respondToDecision",
    decisionId: reactionDecision.id,
    response: { type: "chooseQuantity", quantity: 0 },
  });

  assert.equal(resumedCounter.errors, undefined);
  const counterPass = must(
    resumedCounter.state.pendingDecision,
    "counter pass",
  );
  assert.equal(counterPass.type, "selectCards");
  assert.equal(counterPass.playerId, p2);
});

test("opponent activation reaction may choose zero revealed Life cards", () => {
  const { source, state } = setupOpponentActivationRevealPowerState();
  const queued = processEffectRuntime(state);
  assert.equal(queued.errors, undefined);

  const paused = processEffectRuntime(queued.state);
  const decision = must(paused.state.pendingDecision, "reveal quantity");
  assert.equal(paused.errors, undefined);
  assert.equal(decision.type, "chooseQuantity");

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "chooseQuantity", quantity: 0 },
  });
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.revealedCards.length, 0);
  assert.equal(
    resolved.state.eventJournal.some((event) => event.type === "cardRevealed"),
    false,
  );
  assert.equal(
    resolved.state.continuousEffects.some(
      (effect) =>
        effect.modifier.layer === "powerAdd" &&
        effect.modifier.operation.type === "addPower" &&
        effect.modifier.operation.value === 0 &&
        effect.source.instanceId === source.instanceId,
    ),
    true,
  );
});

test("blocker-only opponent activation reaction can win through composed Life-zero condition", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p2;
  state.eventJournal = [];
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  p2State.life = [];
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  p1State.hand = p1State.hand.filter(
    (card) => card.instanceId !== source.instanceId,
  );
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-blocker-activation-win",
      rulesVersion: "opponent-blocker-win-rules",
      sourceTextHash: "opponent-blocker-win-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const definition: EffectDefinition = {
    ...baseDefinition,
    effects: [
      {
        ...must(baseDefinition.effects[0], "base draw effect"),
        id: toEffectId("blocker-activation-win"),
        trigger: {
          type: "opponentActivated",
          activations: ["blocker"],
        },
        condition: {
          type: "or",
          conditions: [
            { type: "lifeCount", player: "self", op: "eq", value: 0 },
            { type: "lifeCount", player: "opponent", op: "eq", value: 0 },
          ],
        },
        effect: { type: "winGame", player: "self" },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-blocker-activation-win": definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.eventJournal.push({
    id: toEngineEventId("event:opponent-blocker-activated"),
    seq: 1,
    type: "blockerActivated",
    payload: { blocker: { playerId: p2 } },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "test:opponent-blocker" },
    createdAtStateSeq: state.seq,
  });

  const queued = processEffectRuntime(state);
  assert.equal(queued.errors, undefined);
  assert.equal(queued.state.effectQueue.length, 1);

  const resolved = processEffectRuntime(queued.state);

  assert.equal(resolved.errors, undefined);
  assert.deepEqual(resolved.state.status, { type: "completed", winner: p1 });
  assert.equal(
    resolved.events.some(
      (event) =>
        event.type === "gameEnded" &&
        (event.payload as { winner?: unknown }).winner === p1,
    ),
    true,
  );
});

test("blocker-only opponent activation win reaction skips when neither player has zero Life", () => {
  const state = createActiveState();
  state.turn.turnPlayerId = p2;
  state.eventJournal = [];
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  p1State.hand = p1State.hand.filter(
    (card) => card.instanceId !== source.instanceId,
  );
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-blocker-activation-win-skip",
      rulesVersion: "opponent-blocker-win-rules",
      sourceTextHash: "opponent-blocker-win-source",
    },
  });
  const baseDefinition = reviewedOnPlayDrawDefinition(
    source.cardId,
    supportCard.support,
  );
  const definition: EffectDefinition = {
    ...baseDefinition,
    effects: [
      {
        ...must(baseDefinition.effects[0], "base draw effect"),
        id: toEffectId("blocker-activation-win-skip"),
        trigger: {
          type: "opponentActivated",
          activations: ["blocker"],
        },
        condition: {
          type: "or",
          conditions: [
            { type: "lifeCount", player: "self", op: "eq", value: 0 },
            { type: "lifeCount", player: "opponent", op: "eq", value: 0 },
          ],
        },
        effect: { type: "winGame", player: "self" },
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    "def-blocker-activation-win-skip": definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  state.eventJournal.push({
    id: toEngineEventId("event:opponent-blocker-activated-skip"),
    seq: 1,
    type: "blockerActivated",
    payload: { blocker: { playerId: p2 } },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "test:opponent-blocker" },
    createdAtStateSeq: state.seq,
  });

  const queued = processEffectRuntime(state);
  assert.equal(queued.errors, undefined);
  assert.equal(queued.state.effectQueue.length, 1);

  const resolved = processEffectRuntime(queued.state);

  assert.equal(resolved.errors, undefined);
  assert.deepEqual(resolved.state.status, { type: "active" });
  assert.equal(resolved.state.effectQueue.length, 0);
  assert.equal(
    resolved.events.some((event) => event.type === "gameEnded"),
    false,
  );
});

test("opponent activation reaction ignores activations before the source entered field", () => {
  const { source, state } = setupOpponentActivationRevealPowerState();
  state.eventJournal.push({
    id: toEngineEventId("event:reaction-source-played-after-opponent-event"),
    seq: 2,
    type: "cardPlayed",
    payload: {
      playerId: p1,
      instanceId: source.instanceId,
      cardId: source.cardId,
      category: "character",
    },
    visibility: { type: "public" },
    causedBy: { type: "ruleProcess", name: "test:reaction-source-entry" },
    createdAtStateSeq: state.seq,
  });

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.events.length, 0);
});

test("opponent activation reaction ignores stale activation events after their timing window", () => {
  const { source, state } = setupOpponentActivationRevealPowerState();
  state.eventJournal = [
    {
      id: toEngineEventId("event:reaction-source-entry"),
      seq: 1,
      type: "cardPlayed",
      payload: {
        playerId: p1,
        instanceId: source.instanceId,
        cardId: source.cardId,
        category: "character",
      },
      visibility: { type: "public" },
      causedBy: { type: "ruleProcess", name: "test:reaction-source-entry" },
      createdAtStateSeq: toStateSeq(1),
    },
    {
      id: toEngineEventId("event:stale-opponent-event-played"),
      seq: 2,
      type: "cardPlayed",
      payload: {
        playerId: p2,
        instanceId: "opponent-event-instance",
        cardId: "opponent-event",
        category: "event",
      },
      visibility: { type: "public" },
      causedBy: { type: "ruleProcess", name: "test:stale-opponent-event" },
      createdAtStateSeq: toStateSeq(2),
    },
  ];
  state.seq = toStateSeq(10);

  const result = processEffectRuntime(state);

  assert.equal(result.errors, undefined);
  assert.equal(result.state.effectQueue.length, 0);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(result.events.length, 0);
});

test("opponent activation reaction queues after the opponent Event main effect", () => {
  const { source, state } = setupOpponentActivationRevealPowerState();
  state.eventJournal = [];
  state.turn.turnPlayerId = p2;
  state.turn.phase = "main";
  const p1State = must(state.players[p1], "p1");
  p1State.hand = p1State.hand.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  const p2State = must(state.players[p2], "p2");
  const eventCard = must(p2State.hand[0], "event");
  const extraDeckCard = must(p2State.hand[1], "extra deck card");
  p2State.hand = p2State.hand
    .filter((card) => card.instanceId !== extraDeckCard.instanceId)
    .map((card, index) => ({
      ...card,
      zone: { zone: "hand", playerId: p2, slot: "hand", index },
    }));
  p2State.deck = [
    ...p2State.deck,
    {
      ...extraDeckCard,
      zone: {
        zone: "deck",
        playerId: p2,
        slot: "deck",
        index: p2State.deck.length,
      },
    },
  ];
  const eventSupport = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 0,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-opponent-main-event",
      rulesVersion: "opponent-main-event-rules",
      sourceTextHash: "opponent-main-event-source",
    },
  });
  const eventDefinition = reviewedMainEventDrawDefinition(
    eventCard.cardId,
    eventSupport.support,
  );
  state.cardManifest.cards[eventCard.cardId] = eventSupport;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-opponent-main-event": eventDefinition,
  };

  const played = applyAction(state, {
    type: "playCard",
    cardInstanceId: eventCard.instanceId,
  });

  assert.equal(played.errors, undefined);
  assert.equal(
    played.events.some((event) => event.type === "effectResolved"),
    true,
  );
  assert.equal(
    played.events.some((event) => event.type === "cardDrawn"),
    true,
  );
  const decision = must(played.state.pendingDecision, "reaction reveal");
  assert.equal(decision.type, "chooseQuantity");

  const resolved = applyAction(played.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(
    resolved.state.continuousEffects.some(
      (effect) =>
        effect.modifier.layer === "powerAdd" &&
        effect.modifier.operation.type === "addPower" &&
        effect.modifier.operation.value === 4000 &&
        effect.source.instanceId === source.instanceId,
    ),
    true,
  );
});

test("opponent activation reaction queues after a decision-paused opponent Event main effect", () => {
  const { source, state } = setupOpponentActivationRevealPowerState();
  state.eventJournal = [];
  state.turn.turnPlayerId = p2;
  state.turn.phase = "main";
  const p1State = must(state.players[p1], "p1");
  p1State.hand = p1State.hand.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));
  const p2State = must(state.players[p2], "p2");
  const eventCard = must(p2State.hand[0], "event");
  const extraDeckCard = must(p2State.hand[1], "extra deck card");
  p2State.hand = p2State.hand
    .filter((card) => card.instanceId !== extraDeckCard.instanceId)
    .map((card, index) => ({
      ...card,
      zone: { zone: "hand", playerId: p2, slot: "hand", index },
    }));
  p2State.deck = [
    ...p2State.deck,
    {
      ...extraDeckCard,
      zone: {
        zone: "deck",
        playerId: p2,
        slot: "deck",
        index: p2State.deck.length,
      },
    },
  ];
  const eventSupport = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 0,
    support: {
      status: "implemented-dsl",
      effectDefinitionId: "def-opponent-main-event-draw-upto",
      rulesVersion: "opponent-main-event-draw-upto-rules",
      sourceTextHash: "opponent-main-event-draw-upto-source",
    },
  });
  const eventDefinition = reviewedMainEventDrawUpToDefinition(
    eventCard.cardId,
    eventSupport.support,
  );
  state.cardManifest.cards[eventCard.cardId] = eventSupport;
  state.cardManifest.effectDefinitions = {
    ...state.cardManifest.effectDefinitions,
    "def-opponent-main-event-draw-upto": eventDefinition,
  };

  const played = applyAction(state, {
    type: "playCard",
    cardInstanceId: eventCard.instanceId,
  });

  assert.equal(played.errors, undefined);
  const eventDecision = must(played.state.pendingDecision, "event draw up to");
  assert.equal(eventDecision.type, "chooseQuantity");
  assert.equal(eventDecision.playerId, p2);

  const eventResolved = applyAction(played.state, {
    type: "respondToDecision",
    decisionId: eventDecision.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });

  assert.equal(eventResolved.errors, undefined);
  assert.equal(
    eventResolved.events.some((event) => event.type === "cardDrawn"),
    true,
  );
  const reactionDecision = must(
    eventResolved.state.pendingDecision,
    "reaction reveal",
  );
  assert.equal(reactionDecision.type, "chooseQuantity");
  assert.equal(reactionDecision.playerId, p1);

  const reactionResolved = applyAction(eventResolved.state, {
    type: "respondToDecision",
    decisionId: reactionDecision.id,
    response: { type: "chooseQuantity", quantity: 1 },
  });

  assert.equal(reactionResolved.errors, undefined);
  assert.equal(
    reactionResolved.state.continuousEffects.some(
      (effect) =>
        effect.modifier.layer === "powerAdd" &&
        effect.modifier.operation.type === "addPower" &&
        effect.modifier.operation.value === 4000 &&
        effect.source.instanceId === source.instanceId,
    ),
    true,
  );
});
