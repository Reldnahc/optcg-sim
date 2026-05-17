import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  CardInstance,
  CardRef,
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
} from "./effect-runtime-queue-processing-test-support.js";

const resumableSequence = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      id: "first-draw",
      connector: "always",
      effect: { type: "draw", player: "self", count: 1 },
      saveResultAs: "firstDraw",
    },
    {
      id: "trash-drawn-card",
      connector: "then",
      effect: {
        type: "trashFromHand",
        player: "self",
        chooser: "self",
        count: 1,
      },
      saveResultAs: "trashedCard",
    },
    {
      id: "second-draw",
      connector: "ifPreviousSucceeded",
      effect: { type: "draw", player: "self", count: 1 },
      saveResultAs: "secondDraw",
    },
  ],
});

const unsupportedSequence = (): Extract<Effect, { type: "sequence" }> => ({
  type: "sequence",
  effects: [
    {
      connector: "always",
      effect: { type: "draw", player: "self", count: 1 },
    },
    {
      connector: "ifYouDo",
      effect: { type: "draw", player: "self", count: 1 },
    },
  ],
});

const optionalClauseThenPauseSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-draw",
      connector: "always",
      optional: true,
      effect: { type: "draw", player: "self", count: 1 },
    },
    {
      id: "dependent-draw",
      connector: "ifYouDo",
      effect: { type: "draw", player: "self", count: 1 },
    },
    {
      id: "pause-after-optional",
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

const optionalTrashClauseSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "draw-before-optional-trash",
      connector: "always",
      effect: { type: "draw", player: "self", count: 1 },
    },
    {
      id: "optional-trash",
      connector: "then",
      optional: true,
      effect: {
        type: "trashFromHand",
        player: "self",
        chooser: "self",
        count: 1,
      },
    },
    {
      id: "draw-if-trashed",
      connector: "ifYouDo",
      effect: { type: "draw", player: "self", count: 1 },
    },
    {
      id: "pause-after-optional-trash",
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

const optionalCostThenPauseSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-rest-don",
      connector: "always",
      effect: {
        type: "payCost",
        cost: { type: "restDon", count: 1, optional: true },
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

const drawUpToThenPauseSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "draw-up-to",
      connector: "always",
      effect: { type: "drawUpTo", player: "self", count: 3 },
    },
    {
      id: "draw-after-draw-up-to",
      connector: "ifYouDo",
      effect: { type: "draw", player: "self", count: 1 },
    },
  ],
});

const drawUpToThenDrawThenPauseSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "draw-up-to",
      connector: "always",
      effect: { type: "drawUpTo", player: "self", count: 3 },
    },
    {
      id: "draw-after-draw-up-to",
      connector: "ifYouDo",
      effect: { type: "draw", player: "self", count: 1 },
    },
    {
      id: "draw-up-to-pause-after-resume",
      connector: "always",
      effect: { type: "drawUpTo", player: "self", count: 1 },
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

const handRef = (card: CardInstance, playerId = p1): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

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
  effect: Effect = resumableSequence(),
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

const respondWithCards = (
  state: GameState,
  cards: readonly CardRef[],
): EngineResult =>
  applyAction(state, {
    type: "respondToDecision",
    decisionId: must(state.pendingDecision, "pending decision").id,
    response: { type: "cards", cards: [...cards] },
  });

const respondWithOptionalActivation = (
  state: GameState,
  choice: "activate" | "decline",
): EngineResult =>
  applyAction(state, {
    type: "respondToDecision",
    decisionId: must(state.pendingDecision, "pending decision").id,
    response: { type: "optionalActivation", choice },
  });

const declinePayment = (state: GameState): EngineResult =>
  applyAction(state, {
    type: "respondToDecision",
    decisionId: must(state.pendingDecision, "pending decision").id,
    response: { type: "paymentDeclined" },
  });

const payWithFirstActiveDon = (state: GameState): EngineResult => {
  const decision = must(state.pendingDecision, "pending decision");
  const player = must(state.players[decision.playerId], "decision player");
  const don = must(
    player.costArea.find((card) => card.state === "active"),
    "active DON",
  );
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restDon",
      selectedDonInstanceIds: [don.instanceId],
    },
  });
};

const eventTypes = (events: readonly EngineEvent[]): string[] =>
  events.map((event) => event.type);

