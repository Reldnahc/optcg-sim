import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  EngineResult,
  GameState,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
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
} from "../../effect-runtime-queue/test-support.js";

const reindexHand = (
  cards: readonly CardInstance[],
  playerId = p1,
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId, slot: "hand", index },
  }));

const placeActiveDon = (state: GameState, count: number): void => {
  const player = must(state.players[p1], "player");
  const moved = player.donDeck.slice(0, count);
  assert.equal(moved.length, count);
  player.donDeck = player.donDeck.slice(count).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  player.costArea = [
    ...player.costArea,
    ...moved.map(
      (don, index): CardInstance => ({
        ...don,
        zone: { zone: "costArea", playerId: p1, slot: "cost", index },
        state: "active",
      }),
    ),
  ];
};

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-return-don-target-continuation";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    power: 5000,
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "return-don-target-continuation-rules",
      sourceTextHash: "return-don-target-continuation-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-return-don-target-continuation"),
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

const sequenceQueueState = (effect: Effect): GameState => {
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
      id: toQueueEntryId("queue-entry-return-don-target-continuation"),
      timingWindowId: toTimingWindowId("window-return-don-target-continuation"),
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
      causedBy: {
        type: "ruleProcess",
        name: "return-don-target-continuation-test",
      },
    },
  ];
  return state;
};

const returnTwoDonDrawThenRestTargetSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-return-two-don",
      connector: "always",
      effect: {
        type: "payCost",
        cost: { type: "returnDon", count: 2, optional: true },
      },
      saveResultAs: "paidOptionalCost",
    },
    {
      id: "draw-then-rest-if-paid",
      connector: "ifYouDo",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: { type: "draw", player: "self", count: 1 },
          },
          {
            connector: "then",
            effect: {
              type: "sequence",
              effects: [
                {
                  id: "select-rest-target",
                  connector: "always",
                  saveResultAs: "selected:thatCharacter",
                  effect: {
                    type: "selectTargets",
                    request: {
                      timing: "onResolution",
                      chooser: "self",
                      player: "opponent",
                      zone: "characterArea",
                      min: 0,
                      max: 1,
                      allowFewerIfUnavailable: true,
                      visibility: "public",
                      filter: {
                        categories: ["character"],
                        currentPower: { max: 5000 },
                      },
                    },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "rest",
                    target: {
                      type: "savedFieldObject",
                      binding: {
                        family: "selectedTargets",
                        saveResultAs: "selected:thatCharacter",
                      },
                      zone: "characterArea",
                      player: "opponent",
                      visibility: "publicOnly",
                      onFailure: "failClosed",
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
});

const payReturnDonWithFirstCostDon = (state: GameState): EngineResult => {
  const decision = must(state.pendingDecision, "pending decision");
  assert.equal(decision.type, "payCost");
  assert.equal(decision.cost.type, "returnDon");
  const player = must(state.players[decision.playerId], "decision player");
  const don = player.costArea.slice(0, decision.cost.count);
  assert.equal(don.length, decision.cost.count);
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "returnDon",
      selectedDonInstanceIds: don.map((card) => card.instanceId),
    },
  });
};

test("returning two DON resumes dependent draw and target-rest body", () => {
  const state = sequenceQueueState(returnTwoDonDrawThenRestTargetSequence());
  placeActiveDon(state, 2);
  const beforeP1 = must(state.players[p1], "before p1");
  const p2State = must(state.players[p2], "p2");
  state.cardManifest.cards[beforeP1.leader.cardId] = resolvedCard({
    cardId: beforeP1.leader.cardId,
    category: "leader",
    power: 5000,
  });
  state.cardManifest.cards[p2State.leader.cardId] = resolvedCard({
    cardId: p2State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  const target = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "target"),
    zone: "characterArea",
  });
  target.state = "active";
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    power: 5000,
  });
  const beforeDeckCount = beforeP1.deck.length;

  const returnDonPaused = processEffectRuntime(state);
  const paidReturnDon = payReturnDonWithFirstCostDon(returnDonPaused.state);
  const targetDecision = must(
    paidReturnDon.state.pendingDecision,
    "rest target decision",
  );
  const afterPaymentP1 = must(paidReturnDon.state.players[p1], "after payment");

  assert.equal(returnDonPaused.errors, undefined);
  assert.equal(paidReturnDon.errors, undefined);
  assert.equal(afterPaymentP1.deck.length, beforeDeckCount - 1);
  assert.equal(targetDecision.type, "selectTargets");
  assert.equal(targetDecision.candidates.length, 1);

  const rested = applyAction(paidReturnDon.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: {
      type: "targets",
      targets: [must(targetDecision.candidates[0], "candidate").card],
    },
  });
  const restedTarget = must(
    rested.state.players[p2],
    "p2 after",
  ).characters.find((card) => card.instanceId === target.instanceId);

  assert.equal(rested.errors, undefined);
  assert.equal(rested.state.pendingDecision, undefined);
  assert.equal(restedTarget?.state, "rested");
});

test("returning two DON auto-completes optional target body with no candidates", () => {
  const state = sequenceQueueState(returnTwoDonDrawThenRestTargetSequence());
  placeActiveDon(state, 2);
  const beforeP1 = must(state.players[p1], "before p1");
  const beforeDeckCount = beforeP1.deck.length;

  const returnDonPaused = processEffectRuntime(state);
  const paidReturnDon = payReturnDonWithFirstCostDon(returnDonPaused.state);
  const afterPaymentP1 = must(paidReturnDon.state.players[p1], "after payment");

  assert.equal(returnDonPaused.errors, undefined);
  assert.equal(paidReturnDon.errors, undefined);
  assert.equal(afterPaymentP1.deck.length, beforeDeckCount - 1);
  assert.equal(paidReturnDon.state.pendingDecision, undefined);
});
