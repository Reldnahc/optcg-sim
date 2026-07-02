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
} from "./effect-runtime-queue/test-support.js";

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

const chooseOneOptionId = (
  decision: Extract<
    NonNullable<GameState["pendingDecision"]>,
    { type: "payCost" }
  >,
  params: { type: "trashFromHand" | "trashFromField"; count?: number },
): string =>
  must(
    decision.paymentOptions.find(
      (option) =>
        option.type === params.type &&
        (params.count === undefined || option.count === params.count),
    ),
    "payment option",
  ).id;

const asPayCostDecision = (
  decision: NonNullable<GameState["pendingDecision"]>,
): Extract<NonNullable<GameState["pendingDecision"]>, { type: "payCost" }> => {
  assert.equal(decision.type, "payCost");
  return decision;
};

test("optional choose-one cost supports field payment and dependent draw", () => {
  const { fieldCostCard, state } = setupState();
  const paused = processEffectRuntime(state);
  const decision = asPayCostDecision(
    must(paused.state.pendingDecision, "decision"),
  );
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
  const fieldOptionId = chooseOneOptionId(decision, { type: "trashFromField" });
  const handOptionId = chooseOneOptionId(decision, { type: "trashFromHand" });
  assert.equal(
    chooserActions.some(
      (action) =>
        action.response.type === "payment" &&
        action.response.optionId === fieldOptionId,
    ),
    true,
  );
  assert.equal(
    chooserActions.some(
      (action) =>
        action.response.type === "payment" &&
        action.response.optionId === handOptionId,
    ),
    true,
  );

  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: fieldOptionId,
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

test("optional choose-one cost supports filtered hand and named stage field alternatives", () => {
  const stateSetup = setupState("Navy");
  const { state } = stateSetup;
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.characters[0], "source");
  const handFish = must(p1State.hand[2], "fish hand cost");
  const fieldArkSource = must(p1State.hand[3], "field ark cost");
  const handArk = must(p1State.hand[4], "hand ark cost");
  const fieldArk = withCardInZone({
    state,
    playerId: p1,
    card: fieldArkSource,
    zone: "stageArea",
  });
  p1State.hand = p1State.hand.filter(
    (card) => card.instanceId !== fieldArk.instanceId,
  );
  state.cardManifest.cards[handFish.cardId] = {
    ...resolvedCard({
      cardId: handFish.cardId,
      category: "character",
      power: 1000,
    }),
    types: ["Fish-Man"],
  };
  state.cardManifest.cards[handArk.cardId] = {
    ...resolvedCard({ cardId: handArk.cardId, category: "stage", cost: 1 }),
    name: "The Ark Noah",
  };
  state.cardManifest.cards[fieldArk.cardId] = {
    ...resolvedCard({ cardId: fieldArk.cardId, category: "stage", cost: 1 }),
    name: "The Ark Noah",
  };
  setupDefinition(state, source, {
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
                type: "trashFromHand",
                chooser: "self",
                optional: true,
                count: 1,
                filter: { typesAny: ["Fish-Man"] },
              },
              {
                type: "trashFromHand",
                chooser: "self",
                optional: true,
                count: 1,
                filter: { names: ["The Ark Noah"] },
              },
              {
                type: "trashFromField",
                chooser: "self",
                optional: true,
                count: 1,
                filter: { names: ["The Ark Noah"] },
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

  const paused = processEffectRuntime(state);
  const decision = asPayCostDecision(
    must(paused.state.pendingDecision, "decision"),
  );
  assert.deepEqual(
    decision.paymentOptions.map((option) => option.type),
    ["trashFromHand", "trashFromHand", "trashFromField"],
  );
  const fieldOption = must(
    decision.paymentOptions.find(
      (option) =>
        option.type === "trashFromField" &&
        option.filter?.names?.includes("The Ark Noah") === true,
    ),
    "named field option",
  );
  const legal = getLegalActions(paused.state, p1).filter(
    (
      action,
    ): action is Extract<Action, { type: "respondToDecision" }> & {
      response: Extract<
        Extract<Action, { type: "respondToDecision" }>["response"],
        { type: "payment" }
      >;
    } =>
      action.type === "respondToDecision" && action.response.type === "payment",
  );
  assert.equal(
    legal.some(
      (action) =>
        action.response.optionId === fieldOption.id &&
        action.response.selectedCardInstanceIds?.[0] === fieldArk.instanceId,
    ),
    true,
  );

  const result = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: fieldOption.id,
      selectedCardInstanceIds: [fieldArk.instanceId],
    },
  });

  assert.equal(result.errors, undefined);
  const after = must(result.state.players[p1], "after p1");
  assert.equal(after.stage, undefined);
  assert.equal(
    after.trash.some((card) => card.instanceId === fieldArk.instanceId),
    true,
  );
  assert.equal(
    result.events.some(
      (event) =>
        event.type === "cardMoved" &&
        (event.payload as { from?: string }).from === "stageArea",
    ),
    true,
  );
  assert.equal(
    result.events.some((event) => event.type === "cardDrawn"),
    true,
  );
});

