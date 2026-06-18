import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  EngineEvent,
  GameState,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  filterStateForPlayer,
  getLegalActions,
  must,
  p1,
  p2,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "./effect-runtime-queue/test-support.js";

const reindexHand = (
  cards: readonly CardInstance[],
  playerId = p1,
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId, slot: "hand", index },
  }));

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-life-visibility-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "life-visibility-sequence-rules",
      sourceTextHash: "life-visibility-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-life-visibility-sequence"),
        effect,
      },
    ],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = {
    [effectDefinitionId]: definition,
  };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const sequenceQueueState = (
  effect: Extract<Effect, { type: "sequence" }>,
): { state: GameState; definition: EffectDefinition } => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const remainingHand = p1State.hand.slice(1);
  const secondDrawCard = must(
    remainingHand[remainingHand.length - 1],
    "deck refill",
  );
  p1State.hand = reindexHand(remainingHand.slice(0, -1));
  p1State.deck = [
    ...p1State.deck,
    {
      ...secondDrawCard,
      zone: {
        zone: "deck",
        playerId: p1,
        slot: "deck",
        index: p1State.deck.length,
      },
    },
  ];
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-life-visibility-sequence"),
      timingWindowId: toTimingWindowId("window-life-visibility-sequence"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "sequence effect").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "life-visibility-cost-test" },
    },
  ];
  return { state, definition };
};

const eventTypes = (events: readonly EngineEvent[]): string[] =>
  events.map((event) => event.type);

test("optional setLifeFaceUp cost can turn Life face-down and resumes the sequence", () => {
  const { state } = sequenceQueueState({
    type: "sequence",
    effects: [
      {
        id: "turn-life-face-down",
        connector: "always",
        effect: {
          type: "payCost",
          cost: {
            type: "setLifeFaceUp",
            count: 1,
            player: "self",
            position: "top",
            faceUp: false,
            optional: true,
          },
        },
      },
      {
        id: "draw-if-paid",
        connector: "ifYouDo",
        effect: { type: "draw", player: "self", count: 1 },
      },
    ],
  });
  const before = must(state.players[p1], "before p1");
  const topLife = must(before.life[0], "top Life");
  topLife.faceUp = true;
  const beforeHandCount = before.hand.length;

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pay cost decision");
  assert.equal(paused.errors, undefined);
  assert.equal(decision.type, "payCost");
  assert.equal(decision.cost.type, "setLifeFaceUp");
  assert.deepEqual(decision.paymentOptions, [
    {
      id: "setLifeFaceUp:top:false",
      type: "setLifeFaceUp",
      count: 1,
      player: "self",
      position: "top",
      faceUp: false,
    },
  ]);

  const paid = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "setLifeFaceUp:top:false",
    },
  });
  const after = must(paid.state.players[p1], "after p1");

  assert.equal(paid.errors, undefined);
  assert.equal(must(after.life[0], "after top Life").faceUp, false);
  assert.equal(
    filterStateForPlayer(paid.state, p1).self.life.faceUpCards.length,
    0,
  );
  assert.equal(
    filterStateForPlayer(paid.state, p2).opponent.life.faceUpCards.length,
    0,
  );
  assert.equal(after.hand.length, beforeHandCount + 1);
  assert.deepEqual(
    eventTypes(paid.events).filter(
      (type) => type === "costPaid" || type === "cardDrawn",
    ),
    ["costPaid", "cardDrawn"],
  );
});

test("optional setLifeFaceUp cost can choose any matching face-up Life card", () => {
  const { state } = sequenceQueueState({
    type: "sequence",
    effects: [
      {
        id: "turn-any-face-up-life-face-down",
        connector: "always",
        effect: {
          type: "payCost",
          cost: {
            type: "setLifeFaceUp",
            count: 1,
            player: "self",
            position: "anyMatching",
            faceUp: false,
            optional: true,
          },
        },
      },
      {
        id: "draw-if-paid",
        connector: "ifYouDo",
        effect: { type: "draw", player: "self", count: 1 },
      },
    ],
  });
  const before = must(state.players[p1], "before p1");
  const hiddenTopLife = must(before.life[0], "hidden top Life");
  const selectedLife = must(before.life[1], "selected face-up Life");
  hiddenTopLife.faceUp = false;
  selectedLife.faceUp = true;
  const beforeHandCount = before.hand.length;

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pay cost decision");
  assert.equal(paused.errors, undefined);
  assert.equal(decision.type, "payCost");
  assert.equal(decision.cost.type, "setLifeFaceUp");
  assert.deepEqual(decision.paymentOptions, [
    {
      id: "setLifeFaceUp:anyMatching:false",
      type: "setLifeFaceUp",
      count: 1,
      player: "self",
      position: "anyMatching",
      faceUp: false,
    },
  ]);

  const legalPayment = getLegalActions(paused.state, p1).find(
    (action) =>
      action.type === "respondToDecision" &&
      action.response.type === "payment" &&
      action.response.optionId === "setLifeFaceUp:anyMatching:false",
  );
  assert.deepEqual(
    legalPayment?.type === "respondToDecision" &&
      legalPayment.response.type === "payment"
      ? legalPayment.response.selectedCardInstanceIds
      : undefined,
    [selectedLife.card.instanceId],
  );

  const paid = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "setLifeFaceUp:anyMatching:false",
      selectedCardInstanceIds: [selectedLife.card.instanceId],
    },
  });
  const after = must(paid.state.players[p1], "after p1");

  assert.equal(paid.errors, undefined);
  assert.equal(must(after.life[0], "after top Life").faceUp, false);
  assert.equal(must(after.life[1], "after selected Life").faceUp, false);
  assert.equal(after.hand.length, beforeHandCount + 1);
});
