import assert from "node:assert/strict";
import { test } from "vitest";

import type { EffectDefinition } from "@optcg/types";

import {
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
  executeNoChoiceEffectPrimitive,
  processEffectRuntime,
} from "./effect-runtime.js";
import { applyAction } from "./actions.js";
import {
  queueDrawForP1,
  toCardId,
  toEffectId,
  withCardInZone,
} from "./effect-runtime-queue-processing-test-support.js";

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
