import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  Action,
  CardInstance,
  Effect,
  EffectDefinition,
  EngineEvent,
  EngineResult,
  GameState,
} from "@optcg/types";

import {
  applyAction,
  createActiveState,
  filterStateForPlayer,
  hashCanonicalStateValue,
  must,
  p1,
  p2,
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

const optionalHandTrashThenFilteredKoSequence = (
  costMax: number,
): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-trash-from-hand-cost",
      connector: "always",
      effect: {
        type: "payCost",
        cost: {
          type: "trashFromHand",
          count: 1,
          chooser: "self",
          optional: true,
        },
      },
      saveResultAs: "paidOptionalCost",
    },
    {
      id: "select-cost-filtered-target",
      connector: "ifYouDo",
      saveResultAs: "savedTarget",
      effect: {
        type: "selectTargets",
        request: {
          timing: "onResolution",
          chooser: "self",
          zone: "characterArea",
          player: "opponent",
          min: 0,
          max: 1,
          allowFewerIfUnavailable: false,
          visibility: "public",
          filter: { categories: ["character"], cost: { max: costMax } },
        },
      },
    },
    {
      id: "ko-selected-cost-filtered-target",
      connector: "ifPreviousSucceeded",
      effect: {
        type: "ko",
        target: {
          type: "savedFieldObject",
          binding: { family: "selectedTargets", saveResultAs: "savedTarget" },
          zone: "characterArea",
          player: "opponent",
          visibility: "publicOnly",
          onFailure: "failClosed",
        },
      },
    },
  ],
});

const optionalHandTrashThenNestedFilteredKoSequence = (
  costMax: number,
): Extract<Effect, { type: "sequence" }> => {
  const [, selectSegment, koSegment] =
    optionalHandTrashThenFilteredKoSequence(costMax).effects;
  return {
    type: "sequence",
    effects: [
      {
        id: "optional-trash-from-hand-cost",
        connector: "always",
        effect: {
          type: "payCost",
          cost: {
            type: "trashFromHand",
            count: 1,
            chooser: "self",
            optional: true,
          },
        },
        saveResultAs: "paidOptionalCost",
      },
      {
        id: "if-paid-ko-target-sequence",
        connector: "ifYouDo",
        effect: {
          type: "sequence",
          effects: [
            must(selectSegment, "select segment"),
            must(koSegment, "ko segment"),
          ],
        },
      },
    ],
  };
};

const optionalVariableHandTrashThenPowerSequence = (): Extract<
  Effect,
  { type: "sequence" }
> =>
  ({
    type: "sequence",
    effects: [
      {
        id: "variable-trash-from-hand-cost",
        connector: "always",
        saveResultAs: "paidCost:trashFromHand",
        effect: {
          type: "payCost",
          cost: {
            type: "trashFromHand",
            count: 0,
            maxCount: "available",
            chooser: "self",
            filter: { categories: ["event", "stage"] },
            optional: true,
          },
        },
      },
      {
        id: "power-for-paid-trash",
        connector: "ifYouDo",
        effect: {
          type: "modifyPower",
          target: { type: "self" },
          value: {
            type: "paidCostCardCount",
            cost: "paidCost:trashFromHand",
            multiplier: 1000,
          },
          duration: { type: "thisBattle" },
        },
      },
    ],
  }) as unknown as Extract<Effect, { type: "sequence" }>;

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

const sequenceQueueState = (
  effect: Effect = optionalHandTrashThenFilteredKoSequence(4),
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
  return { state, definition };
};

const payWithHandCard = (
  state: GameState,
  card: CardInstance,
): EngineResult => {
  const decision = must(state.pendingDecision, "pending decision");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "trashFromHand",
      selectedCardInstanceIds: [card.instanceId],
    },
  });
};

const declinePayment = (state: GameState): EngineResult =>
  applyAction(state, {
    type: "respondToDecision",
    decisionId: must(state.pendingDecision, "pending decision").id,
    response: { type: "paymentDeclined" },
  });

const eventTypes = (events: readonly EngineEvent[]): string[] =>
  events.map((event) => event.type);