test("sequence pause stores a resumable execution frame with segment results and saved references", () => {
  const { state } = sequenceQueueState();
  const beforeP1 = must(state.players[p1], "p1 before");
  const firstDrawn = must(beforeP1.deck[0], "first drawn card");

  const result = processEffectRuntime(state);
  const decision = must(result.state.pendingDecision, "pending decision");
  const frame = must(result.state.effectExecutionFrames[0], "execution frame");

  assert.equal(result.errors, undefined);
  assert.equal(decision.type, "selectCards");
  assert.equal(decision.causedBy.type, "effect");
  assert.equal(decision.causedBy.queueEntryId, frame.queueEntryId);
  assert.equal(decision.causedBy.effectId, frame.effectBlockId);
  assert.equal(frame.pendingDecision.decisionId, decision.id);
  assert.equal(frame.pendingDecision.causedBy, decision.causedBy);
  assert.equal(frame.pendingDecision.resumeAtSegmentIndex, 1);
  assert.equal(frame.nextSegmentIndex, 2);
  assert.deepEqual(frame.effectPath, ["effect", "sequence"]);
  assert.deepEqual(frame.segmentResults["0"], {
    attempted: true,
    succeeded: true,
    changedState: true,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  });
  assert.deepEqual(frame.segmentResults["1"], {
    attempted: true,
    succeeded: false,
    changedState: false,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  });
  assert.deepEqual(frame.savedReferences["firstDraw"], {
    kind: "producedObjects",
    objects: [
      {
        binding: {
          family: "producedObjects",
          objectIndex: 0,
          saveResultAs: "firstDraw",
          sourceSegmentId: "first-draw",
        },
        capturedAtStateSeq: result.state.seq - 1,
        object: {
          instanceId: firstDrawn.instanceId,
          cardId: firstDrawn.cardId,
          playerId: p1,
          zone: {
            zone: "hand",
            playerId: p1,
            slot: "hand",
            index: beforeP1.hand.length,
          },
        },
        visibility: "public",
      },
    ],
  });
  assert.deepEqual(frame.transientSets, {});
  assert.equal(result.state.effectQueue[0]?.state, "resolving");
  assert.equal(
    JSON.stringify(filterStateForPlayer(result.state, p2)).includes(
      "effectExecutionFrames",
    ),
    false,
  );
});

test("sequence response resumes after the paused segment without replaying completed segments", () => {
  const run = () => {
    const { state } = sequenceQueueState();
    const before = structuredClone(state);
    const paused = processEffectRuntime(state);
    const pausedP1 = must(paused.state.players[p1], "paused p1");
    const firstDrawn = must(
      pausedP1.hand[pausedP1.hand.length - 1],
      "first drawn hand card",
    );

    const resolved = respondWithCards(paused.state, [handRef(firstDrawn)]);
    return { before, paused, resolved, firstDrawn };
  };

  const first = run();
  const second = run();
  const afterP1 = must(first.resolved.state.players[p1], "after p1");

  assert.equal(first.resolved.errors, undefined);
  assert.equal(first.resolved.state.pendingDecision, undefined);
  assert.deepEqual(first.resolved.state.effectExecutionFrames, []);
  assert.deepEqual(first.resolved.state.effectQueue, []);
  assert.equal(
    afterP1.trash.some(
      (card) => card.instanceId === first.firstDrawn.instanceId,
    ),
    true,
  );
  assert.equal(
    afterP1.hand.some(
      (card) => card.instanceId === first.firstDrawn.instanceId,
    ),
    false,
  );
  assert.equal(
    afterP1.deck.length,
    must(first.before.players[p1], "before p1").deck.length - 2,
  );
  assert.deepEqual(
    eventTypes(first.resolved.events).filter((type) => type === "cardDrawn"),
    ["cardDrawn"],
  );
  assert.deepEqual(first.resolved.events, second.resolved.events);
  assert.deepEqual(
    first.resolved.state.eventJournal,
    second.resolved.state.eventJournal,
  );
  assert.equal(first.resolved.stateHash, second.resolved.stateHash);
  assert.equal(
    first.resolved.stateHash,
    hashCanonicalStateValue(first.resolved.state),
  );
});

test("unsupported generic sequence shapes fail closed before mutation", () => {
  const { state } = sequenceQueueState(unsupportedSequence());
  const before = structuredClone(state);

  const result = processEffectRuntime(state);

  assert.deepEqual(result.state, before);
  assert.deepEqual(result.events, []);
  assert.equal(must(result.errors, "errors")[0]?.type, "effectRuntimeError");
});