test("optional choose-one field cost uses public field-only filters", () => {
  const { fieldCostCard, state } = setupState("Navy");
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.characters[0], "source");
  const attachedDon = {
    ...must(p1State.donDeck[0], "attached DON"),
    zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 } as const,
  };
  p1State.costArea = [attachedDon, ...p1State.costArea];
  p1State.donDeck = p1State.donDeck.filter(
    (card) => card.instanceId !== attachedDon.instanceId,
  );
  p1State.characters = p1State.characters.map((card) =>
    card.instanceId === fieldCostCard.instanceId
      ? { ...card, attachedDon: [attachedDon.instanceId] }
      : card,
  );
  setupDefinition(state, source, {
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
                filter: {
                  categories: ["character"],
                  attachedDon: { min: 1 },
                },
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

  const paused = processEffectRuntime(state);
  const decision = asPayCostDecision(
    must(paused.state.pendingDecision, "decision"),
  );
  const fieldOption = must(
    decision.paymentOptions.find((option) => option.type === "trashFromField"),
    "field option",
  );
  const legal = getLegalActions(paused.state, p1).filter(
    (
      action,
    ): action is Extract<Action, { type: "respondToDecision" }> & {
      response: Extract<
        Extract<Action, { type: "respondToDecision" }>["response"],
        { type: "payment" }
      >;
    } =>
      action.type === "respondToDecision" && action.response.type === "payment",
  );

  assert.equal(
    legal.some(
      (action) =>
        action.response.optionId === fieldOption.id &&
        action.response.selectedCardInstanceIds?.[0] ===
          fieldCostCard.instanceId,
    ),
    true,
  );
});

test("optional choose-one cost supports hand payment and decline; neither-payable skips decision", () => {
  const base = setupState("Navy");
  const paused = processEffectRuntime(base.state);
  const decision = asPayCostDecision(
    must(paused.state.pendingDecision, "decision"),
  );
  const handOptionId = chooseOneOptionId(decision, { type: "trashFromHand" });
  const handPaid = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: handOptionId,
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
    const decision = asPayCostDecision(
      must(paused.state.pendingDecision, "decision"),
    );
    const fieldOptionId = chooseOneOptionId(decision, {
      type: "trashFromField",
    });
    const handOptionId = chooseOneOptionId(decision, { type: "trashFromHand" });
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
          optionId: fieldOptionId,
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
              optionId: fieldOptionId,
              selectedCardInstanceIds: [fieldCostCard.instanceId],
            }
          : {
              type: "payment",
              optionId: handOptionId,
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

test("field trash cost returns attached DON as rested with deterministic replay-only events and no KO", () => {
  const { fieldCostCard, state } = setupState();
  const p1State = must(state.players[p1], "p1");
  const donA = {
    ...must(p1State.donDeck[0], "don a"),
    zone: { zone: "costArea", playerId: p1, slot: "cost", index: 0 } as const,
  };
  const donB = {
    ...must(p1State.donDeck[1], "don b"),
    zone: { zone: "costArea", playerId: p1, slot: "cost", index: 1 } as const,
  };
  p1State.costArea = [donA, donB, ...p1State.costArea];
  p1State.donDeck = p1State.donDeck.filter(
    (card) =>
      card.instanceId !== donA.instanceId &&
      card.instanceId !== donB.instanceId,
  );
  const updatedField = {
    ...fieldCostCard,
    attachedDon: [donA.instanceId, donB.instanceId],
  };
  p1State.characters = p1State.characters.map((card) =>
    card.instanceId === fieldCostCard.instanceId ? updatedField : card,
  );

  const paused = processEffectRuntime(state);
  const decision = asPayCostDecision(
    must(paused.state.pendingDecision, "decision"),
  );
  const fieldOptionId = chooseOneOptionId(decision, { type: "trashFromField" });
  const first = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: fieldOptionId,
      selectedCardInstanceIds: [fieldCostCard.instanceId],
    },
  });
  const second = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: fieldOptionId,
      selectedCardInstanceIds: [fieldCostCard.instanceId],
    },
  });

  assert.equal(first.errors, undefined);
  assert.equal(
    first.events.some((event) => event.type === "cardKOd"),
    false,
  );
  assert.equal(
    first.events.filter((event) => event.type === "donReturned").length,
    2,
  );
  assert.equal(
    first.events
      .filter((event) => event.type === "donReturned")
      .every((event) => event.visibility.type === "replayOnly"),
    true,
  );
  assert.equal(
    first.events.some(
      (event) =>
        event.type === "cardMoved" &&
        (event.payload as { reason?: string }).reason === "trashFromField",
    ),
    true,
  );
  assert.equal(
    must(first.state.players[p1], "after p1")
      .costArea.filter((card) =>
        [donA.instanceId, donB.instanceId].includes(card.instanceId),
      )
      .every((card) => card.state === "rested"),
    true,
  );
  assert.deepEqual(first.events, second.events);
  assert.equal(first.stateHash, second.stateHash);
});