test("optional hand-trash cost payment records paidCost true and runs filtered saved-target KO", () => {
  const { state } = sequenceQueueState(
    optionalHandTrashThenFilteredKoSequence(4),
  );
  const p1State = must(state.players[p1], "p1");
  const paymentCard = must(p1State.hand[0], "payment card");
  const p2State = must(state.players[p2], "p2");
  const legalTarget = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "legal target"),
    zone: "characterArea",
    index: 0,
  });
  const filteredOutTarget = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[1], "filtered target"),
    zone: "characterArea",
    index: 1,
  });
  state.cardManifest.cards[legalTarget.cardId] = resolvedCard({
    cardId: legalTarget.cardId,
    category: "character",
    cost: 4,
    power: 3000,
  });
  state.cardManifest.cards[filteredOutTarget.cardId] = resolvedCard({
    cardId: filteredOutTarget.cardId,
    category: "character",
    cost: 5,
    power: 4000,
  });

  const paused = processEffectRuntime(state);
  const paymentDecision = must(paused.state.pendingDecision, "pay cost");
  assert.equal(paused.errors, undefined);
  assert.equal(paymentDecision.type, "payCost");
  assert.equal(paymentDecision.playerId, p1);
  assert.equal(paymentDecision.cost.type, "trashFromHand");
  assert.deepEqual(paymentDecision.defaultResponse, {
    type: "paymentDeclined",
  });
  assert.equal(
    JSON.stringify(filterStateForPlayer(paused.state, p2)).includes(
      String(paymentCard.instanceId),
    ),
    false,
  );
  assert.equal(
    filterStateForPlayer(paused.state, p2).legalActions.some(
      (action) => action.type === "respondToDecision",
    ),
    false,
  );

  const paid = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: paymentDecision.id,
    response: {
      type: "payment",
      optionId: "trashFromHand",
      selectedCardInstanceIds: [paymentCard.instanceId],
    },
  });
  const targetDecision = must(paid.state.pendingDecision, "target decision");
  const frame = must(paid.state.effectExecutionFrames[0], "frame");
  const afterPaymentP1 = must(paid.state.players[p1], "after payment p1");
  const paymentEvents = eventTypes(paid.events);

  assert.equal(paid.errors, undefined);
  assert.equal(targetDecision.type, "selectTargets");
  assert.deepEqual(frame.segmentResults["0"], {
    attempted: true,
    succeeded: true,
    changedState: true,
    selectedCards: [],
    selectedTargets: [],
    paidCost: true,
    playerDeclined: false,
  });
  assert.deepEqual(frame.savedReferences["paidOptionalCost"], {
    kind: "paidCost",
    paidCost: true,
    selectedCards: [
      {
        instanceId: paymentCard.instanceId,
        cardId: paymentCard.cardId,
        playerId: p1,
        zone: paymentCard.zone,
      },
    ],
  });
  assert.equal(
    afterPaymentP1.hand.some(
      (card) => card.instanceId === paymentCard.instanceId,
    ),
    false,
  );
  assert.equal(
    afterPaymentP1.trash.some(
      (card) => card.instanceId === paymentCard.instanceId,
    ),
    true,
  );
  assert.deepEqual(paymentEvents, [
    "cardMoved",
    "cardTrashed",
    "costPaid",
    "decisionResolved",
    "decisionCreated",
  ]);
  assert.equal(must(paid.events[0], "cardMoved").visibility.type, "public");
  assert.equal(must(paid.events[1], "cardTrashed").visibility.type, "public");
  assert.deepEqual(must(paid.events[0], "cardMoved").payload, {
    from: "hand",
    to: "trash",
    playerId: p1,
    reason: "trashFromHand",
  });
  assert.deepEqual(must(paid.events[1], "cardTrashed").payload, {
    playerId: p1,
    instanceId: paymentCard.instanceId,
    cardId: paymentCard.cardId,
    reason: "trashFromHand",
  });
  assert.deepEqual(
    targetDecision.candidates.map((candidate) => candidate.card.instanceId),
    [legalTarget.instanceId],
  );

  const resolved = applyAction(paid.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: {
      type: "targets",
      targets: [must(targetDecision.candidates[0], "candidate").card],
    },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(
    must(resolved.state.players[p2], "after p2").characters.some(
      (card) => card.instanceId === legalTarget.instanceId,
    ),
    false,
  );
  assert.equal(
    must(resolved.state.players[p2], "after p2").characters.some(
      (card) => card.instanceId === filteredOutTarget.instanceId,
    ),
    true,
  );
  assert.deepEqual(
    eventTypes(resolved.events).filter((type) =>
      ["decisionResolved", "cardKOd", "effectResolved"].includes(type),
    ),
    ["decisionResolved", "cardKOd", "effectResolved"],
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("variable hand-trash cost records selected paid cards for dynamic power values", () => {
  const { state } = sequenceQueueState(
    optionalVariableHandTrashThenPowerSequence(),
  );
  const p1State = must(state.players[p1], "p1");
  const eventCard = must(p1State.hand[0], "event payment");
  const stageCard = must(p1State.hand[1], "stage payment");
  const characterCard = must(p1State.hand[2], "nonmatching payment");
  state.cardManifest.cards[eventCard.cardId] = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
    cost: 2,
  });
  state.cardManifest.cards[stageCard.cardId] = resolvedCard({
    cardId: stageCard.cardId,
    category: "stage",
    cost: 1,
  });
  state.cardManifest.cards[characterCard.cardId] = resolvedCard({
    cardId: characterCard.cardId,
    category: "character",
    cost: 1,
    power: 1000,
  });

  const paused = processEffectRuntime(state);
  const paymentDecision = must(paused.state.pendingDecision, "pay cost");
  assert.equal(paymentDecision.type, "payCost");
  assert.deepEqual(paymentDecision.paymentOptions, [
    {
      id: "trashFromHand",
      type: "trashFromHand",
      count: 0,
      maxCount: "available",
      filter: { categories: ["event", "stage"] },
    },
  ]);

  const paid = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: paymentDecision.id,
    response: {
      type: "payment",
      optionId: "trashFromHand",
      selectedCardInstanceIds: [eventCard.instanceId, stageCard.instanceId],
    },
  });

  assert.equal(paid.errors, undefined);
  assert.equal(paid.state.pendingDecision, undefined);
  assert.equal(paid.state.effectExecutionFrames.length, 0);
  assert.equal(
    must(paid.state.players[p1], "after p1").trash.some(
      (card) => card.instanceId === eventCard.instanceId,
    ),
    true,
  );
  assert.equal(
    must(paid.state.players[p1], "after p1").trash.some(
      (card) => card.instanceId === stageCard.instanceId,
    ),
    true,
  );
  assert.equal(
    must(paid.state.players[p1], "after p1").hand.some(
      (card) => card.instanceId === characterCard.instanceId,
    ),
    true,
  );
  assert.deepEqual(
    paid.state.continuousEffects.map((effect) => effect.modifier),
    [
      {
        layer: "powerAdd",
        target: { type: "self" },
        operation: { type: "addPower", value: 2000 },
      },
    ],
  );
  assert.equal(paid.stateHash, hashCanonicalStateValue(paid.state));
});

