import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  Effect,
  EffectDefinition,
  GameState,
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
} from "../effect-runtime-queue/test-support.js";

const optionalCostThenPauseSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "rest-don-cost",
      connector: "always",
      saveResultAs: "paidCost",
      effect: {
        type: "payCost",
        cost: { type: "restDon", count: 1, optional: true },
      },
    },
    {
      id: "draw-after-cost",
      connector: "ifYouDo",
      effect: { type: "draw", count: 1, player: "self" },
    },
  ],
});

const setupSequenceDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-optional-cost-response";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "event",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "optional-cost-response-rules",
      sourceTextHash: "optional-cost-response-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...must(base.effects[0], "base effect"),
        id: toEffectId("effect-optional-cost-response"),
        category: "auto",
        effect,
        sourcePresencePolicy: "noSourceRequired",
        trigger: { type: "trigger" },
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
): GameState => {
  const state = createActiveState();
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
  });
  const definition = setupSequenceDefinition(state, source, effect);
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-optional-cost-response"),
      timingWindowId: toTimingWindowId("window-optional-cost-response"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "sequence effect").id,
      sourcePresencePolicy: "noSourceRequired",
      causedBy: { type: "ruleProcess", name: "optional-cost-response-test" },
    },
  ];
  return state;
};

const placeActiveDon = (state: GameState): void => {
  const player = must(state.players[p1], "p1");
  const don = must(player.donDeck[0], "don");
  player.donDeck = player.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId: p1, slot: "donDeck", index },
  }));
  player.costArea = [
    {
      ...don,
      zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 },
      state: "active",
    },
  ];
};

test("optional cost decision rejects malformed and stale responses without mutation", () => {
  const state = sequenceQueueState(optionalCostThenPauseSequence());
  placeActiveDon(state);
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pay cost");
  const beforeMalformed = structuredClone(paused.state);

  const malformed = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [],
    },
  });

  assert.deepEqual(malformed.state, beforeMalformed);
  assert.equal(
    must(malformed.errors, "malformed errors")[0]?.type,
    "invalidDecisionResponse",
  );

  const stale = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: toDecisionId("decision:stale-optional-cost"),
    response: { type: "paymentDeclined" },
  });

  assert.deepEqual(stale.state, paused.state);
  assert.equal(must(stale.errors, "stale errors")[0]?.type, "illegalAction");
});