test("unsupported choose-one field-trash alternative fails closed without degrading to hand option", () => {
  const malformedSequence: Extract<Effect, { type: "sequence" }> = {
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
                filter: { categories: ["character"], typesAny: ["Navy"] },
              },
              {
                type: "trashFromField",
                chooser: "self",
                optional: true,
                count: 1,
                filter: {
                  custom: "unsupported-cost-filter",
                },
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
  };
  const { state } = setupState("Navy");
  setupDefinition(
    state,
    must(state.players[p1], "p1").characters[0] as CardInstance,
    malformedSequence,
  );
  const run = processEffectRuntime(state);

  assert.equal(run.state.pendingDecision, undefined);
  assert.equal(
    run.events.some((event) => event.type === "decisionCreated"),
    false,
  );
  assert.equal(
    run.events.some((event) => event.type === "costPaid"),
    false,
  );
  assert.equal(
    run.events.some((event) => event.type === "cardDrawn"),
    false,
  );
});

test("unsupported choose-one hand-trash alternative fails closed without degrading to unfiltered hand option", () => {
  const malformedSequence: Extract<Effect, { type: "sequence" }> = {
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
                type: "trashFromHand",
                chooser: "self",
                optional: true,
                count: 1,
                filter: { custom: "unsupported-cost-filter" },
              },
              {
                type: "trashFromField",
                chooser: "self",
                optional: true,
                count: 1,
                filter: { categories: ["character"], typesAny: ["Navy"] },
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
  };
  const { state } = setupState("Navy");
  setupDefinition(
    state,
    must(state.players[p1], "p1").characters[0] as CardInstance,
    malformedSequence,
  );
  const run = processEffectRuntime(state);

  assert.equal(run.state.pendingDecision, undefined);
  assert.equal(
    run.events.some((event) => event.type === "decisionCreated"),
    false,
  );
  assert.equal(
    run.events.some((event) => event.type === "costPaid"),
    false,
  );
  assert.equal(
    run.events.some((event) => event.type === "cardDrawn"),
    false,
  );
});

test("choose-one same-family alternatives use distinct stable option ids and preserve selected alternative identity", () => {
  const sameFamilySequence: Extract<Effect, { type: "sequence" }> = {
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
                type: "trashFromHand",
                chooser: "self",
                optional: true,
                count: 1,
              },
              {
                type: "trashFromHand",
                chooser: "self",
                optional: true,
                count: 2,
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
  };
  const { state } = setupState("Navy");
  const p1State = must(state.players[p1], "p1");
  const source = must(p1State.characters[0], "source");
  setupDefinition(state, source, sameFamilySequence);
  const paused = processEffectRuntime(state);
  const decision = asPayCostDecision(
    must(paused.state.pendingDecision, "decision"),
  );

  const handOneId = chooseOneOptionId(decision, {
    type: "trashFromHand",
    count: 1,
  });
  const handTwoId = chooseOneOptionId(decision, {
    type: "trashFromHand",
    count: 2,
  });
  assert.notEqual(handOneId, handTwoId);

  const legal = getLegalActions(paused.state, p1).filter(
    (
      action,
    ): action is Extract<Action, { type: "respondToDecision" }> & {
      response: Extract<
        Extract<Action, { type: "respondToDecision" }>["response"],
        { type: "payment" }
      >;
    } =>
      action.type === "respondToDecision" && action.response.type === "payment",
  );
  assert.equal(
    legal.some((action) => action.response.optionId === handOneId),
    true,
  );
  assert.equal(
    legal.some((action) => action.response.optionId === handTwoId),
    true,
  );

  const selected = [must(p1State.hand[0], "h1"), must(p1State.hand[1], "h2")];
  const paid = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: handTwoId,
      selectedCardInstanceIds: selected.map((card) => card.instanceId),
    },
  });
  assert.equal(paid.errors, undefined);
  const costPaid = must(
    paid.events.find((event) => event.type === "costPaid"),
    "costPaid",
  );
  assert.deepEqual(
    (costPaid.payload as { selectedCardInstanceIds?: string[] })
      .selectedCardInstanceIds,
    selected.map((card) => card.instanceId),
  );
});