test("variable hand-trash cost rejects nonmatching selected cards without mutation", () => {
  const { state } = sequenceQueueState(
    optionalVariableHandTrashThenPowerSequence(),
  );
  const p1State = must(state.players[p1], "p1");
  const eventCard = must(p1State.hand[0], "event payment");
  const characterCard = must(p1State.hand[1], "nonmatching payment");
  state.cardManifest.cards[eventCard.cardId] = resolvedCard({
    cardId: eventCard.cardId,
    category: "event",
  });
  state.cardManifest.cards[characterCard.cardId] = resolvedCard({
    cardId: characterCard.cardId,
    category: "character",
    power: 1000,
  });
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pay cost");

  const rejected = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "trashFromHand",
      selectedCardInstanceIds: [eventCard.instanceId, characterCard.instanceId],
    },
  });

  assert.equal(
    must(rejected.errors, "errors")[0]?.type,
    "invalidDecisionResponse",
  );
  assert.deepEqual(rejected.state, paused.state);
});

test("optional hand-trash cost decline skips filtered target selection and saved-target KO", () => {
  const { state } = sequenceQueueState(
    optionalHandTrashThenFilteredKoSequence(4),
  );
  const p2State = must(state.players[p2], "p2");
  const target = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "target"),
    zone: "characterArea",
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    cost: 4,
    power: 3000,
  });

  const paused = processEffectRuntime(state);
  const declined = declinePayment(paused.state);

  assert.equal(declined.errors, undefined);
  assert.equal(declined.state.pendingDecision, undefined);
  assert.equal(declined.state.effectExecutionFrames.length, 0);
  assert.equal(
    must(declined.state.players[p2], "after p2").characters.some(
      (card) => card.instanceId === target.instanceId,
    ),
    true,
  );
  assert.deepEqual(eventTypes(declined.events), [
    "decisionResolved",
    "effectResolved",
  ]);
  assert.equal(
    declined.events.some((event) => event.type === "cardKOd"),
    false,
  );
  assert.equal(declined.stateHash, hashCanonicalStateValue(declined.state));
});

