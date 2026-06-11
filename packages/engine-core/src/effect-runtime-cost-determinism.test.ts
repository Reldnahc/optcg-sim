import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  EngineResult,
  GameState,
  HandSelectionId,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  must,
  p1,
  processEffectRuntime,
  queueDrawForP1,
  resolvedCard,
  reviewedOnPlayDrawDefinition,
  toDecisionId,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "./effect-runtime-queue/test-support.js";

const optionalReturnDonThenPauseSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-return-don",
      connector: "always",
      effect: {
        type: "payCost",
        cost: { type: "returnDon", count: 1, optional: true },
      },
      saveResultAs: "paidOptionalCost",
    },
    {
      id: "draw-if-paid",
      connector: "ifYouDo",
      effect: { type: "draw", player: "self", count: 1 },
    },
    {
      id: "pause-after-cost",
      connector: "always",
      effect: {
        type: "trashFromHand",
        player: "self",
        chooser: "self",
        count: 1,
      },
    },
  ],
});

const handSelectionThenPauseSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "draw-before-selection",
      connector: "always",
      effect: { type: "draw", player: "self", count: 1 },
    },
    {
      id: "select-character-from-hand",
      connector: "then",
      effect: {
        type: "selectCards",
        zone: "hand",
        player: "self",
        chooser: "self",
        min: 1,
        max: 1,
        filter: { categories: ["character"] },
        saveAs: "handSelection:test" as HandSelectionId,
        visibility: "chooserOnly",
      },
    },
    {
      id: "draw-after-selection",
      connector: "ifPreviousSucceeded",
      optional: true,
      effect: { type: "draw", player: "self", count: 1 },
    },
  ],
});

const reindexHand = (cards: readonly CardInstance[]): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId: p1, slot: "hand", index },
  }));

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-resumable-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "resumable-sequence-rules",
      sourceTextHash: "resumable-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-resumable-sequence"),
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
      id: toQueueEntryId("queue-entry-resumable-sequence"),
      timingWindowId: toTimingWindowId("window-resumable-sequence"),
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
      causedBy: { type: "ruleProcess", name: "resumable-sequence-test" },
    },
  ];
  return state;
};

const placeActiveDon = (state: GameState): void => {
  const player = must(state.players[p1], "player");
  const don = must(player.donDeck[0], "don");
  player.donDeck = player.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  player.costArea = [
    ...player.costArea,
    {
      ...don,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "active",
    },
  ];
};

const payWithFirstCostAreaDon = (state: GameState): EngineResult => {
  const decision = must(state.pendingDecision, "pending decision");
  const player = must(state.players[decision.playerId], "decision player");
  const don = must(player.costArea[0], "cost DON");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId:
        decision.type === "payCost"
          ? (decision.paymentOptions[0]?.id ?? "returnDon")
          : "returnDon",
      selectedDonInstanceIds: [don.instanceId],
    },
  });
};

test("returnDon and hand-selection accepted and stale branches stay deterministic for replay/state hash", () => {
  const runReturnDon = (mode: "pay" | "stale"): EngineResult => {
    const state = sequenceQueueState(optionalReturnDonThenPauseSequence());
    placeActiveDon(state);
    const paused = processEffectRuntime(state);
    if (mode === "pay") {
      return payWithFirstCostAreaDon(paused.state);
    }
    return applyAction(paused.state, {
      type: "respondToDecision",
      decisionId: toDecisionId("decision:payCost:stale"),
      response: { type: "paymentDeclined" },
    });
  };

  const runHandSelection = (mode: "resolve" | "stale"): EngineResult => {
    const state = sequenceQueueState(handSelectionThenPauseSequence());
    const p1State = must(state.players[p1], "p1");
    for (const card of p1State.hand) {
      state.cardManifest.cards[card.cardId] = resolvedCard({
        cardId: card.cardId,
        category: "character",
        cost: 1,
        power: 1000,
      });
    }
    const paused = processEffectRuntime(state);
    const decision = must(paused.state.pendingDecision, "hand decision");
    if (decision.type !== "selectCards") {
      throw new Error("expected selectCards decision");
    }
    if (mode === "resolve") {
      return applyAction(paused.state, {
        type: "respondToDecision",
        decisionId: decision.id,
        response: {
          type: "cards",
          cards: [must(decision.candidates[0], "candidate").card],
        },
      });
    }
    return applyAction(paused.state, {
      type: "respondToDecision",
      decisionId: toDecisionId("decision:selectCards:hand-selection:stale"),
      response: { type: "cards", cards: [] },
    });
  };

  const returnDonPayA = runReturnDon("pay");
  const returnDonPayB = runReturnDon("pay");
  const returnDonStaleA = runReturnDon("stale");
  const returnDonStaleB = runReturnDon("stale");
  assert.equal(returnDonPayA.stateHash, returnDonPayB.stateHash);
  assert.equal(returnDonStaleA.stateHash, returnDonStaleB.stateHash);

  const handResolveA = runHandSelection("resolve");
  const handResolveB = runHandSelection("resolve");
  const handStaleA = runHandSelection("stale");
  const handStaleB = runHandSelection("stale");
  assert.equal(handResolveA.stateHash, handResolveB.stateHash);
  assert.equal(handStaleA.stateHash, handStaleB.stateHash);
});
