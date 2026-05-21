import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  CardInstance,
  Effect,
  EffectDefinition,
  EngineResult,
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
} from "./effect-runtime-queue-processing-test-support.js";

const chooseOneCostDrawSequence = (
  typeName: string,
): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-choose-one-cost",
      connector: "always",
      saveResultAs: "paidCost",
      effect: {
        type: "payCost",
        cost: {
          type: "chooseOne",
          optional: true,
          options: [
            {
              type: "trashFromField",
              chooser: "self",
              optional: true,
              count: 1,
              filter: { categories: ["character"], typesAny: [typeName] },
            },
            {
              type: "trashFromHand",
              chooser: "self",
              optional: true,
              count: 1,
            },
          ],
        },
      },
    },
    {
      id: "if-you-do-draw",
      connector: "ifYouDo",
      effect: { type: "draw", count: 1, player: "self" },
    },
  ],
});

const setupDefinition = (
  state: GameState,
  source: CardInstance,
  effect: Effect,
): EffectDefinition => {
  const effectDefinitionId = "def-choose-one-cost";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "choose-one-cost-rules",
      sourceTextHash: "choose-one-cost-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const block = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [{ ...block, id: toEffectId("effect-choose-one-cost"), effect }],
  };
  state.cardManifest.effectDefinitionsVersion =
    definition.metadata.effectDefinitionsVersion;
  state.cardManifest.effectDefinitions = { [effectDefinitionId]: definition };
  state.cardManifest.cards[source.cardId] = supportCard;
  return definition;
};

const setupState = (typeName = "Straw Hat Crew") => {
  const state = createActiveState();
  state.turn.turnPlayerId = p1;
  const p1State = must(state.players[p1], "p1");
  const source = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[0], "source"),
    zone: "characterArea",
    index: 0,
  });
  const fieldCostCard = withCardInZone({
    state,
    playerId: p1,
    card: must(p1State.hand[1], "field cost"),
    zone: "characterArea",
    index: 1,
  });
  const handCostCard = must(p1State.hand[2], "hand cost");
  state.cardManifest.cards[fieldCostCard.cardId] = {
    ...resolvedCard({
      cardId: fieldCostCard.cardId,
      category: "character",
      power: 1000,
    }),
    types: [typeName],
  };
  const definition = setupDefinition(
    state,
    source,
    chooseOneCostDrawSequence(typeName),
  );
  state.effectQueue = [
    {
      ...queueDrawForP1(),
      id: toQueueEntryId("queue-entry-choose-one"),
      timingWindowId: toTimingWindowId("window-choose-one"),
      controllerId: p1,
      source: {
        instanceId: source.instanceId,
        cardId: source.cardId,
        playerId: p1,
        zone: source.zone,
      },
      sourceSnapshot: toSourceSnapshot(source, p1, p1),
      effectBlockId: must(definition.effects[0], "effect block").id,
      sourcePresencePolicy: "mustRemainInSameZone",
      causedBy: { type: "ruleProcess", name: "choose-one-test" },
    },
  ];
  return { fieldCostCard, handCostCard, state };
};

test("optional choose-one cost supports field payment and dependent draw", () => {
  const { fieldCostCard, state } = setupState();
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "decision");
  assert.equal(decision.type, "payCost");
  assert.deepEqual(
    new Set(decision.paymentOptions.map((option) => option.type)),
    new Set(["trashFromField", "trashFromHand"]),
  );
  const publicView = filterStateForPlayer(paused.state, p2);
  assert.equal(publicView.pendingDecision, undefined);
  assert.equal(
    publicView.legalActions.some(
      (action) => action.type === "respondToDecision",
    ),
    false,
  );
  const chooserActions = getLegalActions(paused.state, p1).filter(
    (action): action is Extract<Action, { type: "respondToDecision" }> =>
      action.type === "respondToDecision",
  );
  assert.equal(
    chooserActions.some(
      (action) =>
        action.response.type === "payment" &&
        action.response.optionId === "trashFromField",
    ),
    true,
  );
  assert.equal(
    chooserActions.some(
      (action) =>
        action.response.type === "payment" &&
        action.response.optionId === "trashFromHand",
    ),
    true,
  );

  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "trashFromField",
      selectedCardInstanceIds: [fieldCostCard.instanceId],
    },
  });

  assert.equal(result.errors, undefined);
  assert.equal(result.state.pendingDecision, undefined);
  assert.equal(
    must(result.state.players[p1], "after p1").trash.some(
      (card) => card.instanceId === fieldCostCard.instanceId,
    ),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "cardDrawn"),
    true,
  );
  assert.deepEqual(result.events.map((event) => event.type).slice(0, 4), [
    "cardMoved",
    "cardTrashed",
    "costPaid",
    "decisionResolved",
  ]);
});

