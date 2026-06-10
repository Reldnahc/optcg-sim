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
  HandSelectionId,
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
  effect: Effect = optionalReturnDonThenPauseSequence(),
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

const placeActiveDon = (state: GameState, playerId = p1): void => {
  const player = must(state.players[playerId], "player");
  const don = must(player.donDeck[0], "don");
  player.donDeck = player.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId, slot: "donDeck", index },
  }));
  player.costArea = [
    ...player.costArea,
    {
      ...don,
      zone: { zone: "costArea", playerId, slot: "cost", index: 0 },
      state: "active",
    },
  ];
};

const placeRestedDon = (state: GameState, playerId = p1): void => {
  const player = must(state.players[playerId], "player");
  const don = must(player.donDeck[0], "don");
  player.donDeck = player.donDeck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "donDeck", playerId, slot: "donDeck", index },
  }));
  player.costArea = [
    ...player.costArea,
    {
      ...don,
      zone: {
        zone: "costArea",
        playerId,
        slot: "cost",
        index: player.costArea.length,
      },
      state: "rested",
    },
  ];
};

const attachFirstCostDonToLeader = (
  state: GameState,
  playerId = p1,
): CardInstance["instanceId"] => {
  const player = must(state.players[playerId], "player");
  const don = must(player.costArea[0], "cost DON");
  player.leader = {
    ...player.leader,
    attachedDon: [...player.leader.attachedDon, don.instanceId],
  };
  const attachedDon = { ...don };
  delete attachedDon.state;
  player.costArea = [{ ...attachedDon }, ...player.costArea.slice(1)];
  return don.instanceId;
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

const eventTypes = (events: readonly EngineEvent[]): string[] =>
  events.map((event) => event.type);

const unsupportedHandSelectionSequence = (
  effect: Extract<Effect, { type: "selectCards" }>,
): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "draw-before-selection",
      connector: "always",
      effect: { type: "draw", player: "self", count: 1 },
    },
    {
      id: "unsupported-selection",
      connector: "then",
      effect,
    },
  ],
});

test("optional returnDon rejects duplicate and wrong-player responses without mutation", () => {
  const { state } = sequenceQueueState(optionalReturnDonThenPauseSequence());
  placeActiveDon(state);
  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pay cost");
  assert.equal(decision.type, "payCost");
  const selected = must(
    must(paused.state.players[p1], "p1").costArea[0],
    "selected DON",
  );

  const duplicate = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "returnDon",
      selectedDonInstanceIds: [selected.instanceId, selected.instanceId],
    },
  });
  assert.equal(
    must(duplicate.errors, "duplicate errors")[0]?.type,
    "invalidDecisionResponse",
  );
  assert.deepEqual(duplicate.state, paused.state);

  const wrongPlayer = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    playerId: p2,
    response: {
      type: "payment",
      optionId: "returnDon",
      selectedDonInstanceIds: [selected.instanceId],
    },
  } as unknown as Extract<Action, { type: "respondToDecision" }>);
  assert.equal(
    must(wrongPlayer.errors, "wrong-player errors")[0]?.type,
    "invalidDecisionResponse",
  );
  assert.deepEqual(wrongPlayer.state, paused.state);
});

test("optional returnDon cost payment records costPaid and returns DON to DON deck", () => {
  const { state } = sequenceQueueState(optionalReturnDonThenPauseSequence());
  placeActiveDon(state);
  const beforeP1 = must(state.players[p1], "before p1");
  const beforeDonDeck = beforeP1.donDeck.length;
  const returned = must(beforeP1.costArea[0], "returned DON");

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pay cost decision");
  assert.equal(decision.type, "payCost");
  assert.equal(decision.cost.type, "returnDon");
  const paid = payWithFirstCostAreaDon(paused.state);
  const afterP1 = must(paid.state.players[p1], "after p1");

  assert.equal(paid.errors, undefined);
  assert.equal(
    afterP1.costArea.some((card) => card.instanceId === returned.instanceId),
    false,
  );
  assert.equal(afterP1.donDeck.length, beforeDonDeck + 1);
  assert.equal(
    must(
      afterP1.donDeck.find((card) => card.instanceId === returned.instanceId),
      "returned card in DON deck",
    ).zone.zone,
    "donDeck",
  );
  assert.deepEqual(
    eventTypes(paid.events).filter((type) => type === "costPaid"),
    ["costPaid"],
  );
});