test("optional hand-trash cost supports zero legal filtered KO targets after payment", () => {
  const { state } = sequenceQueueState(
    optionalHandTrashThenFilteredKoSequence(3),
  );
  const paymentCard = must(must(state.players[p1], "p1").hand[0], "payment");
  const p2State = must(state.players[p2], "p2");
  const expensiveTarget = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "expensive target"),
    zone: "characterArea",
  });
  state.cardManifest.cards[expensiveTarget.cardId] = resolvedCard({
    cardId: expensiveTarget.cardId,
    category: "character",
    cost: 4,
    power: 4000,
  });

  const paused = processEffectRuntime(state);
  const paid = payWithHandCard(paused.state, paymentCard);
  const targetDecision = must(paid.state.pendingDecision, "target decision");
  assert.equal(paid.errors, undefined);
  assert.equal(targetDecision.type, "selectTargets");
  assert.deepEqual(targetDecision.candidates, []);
  assert.equal(
    filterStateForPlayer(paid.state, p1).legalActions.some(
      (action) =>
        action.type === "respondToDecision" &&
        action.decisionId === targetDecision.id,
    ),
    true,
  );

  const resolved = applyAction(paid.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: { type: "targets", targets: [] },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(
    must(resolved.state.players[p2], "after p2").characters.some(
      (card) => card.instanceId === expensiveTarget.instanceId,
    ),
    true,
  );
  assert.equal(
    resolved.events.some((event) => event.type === "cardKOd"),
    false,
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("optional hand-trash cost resumes nested filtered KO sequence when zero targets are chosen", () => {
  const { state } = sequenceQueueState(
    optionalHandTrashThenNestedFilteredKoSequence(3),
  );
  const paymentCard = must(must(state.players[p1], "p1").hand[0], "payment");
  const p2State = must(state.players[p2], "p2");
  const expensiveTarget = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "expensive target"),
    zone: "characterArea",
  });
  state.cardManifest.cards[expensiveTarget.cardId] = resolvedCard({
    cardId: expensiveTarget.cardId,
    category: "character",
    cost: 4,
    power: 4000,
  });

  const paused = processEffectRuntime(state);
  const paid = payWithHandCard(paused.state, paymentCard);
  const targetDecision = must(paid.state.pendingDecision, "target decision");
  assert.equal(paid.errors, undefined);
  assert.equal(targetDecision.type, "selectTargets");
  assert.deepEqual(targetDecision.candidates, []);

  const resolved = applyAction(paid.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: { type: "targets", targets: [] },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(resolved.state.effectExecutionFrames.length, 0);
  assert.equal(
    must(resolved.state.players[p2], "after p2").characters.some(
      (card) => card.instanceId === expensiveTarget.instanceId,
    ),
    true,
  );
  assert.equal(
    resolved.events.some((event) => event.type === "cardKOd"),
    false,
  );
  assert.equal(resolved.stateHash, hashCanonicalStateValue(resolved.state));
});

test("optional hand-trash cost filtered target threshold is variable", () => {
  const run = (costMax: number): EngineResult => {
    const { state } = sequenceQueueState(
      optionalHandTrashThenFilteredKoSequence(costMax),
    );
    const paymentCard = must(must(state.players[p1], "p1").hand[0], "payment");
    const p2State = must(state.players[p2], "p2");
    const target = withCardInZone({
      state,
      playerId: p2,
      card: must(p2State.hand[0], "target"),
      zone: "characterArea",
    });
    state.cardManifest.cards[target.cardId] = resolvedCard({
      cardId: target.cardId,
      category: "character",
      cost: 4,
      power: 4000,
    });
    const paid = payWithHandCard(
      processEffectRuntime(state).state,
      paymentCard,
    );
    const decision = must(paid.state.pendingDecision, "target decision");
    assert.equal(decision.type, "selectTargets");
    return applyAction(paid.state, {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "targets",
        targets: decision.candidates.map((candidate) => candidate.card),
      },
    });
  };

  const below = run(3);
  const exact = run(4);

  assert.equal(
    below.events.some((event) => event.type === "cardKOd"),
    false,
  );
  assert.equal(
    exact.events.some((event) => event.type === "cardKOd"),
    true,
  );
});