test("optional sequence clause decline records playerDeclined and skips ifYouDo before the next pause", () => {
  const { state } = sequenceQueueState(optionalClauseThenPauseSequence());
  const beforeDeckCount = must(state.players[p1], "before p1").deck.length;

  const paused = processEffectRuntime(state);
  const optionalDecision = must(paused.state.pendingDecision, "optional");

  assert.equal(paused.errors, undefined);
  assert.equal(optionalDecision.type, "chooseOptionalActivation");
  assert.equal(optionalDecision.playerId, p1);

  const declined = respondWithOptionalActivation(paused.state, "decline");
  const trashDecision = must(declined.state.pendingDecision, "trash decision");
  const frame = must(declined.state.effectExecutionFrames[0], "frame");

  assert.equal(declined.errors, undefined);
  assert.equal(trashDecision.type, "selectCards");
  assert.equal(frame.pendingDecision.decisionId, trashDecision.id);
  assert.deepEqual(frame.segmentResults["0"], {
    attempted: true,
    succeeded: false,
    changedState: false,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: true,
  });
  assert.deepEqual(frame.segmentResults["1"], {
    attempted: false,
    succeeded: false,
    changedState: false,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  });
  assert.equal(
    must(declined.state.players[p1], "declined p1").deck.length,
    beforeDeckCount,
  );
  assert.equal(
    JSON.stringify(filterStateForPlayer(declined.state, p2)).includes(
      "effectExecutionFrames",
    ),
    false,
  );
});

test("optional sequence clause activation executes and allows dependent ifYouDo before the next pause", () => {
  const { state } = sequenceQueueState(optionalClauseThenPauseSequence());
  const beforeDeckCount = must(state.players[p1], "before p1").deck.length;

  const paused = processEffectRuntime(state);
  const activated = respondWithOptionalActivation(paused.state, "activate");
  const trashDecision = must(activated.state.pendingDecision, "trash decision");
  const frame = must(activated.state.effectExecutionFrames[0], "frame");

  assert.equal(activated.errors, undefined);
  assert.equal(trashDecision.type, "selectCards");
  assert.deepEqual(frame.segmentResults["0"], {
    attempted: true,
    succeeded: true,
    changedState: true,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  });
  assert.deepEqual(frame.segmentResults["1"], {
    attempted: true,
    succeeded: true,
    changedState: true,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  });
  assert.equal(
    must(activated.state.players[p1], "activated p1").deck.length,
    beforeDeckCount - 2,
  );
});

test("optional trashFromHand clause accepts chooseOptionalActivation and resumes into selectCards pause", () => {
  const { state } = sequenceQueueState(optionalTrashClauseSequence());
  const beforeDeckCount = must(state.players[p1], "before p1").deck.length;

  const paused = processEffectRuntime(state);
  const optionalDecision = must(paused.state.pendingDecision, "optional");
  assert.equal(paused.errors, undefined);
  assert.equal(optionalDecision.type, "chooseOptionalActivation");

  const accepted = respondWithOptionalActivation(paused.state, "activate");
  const trashDecision = must(accepted.state.pendingDecision, "trash decision");
  const frame = must(accepted.state.effectExecutionFrames[0], "frame");
  assert.equal(accepted.errors, undefined);
  assert.equal(trashDecision.type, "selectCards");
  assert.deepEqual(frame.segmentResults["1"], {
    attempted: true,
    succeeded: false,
    changedState: false,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  });
  assert.equal(
    must(accepted.state.players[p1], "accepted p1").deck.length,
    beforeDeckCount - 1,
  );
});

test("optional trashFromHand clause decline records playerDeclined and deterministically skips ifYouDo", () => {
  const runDecline = (): EngineResult => {
    const { state } = sequenceQueueState(optionalTrashClauseSequence());
    const paused = processEffectRuntime(state);
    return respondWithOptionalActivation(paused.state, "decline");
  };
  const first = runDecline();
  const second = runDecline();

  const frame = must(first.state.effectExecutionFrames[0], "frame");
  assert.equal(first.errors, undefined);
  assert.equal(
    must(first.state.pendingDecision, "pending").type,
    "selectCards",
  );
  assert.deepEqual(frame.segmentResults["1"], {
    attempted: true,
    succeeded: false,
    changedState: false,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: true,
  });
  assert.deepEqual(frame.segmentResults["2"], {
    attempted: false,
    succeeded: false,
    changedState: false,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  });
  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.state.eventJournal, second.state.eventJournal);
  assert.equal(first.stateHash, second.stateHash);
});