test("active-only returnDon cost exposes and validates only active DON", () => {
  const { state } = sequenceQueueState({
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "payCost",
          cost: {
            type: "returnDon",
            count: 1,
            sourceState: "active",
            optional: true,
          },
        },
      },
      {
        connector: "ifYouDo",
        effect: { type: "draw", player: "self", count: 1 },
      },
    ],
  });
  placeRestedDon(state);
  placeActiveDon(state);

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pay cost decision");
  assert.equal(decision.type, "payCost");
  assert.deepEqual(decision.paymentOptions, [
    {
      id: "returnDon",
      type: "returnDon",
      count: 1,
      sourceState: "active",
    },
  ]);
  const player = must(paused.state.players[p1], "paused p1");
  const rested = must(
    player.costArea.find((card) => card.state === "rested"),
    "rested DON",
  );
  const active = must(
    player.costArea.find((card) => card.state === "active"),
    "active DON",
  );

  const rejected = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "returnDon",
      selectedDonInstanceIds: [rested.instanceId],
    },
  });
  assert.equal(
    must(rejected.errors, "rested selection errors")[0]?.type,
    "invalidDecisionResponse",
  );

  const paid = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "returnDon",
      selectedDonInstanceIds: [active.instanceId],
    },
  });
  assert.equal(paid.errors, undefined);
  assert.equal(
    must(paid.state.players[p1], "after p1").costArea.some(
      (card) => card.instanceId === active.instanceId,
    ),
    false,
  );
});

test("optional turnLifeFaceUp cost flips Life public and resumes the sequence", () => {
  const { state } = sequenceQueueState({
    type: "sequence",
    effects: [
      {
        id: "turn-life-face-up",
        connector: "always",
        effect: {
          type: "payCost",
          cost: {
            type: "turnLifeFaceUp",
            count: 1,
            player: "self",
            position: "top",
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
  assert.equal(topLife.faceUp, false);
  const beforeHandCount = before.hand.length;

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pay cost decision");
  assert.equal(decision.type, "payCost");
  assert.equal(decision.cost.type, "turnLifeFaceUp");
  assert.deepEqual(decision.paymentOptions, [
    {
      id: "turnLifeFaceUp:top",
      type: "turnLifeFaceUp",
      count: 1,
      player: "self",
      position: "top",
    },
  ]);

  const paid = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "turnLifeFaceUp:top",
    },
  });
  const after = must(paid.state.players[p1], "after p1");

  assert.equal(paid.errors, undefined);
  assert.equal(must(after.life[0], "after top Life").faceUp, true);
  assert.equal(
    filterStateForPlayer(paid.state, p1).self.life.faceUpCards[0]?.cardId,
    topLife.card.cardId,
  );
  assert.equal(
    filterStateForPlayer(paid.state, p2).opponent.life.faceUpCards[0]?.cardId,
    topLife.card.cardId,
  );
  assert.equal(after.hand.length, beforeHandCount + 1);
  assert.deepEqual(
    eventTypes(paid.events).filter(
      (type) =>
        type === "cardRevealed" || type === "costPaid" || type === "cardDrawn",
    ),
    ["cardRevealed", "costPaid", "cardDrawn"],
  );
  const revealed = must(
    paid.events.find((event) => event.type === "cardRevealed"),
    "cardRevealed event",
  );
  assert.equal(revealed.visibility.type, "public");
  assert.deepEqual(revealed.payload, {
    revealId: `reveal:life-face-up:${String(decision.id)}`,
    cards: [
      {
        instanceId: topLife.card.instanceId,
        cardId: topLife.card.cardId,
        playerId: p1,
        zone: {
          zone: "life",
          playerId: p1,
          slot: "life",
          index: 0,
        },
      },
    ],
    origin: "life",
    reason: "turnLifeFaceUpCost",
  });
});

test("optional returnDon may pay using attached DON and detaches host attachment", () => {
  const { state } = sequenceQueueState(optionalReturnDonThenPauseSequence());
  placeActiveDon(state);
  const attachedId = attachFirstCostDonToLeader(state);
  const before = must(state.players[p1], "before p1");
  const beforeDonDeck = before.donDeck.length;

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "pay cost decision");
  assert.equal(decision.type, "payCost");
  assert.equal(decision.cost.type, "returnDon");
  const paid = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "returnDon",
      selectedDonInstanceIds: [attachedId],
    },
  });
  const after = must(paid.state.players[p1], "after p1");

  assert.equal(paid.errors, undefined);
  assert.equal(after.leader.attachedDon.includes(attachedId), false);
  assert.equal(
    after.costArea.some((card) => card.instanceId === attachedId),
    false,
  );
  assert.equal(after.donDeck.length, beforeDonDeck + 1);
});