test("optional hand-trash cost rejects malformed stale forged payment and target responses without mutation", () => {
  const { state } = sequenceQueueState(
    optionalHandTrashThenFilteredKoSequence(4),
  );
  const paymentCard = must(must(state.players[p1], "p1").hand[0], "payment");
  const p2State = must(state.players[p2], "p2");
  const target = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "target"),
    zone: "characterArea",
  });
  state.cardManifest.cards[target.cardId] = resolvedCard({
    cardId: target.cardId,
    category: "character",
    cost: 4,
    power: 3000,
  });
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "payment decision");

  const invalidPaymentActions: Array<
    Extract<Action, { type: "respondToDecision" }>
  > = [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "payment",
        optionId: "trashFromHand",
        selectedCardInstanceIds: [],
      },
    },
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "payment",
        optionId: "trashFromHand",
        selectedCardInstanceIds: [
          paymentCard.instanceId,
          paymentCard.instanceId,
        ],
      },
    },
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "payment",
        optionId: "trashFromHand",
        selectedCardInstanceIds: ["missing-card" as CardInstance["instanceId"]],
      },
    },
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "payment",
        optionId: "trashFromHand",
        selectedCardInstanceIds: [paymentCard.instanceId],
        selectedDonInstanceIds: ["forged-don" as CardInstance["instanceId"]],
      },
    },
    {
      type: "respondToDecision",
      decisionId: decision.id,
      playerId: p2,
      response: {
        type: "payment",
        optionId: "trashFromHand",
        selectedCardInstanceIds: [paymentCard.instanceId],
      },
    } as unknown as Extract<Action, { type: "respondToDecision" }>,
  ];

  for (const action of invalidPaymentActions) {
    const beforeHash = hashCanonicalStateValue(paused.state);
    const result = applyAction(paused.state, action);
    assert.equal(
      must(result.errors, "invalid payment errors")[0]?.type,
      "invalidDecisionResponse",
    );
    assert.deepEqual(result.state, paused.state);
    assert.equal(result.stateHash, beforeHash);
  }

  const stale = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: toDecisionId("decision:payCost:sequence:stale"),
    response: { type: "paymentDeclined" },
  });
  assert.equal(must(stale.errors, "stale errors")[0]?.type, "illegalAction");
  assert.deepEqual(stale.state, paused.state);

  const paid = payWithHandCard(paused.state, paymentCard);
  const targetDecision = must(paid.state.pendingDecision, "target decision");
  assert.equal(targetDecision.type, "selectTargets");
  const invalidTarget = applyAction(paid.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: {
      type: "targets",
      targets: [
        {
          ...must(targetDecision.candidates[0], "candidate").card,
          instanceId: "forged-target" as CardInstance["instanceId"],
        },
      ],
    },
  });
  assert.equal(
    must(invalidTarget.errors, "invalid target errors")[0]?.type,
    "invalidDecisionResponse",
  );
  assert.deepEqual(invalidTarget.state, paid.state);
});

test("optional hand-trash accept decline and failure branches keep replay hash deterministic", () => {
  const run = (mode: "accept" | "decline" | "malformed" | "targetReject") => {
    const { state } = sequenceQueueState(
      optionalHandTrashThenFilteredKoSequence(4),
    );
    const paymentCard = must(must(state.players[p1], "p1").hand[0], "payment");
    const p2State = must(state.players[p2], "p2");
    const target = withCardInZone({
      state,
      playerId: p2,
      card: must(p2State.hand[0], "target"),
      zone: "characterArea",
    });
    state.cardManifest.cards[target.cardId] = resolvedCard({
      cardId: target.cardId,
      category: "character",
      cost: 4,
      power: 3000,
    });
    const paused = processEffectRuntime(state);
    if (mode === "decline") {
      return declinePayment(paused.state);
    }
    if (mode === "malformed") {
      return applyAction(paused.state, {
        type: "respondToDecision",
        decisionId: must(paused.state.pendingDecision, "decision").id,
        response: {
          type: "payment",
          optionId: "trashFromHand",
          selectedCardInstanceIds: [],
        },
      });
    }
    const paid = payWithHandCard(paused.state, paymentCard);
    const targetDecision = must(paid.state.pendingDecision, "target decision");
    assert.equal(targetDecision.type, "selectTargets");
    if (mode === "targetReject") {
      return applyAction(paid.state, {
        type: "respondToDecision",
        decisionId: targetDecision.id,
        response: {
          type: "targets",
          targets: [
            {
              ...must(targetDecision.candidates[0], "candidate").card,
              instanceId: "forged-target" as CardInstance["instanceId"],
            },
          ],
        },
      });
    }
    return applyAction(paid.state, {
      type: "respondToDecision",
      decisionId: targetDecision.id,
      response: {
        type: "targets",
        targets: [must(targetDecision.candidates[0], "candidate").card],
      },
    });
  };

  for (const mode of [
    "accept",
    "decline",
    "malformed",
    "targetReject",
  ] as const) {
    const first = run(mode);
    const second = run(mode);
    assert.deepEqual(first.events, second.events);
    assert.deepEqual(first.state.eventJournal, second.state.eventJournal);
    assert.equal(first.stateHash, second.stateHash);
    assert.equal(first.stateHash, hashCanonicalStateValue(first.state));
  }
});