test("optional cost decline records paidCost false and skips ifYouDo before the next pause", () => {
  const { state } = sequenceQueueState(optionalCostThenPauseSequence());
  placeActiveDon(state);
  const beforeDeckCount = must(state.players[p1], "before p1").deck.length;

  const paused = processEffectRuntime(state);
  const paymentDecision = must(paused.state.pendingDecision, "pay cost");

  assert.equal(paused.errors, undefined);
  assert.equal(paymentDecision.type, "payCost");
  assert.equal(paymentDecision.playerId, p1);
  assert.deepEqual(paymentDecision.defaultResponse, {
    type: "paymentDeclined",
  });

  const declined = declinePayment(paused.state);
  const trashDecision = must(declined.state.pendingDecision, "trash decision");
  const frame = must(declined.state.effectExecutionFrames[0], "frame");

  assert.equal(declined.errors, undefined);
  assert.equal(trashDecision.type, "selectCards");
  assert.deepEqual(frame.segmentResults["0"], {
    attempted: true,
    succeeded: false,
    changedState: false,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: true,
  });
  assert.deepEqual(frame.segmentResults["1"], {
    attempted: false,
    succeeded: false,
    changedState: false,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  });
  assert.equal(frame.savedReferences["paidOptionalCost"], undefined);
  assert.equal(
    must(declined.state.players[p1], "declined p1").deck.length,
    beforeDeckCount,
  );
});

test("optional cost payment records paidCost true, saves paidCost, and allows dependent ifYouDo", () => {
  const { state } = sequenceQueueState(optionalCostThenPauseSequence());
  placeActiveDon(state);
  const beforeP1 = must(state.players[p1], "before p1");
  const beforeDeckCount = beforeP1.deck.length;
  const activeDon = must(
    beforeP1.costArea.find((card) => card.state === "active"),
    "active DON",
  );

  const paused = processEffectRuntime(state);
  const paid = payWithFirstActiveDon(paused.state);
  const trashDecision = must(paid.state.pendingDecision, "trash decision");
  const frame = must(paid.state.effectExecutionFrames[0], "frame");
  const afterP1 = must(paid.state.players[p1], "after p1");

  assert.equal(paid.errors, undefined);
  assert.equal(trashDecision.type, "selectCards");
  assert.equal(
    must(
      afterP1.costArea.find((card) => card.instanceId === activeDon.instanceId),
      "paid DON",
    ).state,
    "rested",
  );
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
  });
  assert.deepEqual(frame.segmentResults["1"], {
    attempted: true,
    succeeded: true,
    changedState: true,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  });
  assert.equal(afterP1.deck.length, beforeDeckCount - 1);
  assert.deepEqual(
    eventTypes(paid.events).filter((type) => type === "costPaid"),
    ["costPaid"],
  );
  const costPaidEvent = must(
    paid.events.find((event) => event.type === "costPaid"),
    "costPaid event",
  );
  assert.deepEqual(costPaidEvent.visibility, { type: "public" });
  const p2View = filterStateForPlayer(paid.state, p2);
  assert.equal(JSON.stringify(p2View).includes('"type":"costPaid"'), true);
});