test("optional choose-one cost supports hand payment and decline; neither-payable skips decision", () => {
  const base = setupState("Navy");
  const paused = processEffectRuntime(base.state);
  const decision = must(paused.state.pendingDecision, "decision");
  const handPaid = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "trashFromHand",
      selectedCardInstanceIds: [base.handCostCard.instanceId],
    },
  });
  assert.equal(handPaid.errors, undefined);
  assert.equal(
    handPaid.events.some((event) => event.type === "cardDrawn"),
    true,
  );

  const declineRun = processEffectRuntime(setupState("Navy").state);
  const declined = applyAction(declineRun.state, {
    type: "respondToDecision",
    decisionId: must(declineRun.state.pendingDecision, "decline decision").id,
    response: { type: "paymentDeclined" },
  });
  assert.equal(declined.errors, undefined);
  assert.equal(
    declined.events.some((event) => event.type === "cardDrawn"),
    false,
  );

  const neither = setupState("Revolutionary Army");
  const p1State = must(neither.state.players[p1], "neither p1");
  p1State.hand = [];
  p1State.characters = p1State.characters.filter(
    (card) => card.instanceId !== neither.fieldCostCard.instanceId,
  );
  const noDecision = processEffectRuntime(neither.state);
  assert.equal(noDecision.state.pendingDecision, undefined);
  assert.equal(
    noDecision.events.some((event) => event.type === "costPaid"),
    false,
  );
  assert.equal(
    noDecision.events.some((event) => event.type === "cardDrawn"),
    false,
  );
});

test("optional choose-one cost fails closed on malformed or wrong option response and is deterministic", () => {
  const run = (
    mode: "field" | "hand" | "decline" | "malformed" | "wrongOption",
  ): EngineResult => {
    const { fieldCostCard, handCostCard, state } = setupState("Fish-Man");
    const paused = processEffectRuntime(state);
    const decision = must(paused.state.pendingDecision, "decision");
    if (mode === "decline") {
      return applyAction(paused.state, {
        type: "respondToDecision",
        decisionId: decision.id,
        response: { type: "paymentDeclined" },
      });
    }
    if (mode === "malformed") {
      return applyAction(paused.state, {
        type: "respondToDecision",
        decisionId: decision.id,
        response: {
          type: "payment",
          optionId: "trashFromField",
          selectedCardInstanceIds: [],
        },
      });
    }
    if (mode === "wrongOption") {
      return applyAction(paused.state, {
        type: "respondToDecision",
        decisionId: decision.id,
        response: {
          type: "payment",
          optionId: "discard",
          selectedCardInstanceIds: [handCostCard.instanceId],
        },
      });
    }
    return applyAction(paused.state, {
      type: "respondToDecision",
      decisionId: decision.id,
      response:
        mode === "field"
          ? {
              type: "payment",
              optionId: "trashFromField",
              selectedCardInstanceIds: [fieldCostCard.instanceId],
            }
          : {
              type: "payment",
              optionId: "trashFromHand",
              selectedCardInstanceIds: [handCostCard.instanceId],
            },
    });
  };

  const malformed = run("malformed");
  assert.equal(
    must(malformed.errors, "malformed")[0]?.type,
    "invalidDecisionResponse",
  );
  const wrongOption = run("wrongOption");
  assert.equal(
    must(wrongOption.errors, "wrong option")[0]?.type,
    "invalidDecisionResponse",
  );

  for (const mode of ["field", "hand", "decline"] as const) {
    const first = run(mode);
    const second = run(mode);
    assert.deepEqual(first.events, second.events);
    assert.equal(first.stateHash, second.stateHash);
  }
});