test("optional returnDon with insufficient eligible DON does not create payCost decision", () => {
  const { state } = sequenceQueueState({
    type: "sequence",
    effects: [
      {
        connector: "always",
        effect: {
          type: "payCost",
          cost: { type: "returnDon", count: 2, optional: true },
        },
      },
      {
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
  placeActiveDon(state);
  attachFirstCostDonToLeader(state);

  const paused = processEffectRuntime(state);
  const decision = must(paused.state.pendingDecision, "next decision");
  assert.equal(decision.type, "selectCards");
  assert.equal(String(decision.id).startsWith("decision:payCost"), false);
  const p2Legal = filterStateForPlayer(paused.state, p2).legalActions;
  assert.equal(
    p2Legal.some((action) => action.type === "respondToDecision"),
    false,
  );
});

test("private hand selection decision records selectedCards reference for later playSelected consumption", () => {
  const { state } = sequenceQueueState(handSelectionThenPauseSequence());
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
  const decision = must(
    paused.state.pendingDecision,
    "hand-selection decision",
  );
  assert.equal(decision.type, "selectCards");
  assert.deepEqual(decision.visibility, { type: "private", playerId: p1 });
  assert.equal(decision.request.zone, "hand");
  assert.deepEqual(decision.request.filter, { categories: ["character"] });

  const selected = must(decision.candidates[0], "first candidate").card;
  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "cards", cards: [selected] },
  });
  const frame = must(
    resolved.state.effectExecutionFrames[0],
    "frame after selection",
  );

  assert.equal(resolved.errors, undefined);
  assert.equal(
    resolved.state.pendingDecision?.type,
    "chooseOptionalActivation",
  );
  assert.equal(resolved.state.effectExecutionFrames.length, 1);
  assert.deepEqual(frame.savedReferences["handSelection:test"], {
    kind: "selectedCards",
    cards: [selected],
  });
  const p2View = filterStateForPlayer(resolved.state, p2);
  assert.equal(JSON.stringify(p2View).includes("handSelection:test"), false);
});

test("hand-selection decisions from separate sequence segments have unique deterministic ids", () => {
  const sequence: Extract<Effect, { type: "sequence" }> = {
    type: "sequence",
    effects: [
      {
        id: "draw-before-selection",
        connector: "always",
        effect: { type: "draw", player: "self", count: 1 },
      },
      {
        id: "select-one",
        connector: "then",
        effect: {
          type: "selectCards",
          zone: "hand",
          player: "self",
          chooser: "self",
          min: 1,
          max: 1,
          filter: { categories: ["character"] },
          saveAs: "handSelection:first" as HandSelectionId,
          visibility: "chooserOnly",
        },
      },
      {
        id: "select-two",
        connector: "always",
        effect: {
          type: "selectCards",
          zone: "hand",
          player: "self",
          chooser: "self",
          min: 1,
          max: 1,
          filter: { categories: ["character"] },
          saveAs: "handSelection:second" as HandSelectionId,
          visibility: "chooserOnly",
        },
      },
    ],
  };
  const { state } = sequenceQueueState(sequence);
  const p1State = must(state.players[p1], "p1");
  for (const card of p1State.hand) {
    state.cardManifest.cards[card.cardId] = resolvedCard({
      cardId: card.cardId,
      category: "character",
      cost: 1,
      power: 1000,
    });
  }

  const firstPause = processEffectRuntime(state);
  const firstDecision = must(
    firstPause.state.pendingDecision,
    "first decision",
  );
  assert.equal(firstDecision.type, "selectCards");
  const firstSelected = must(
    firstDecision.candidates[0],
    "first candidate",
  ).card;

  const secondPause = applyAction(firstPause.state, {
    type: "respondToDecision",
    decisionId: firstDecision.id,
    response: { type: "cards", cards: [firstSelected] },
  });
  const secondDecision = must(
    secondPause.state.pendingDecision,
    "second decision",
  );
  assert.equal(secondDecision.type, "selectCards");
  assert.notEqual(secondDecision.id, firstDecision.id);

  const staleFirst = applyAction(secondPause.state, {
    type: "respondToDecision",
    decisionId: firstDecision.id,
    response: { type: "cards", cards: [firstSelected] },
  });
  assert.equal(
    must(staleFirst.errors, "stale errors")[0]?.type,
    "illegalAction",
  );
  assert.deepEqual(staleFirst.state, secondPause.state);
});

test("unsupported hand-selection shapes fail closed for zone/chooser-visibility/filter matrix", () => {
  const unsupportedEffects: Array<Extract<Effect, { type: "selectCards" }>> = [
    {
      type: "selectCards",
      zone: "deck",
      player: "self",
      chooser: "self",
      min: 1,
      max: 1,
      filter: { categories: ["character"] },
      saveAs: "handSelection:unsupported-zone" as HandSelectionId,
      visibility: "chooserOnly",
    },
    {
      type: "selectCards",
      zone: "hand",
      player: "self",
      chooser: "opponent",
      min: 1,
      max: 1,
      filter: { categories: ["character"] },
      saveAs: "handSelection:unsupported-chooser" as HandSelectionId,
      visibility: "chooserOnly",
    },
    {
      type: "selectCards",
      zone: "hand",
      player: "opponent",
      chooser: "self",
      min: 1,
      max: 1,
      filter: { categories: ["character"] },
      saveAs: "handSelection:unsupported-player" as HandSelectionId,
      visibility: "chooserOnly",
    },
    {
      type: "selectCards",
      zone: "hand",
      player: "self",
      chooser: "self",
      min: 1,
      max: 1,
      filter: { categories: ["character"] },
      saveAs: "handSelection:unsupported-visibility" as HandSelectionId,
      visibility: "bothPlayers",
    },
    {
      type: "selectCards",
      zone: "hand",
      player: "self",
      chooser: "self",
      min: 1,
      max: 1,
      filter: { custom: "unsupported-filter" },
      saveAs: "handSelection:unsupported-filter" as HandSelectionId,
      visibility: "chooserOnly",
    },
  ];

  for (const selection of unsupportedEffects) {
    const { state } = sequenceQueueState(
      unsupportedHandSelectionSequence(selection),
    );
    const before = structuredClone(state);
    const result = processEffectRuntime(state);
    assert.deepEqual(result.state, before);
    assert.deepEqual(result.events, []);
    assert.equal(
      must(result.errors, "unsupported selection errors")[0]?.type,
      "effectRuntimeError",
    );
    assert.equal(
      filterStateForPlayer(result.state, p2).legalActions.some(
        (action) => action.type === "respondToDecision",
      ),
      false,
    );
  }
});

test("hand-selection stale response is rejected without mutation", () => {
  const { state } = sequenceQueueState(handSelectionThenPauseSequence());
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
  const before = structuredClone(paused.state);

  const stale = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: toDecisionId("decision:selectCards:hand-selection:stale"),
    response: { type: "cards", cards: [] },
  });
  assert.equal(must(stale.errors, "stale errors")[0]?.type, "illegalAction");
  assert.deepEqual(stale.state, before);
  assert.equal(stale.stateHash, hashCanonicalStateValue(stale.state));
});

test("returnDon and hand-selection accepted and stale branches stay deterministic for replay/state hash", () => {
  const runReturnDon = (mode: "pay" | "stale"): EngineResult => {
    const { state } = sequenceQueueState(optionalReturnDonThenPauseSequence());
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
    const { state } = sequenceQueueState(handSelectionThenPauseSequence());
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