test("optional cost decision rejects malformed and stale responses without mutation", () => {
  const { state } = sequenceQueueState(optionalCostThenPauseSequence());
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

test("optional activation accept and decline branches are independently deterministic", () => {
  const run = (choice: "activate" | "decline") => {
    const { state } = sequenceQueueState(optionalClauseThenPauseSequence());
    const paused = processEffectRuntime(state);
    return respondWithOptionalActivation(paused.state, choice);
  };
  const acceptA = run("activate");
  const acceptB = run("activate");
  const declineA = run("decline");
  const declineB = run("decline");

  assert.deepEqual(acceptA.events, acceptB.events);
  assert.deepEqual(acceptA.state.eventJournal, acceptB.state.eventJournal);
  assert.equal(acceptA.stateHash, acceptB.stateHash);
  assert.deepEqual(declineA.events, declineB.events);
  assert.deepEqual(declineA.state.eventJournal, declineB.state.eventJournal);
  assert.equal(declineA.stateHash, declineB.stateHash);
});

test("optional cost accept and decline branches are independently deterministic", () => {
  const run = (choice: "pay" | "decline") => {
    const { state } = sequenceQueueState(optionalCostThenPauseSequence());
    placeActiveDon(state);
    const paused = processEffectRuntime(state);
    return choice === "pay"
      ? payWithFirstActiveDon(paused.state)
      : declinePayment(paused.state);
  };
  const payA = run("pay");
  const payB = run("pay");
  const declineA = run("decline");
  const declineB = run("decline");

  assert.deepEqual(payA.events, payB.events);
  assert.deepEqual(payA.state.eventJournal, payB.state.eventJournal);
  assert.equal(payA.stateHash, payB.stateHash);
  assert.deepEqual(declineA.events, declineB.events);
  assert.deepEqual(declineA.state.eventJournal, declineB.state.eventJournal);
  assert.equal(declineA.stateHash, declineB.stateHash);
});

test("sequence drawUpTo pauses via chooseQuantity and resumes into next segment", () => {
  const { state } = sequenceQueueState(drawUpToThenPauseSequence());
  const beforeDeckCount = must(state.players[p1], "before p1").deck.length;

  const paused = processEffectRuntime(state);
  const quantityDecision = must(paused.state.pendingDecision, "quantity");
  assert.equal(paused.errors, undefined);
  assert.equal(quantityDecision.type, "chooseQuantity");
  assert.equal(quantityDecision.min, 0);
  assert.equal(quantityDecision.max, 3);

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: quantityDecision.id,
    response: { type: "chooseQuantity", quantity: 2 },
  });
  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.equal(
    must(resolved.state.players[p1], "after p1").deck.length,
    Math.max(beforeDeckCount - 3, 0),
  );
});

test("sequence drawUpTo resolution increments state seq once while continuing same frame into following draw", () => {
  const { state } = sequenceQueueState(drawUpToThenPauseSequence());
  const paused = processEffectRuntime(state);
  const quantityDecision = must(paused.state.pendingDecision, "quantity");
  const pausedSeq = paused.state.seq;

  assert.equal(quantityDecision.type, "chooseQuantity");

  const resolved = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: quantityDecision.id,
    response: { type: "chooseQuantity", quantity: 2 },
  });

  assert.equal(resolved.errors, undefined);
  assert.equal(resolved.state.seq, pausedSeq + 1);
  assert.equal(resolved.state.pendingDecision, undefined);
  assert.deepEqual(resolved.state.effectExecutionFrames, []);
  assert.deepEqual(resolved.state.effectQueue, []);
});

test("sequence drawUpTo resume records canonical segmentResults before later segments continue", () => {
  const { state } = sequenceQueueState(drawUpToThenDrawThenPauseSequence());
  const paused = processEffectRuntime(state);
  const quantityDecision = must(paused.state.pendingDecision, "quantity");

  assert.equal(quantityDecision.type, "chooseQuantity");

  const resumed = applyAction(paused.state, {
    type: "respondToDecision",
    decisionId: quantityDecision.id,
    response: { type: "chooseQuantity", quantity: 2 },
  });
  const pauseAfterResume = must(resumed.state.pendingDecision, "next pause");
  const frame = must(resumed.state.effectExecutionFrames[0], "frame");

  assert.equal(resumed.errors, undefined);
  assert.equal(pauseAfterResume.type, "chooseQuantity");
  assert.equal(frame.pendingDecision.decisionId, pauseAfterResume.id);
  assert.deepEqual(frame.segmentResults["0"], {
    attempted: true,
    succeeded: true,
    changedState: true,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  });
  assert.deepEqual(frame.segmentResults["1"], {
    attempted: true,
    succeeded: true,
    changedState: false,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  });
  assert.equal(frame.segmentResults["2"], undefined);
});

test("optional effect clause accept and decline branches are independently deterministic", () => {
  const run = (choice: "activate" | "decline") => {
    const { state } = sequenceQueueState(optionalTrashClauseSequence());
    const paused = processEffectRuntime(state);
    return respondWithOptionalActivation(paused.state, choice);
  };
  const acceptA = run("activate");
  const acceptB = run("activate");
  const declineA = run("decline");
  const declineB = run("decline");

  assert.deepEqual(acceptA.events, acceptB.events);
  assert.deepEqual(acceptA.state.eventJournal, acceptB.state.eventJournal);
  assert.equal(acceptA.stateHash, acceptB.stateHash);
  assert.deepEqual(declineA.events, declineB.events);
  assert.deepEqual(declineA.state.eventJournal, declineB.state.eventJournal);
  assert.equal(declineA.stateHash, declineB.stateHash);
});
