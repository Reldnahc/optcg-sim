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
  toCardId,
  reviewedOnPlayDrawDefinition,
  toEffectId,
  toQueueEntryId,
  toSourceSnapshot,
  toTimingWindowId,
  withCardInZone,
} from "./effect-runtime-queue-processing-test-support.js";

const optionalCostSequenceThenPauseSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-rest-self-and-don",
      connector: "always",
      effect: {
        type: "payCost",
        cost: {
          type: "sequence",
          optional: true,
          costs: [
            { type: "restSelf" },
            { type: "restDon", count: 1, chooser: "self" },
          ],
        },
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

const reindexHand = (
  cards: readonly CardInstance[],
  playerId = p1,
): CardInstance[] =>
  cards.map((card, index) => ({
    ...card,
    zone: { zone: "hand", playerId, slot: "hand", index },
  }));

const placeActiveDon = (state: GameState, count = 1): void => {
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
  const effectDefinitionId = "def-cost-sequence";
  const supportCard = resolvedCard({
    cardId: source.cardId,
    category: "character",
    support: {
      status: "implemented-dsl",
      effectDefinitionId,
      rulesVersion: "cost-sequence-rules",
      sourceTextHash: "cost-sequence-source",
    },
  });
  const base = reviewedOnPlayDrawDefinition(source.cardId, supportCard.support);
  const baseEffect = must(base.effects[0], "base effect");
  const definition: EffectDefinition = {
    ...base,
    effects: [
      {
        ...baseEffect,
        id: toEffectId("effect-cost-sequence"),
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
  effect: Effect = optionalCostSequenceThenPauseSequence(),
): GameState => {
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
      id: toQueueEntryId("queue-entry-cost-sequence"),
      timingWindowId: toTimingWindowId("window-cost-sequence"),
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
      causedBy: { type: "ruleProcess", name: "cost-sequence-test" },
    },
  ];
  return state;
};

const restSelfDonThenPlayFromHandSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-rest-self-and-don",
      connector: "always",
      effect: {
        type: "payCost",
        cost: {
          type: "sequence",
          optional: true,
          costs: [
            { type: "restSelf" },
            { type: "restDon", count: 1, chooser: "self" },
          ],
        },
      },
      saveResultAs: "paidOptionalCost",
    },
    {
      id: "select-five-elders",
      connector: "ifYouDo",
      effect: {
        type: "selectCards",
        zone: "hand",
        player: "self",
        chooser: "self",
        visibility: "chooserOnly",
        min: 0,
        max: 1,
        filter: {
          categories: ["character"],
          colorsAny: ["black"],
          typesAny: ["Five Elders"],
          custom: "costLteSelfDonFieldCount",
        },
        saveAs: "handSelection:five-elders" as HandSelectionId,
      },
      saveResultAs: "handSelection:five-elders",
    },
    {
      id: "play-selected",
      connector: "then",
      effect: {
        type: "playSelected",
        selection: "handSelection:five-elders" as HandSelectionId,
        ignoreCost: true,
        enterRested: true,
      },
    },
  ],
});

const payRestSelf = (state: GameState): EngineResult => {
  const decision = must(state.pendingDecision, "pending decision");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "restSelf",
    },
  });
};

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

test("optional cost sequence rests source then DON before dependent effects", () => {
  const state = sequenceQueueState();
  placeActiveDon(state);
  const beforeSource = must(state.effectQueue[0]?.source, "source ref");
  const beforeP1 = must(state.players[p1], "before p1");
  const activeDon = must(
    beforeP1.costArea.find((card) => card.state === "active"),
    "active DON",
  );

  const restSelfPaused = processEffectRuntime(state);
  const restedSelf = payRestSelf(restSelfPaused.state);
  const restDonDecision = must(
    restedSelf.state.pendingDecision,
    "rest DON decision",
  );
  const paidDon = payWithFirstActiveDon(restedSelf.state);
  const trashDecision = must(paidDon.state.pendingDecision, "trash decision");
  const frame = must(paidDon.state.effectExecutionFrames[0], "frame");
  const afterP1 = must(paidDon.state.players[p1], "after p1");
  const sourceAfterPayment = must(
    afterP1.characters.find(
      (card) => card.instanceId === beforeSource.instanceId,
    ),
    "source after payment",
  );

  assert.equal(restSelfPaused.errors, undefined);
  assert.equal(restedSelf.errors, undefined);
  assert.equal(restDonDecision.type, "payCost");
  assert.equal(paidDon.errors, undefined);
  assert.equal(trashDecision.type, "selectCards");
  assert.equal(sourceAfterPayment.state, "rested");
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
  assert.deepEqual(frame.segmentResults["1"], {
    attempted: true,
    succeeded: true,
    changedState: true,
    selectedCards: [],
    selectedTargets: [],
    paidCost: true,
    playerDeclined: false,
  });
  assert.deepEqual(frame.segmentResults["2"], {
    attempted: true,
    succeeded: true,
    changedState: true,
    selectedCards: [],
    selectedTargets: [],
    paidCost: false,
    playerDeclined: false,
  });
});

test("hand play sequence filters candidates by color, type, and dynamic DON-field cost", () => {
  const state = sequenceQueueState(restSelfDonThenPlayFromHandSequence());
  placeActiveDon(state, 3);
  const player = must(state.players[p1], "p1");
  const eligible = must(player.hand[0], "eligible hand card");
  const wrongColor = must(player.hand[1], "wrong color hand card");
  const tooExpensive = must(player.hand[2], "too expensive hand card");
  eligible.cardId = toCardId("eligible-five-elders");
  wrongColor.cardId = toCardId("wrong-color-five-elders");
  tooExpensive.cardId = toCardId("too-expensive-five-elders");
  state.cardManifest.cards[eligible.cardId] = {
    ...resolvedCard({
      cardId: eligible.cardId,
      category: "character",
      cost: 3,
    }),
    colors: ["black"],
    types: ["Five Elders"],
  };
  state.cardManifest.cards[wrongColor.cardId] = {
    ...resolvedCard({
      cardId: wrongColor.cardId,
      category: "character",
      cost: 3,
    }),
    colors: ["red"],
    types: ["Five Elders"],
  };
  state.cardManifest.cards[tooExpensive.cardId] = {
    ...resolvedCard({
      cardId: tooExpensive.cardId,
      category: "character",
      cost: 4,
    }),
    colors: ["black"],
    types: ["Five Elders"],
  };

  const restSelfPaused = processEffectRuntime(state);
  const restedSelf = payRestSelf(restSelfPaused.state);
  const paidDon = payWithFirstActiveDon(restedSelf.state);
  const selectionDecision = must(
    paidDon.state.pendingDecision,
    "hand selection decision",
  );

  assert.equal(selectionDecision.type, "selectCards");
  assert.deepEqual(
    selectionDecision.candidates.map((candidate) => candidate.card.instanceId),
    [eligible.instanceId],
  );

  const selected = applyAction(paidDon.state, {
    type: "respondToDecision",
    decisionId: selectionDecision.id,
    response: {
      type: "cards",
      cards: [must(selectionDecision.candidates[0], "candidate").card],
    },
  });
  const afterP1 = must(selected.state.players[p1], "after p1");

  assert.equal(selected.errors, undefined);
  assert.equal(selected.state.pendingDecision, undefined);
  assert.equal(
    afterP1.hand.some((card) => card.instanceId === eligible.instanceId),
    false,
  );
  assert.equal(
    afterP1.characters.some((card) => card.instanceId === eligible.instanceId),
    true,
  );
  assert.equal(
    afterP1.hand.some((card) => card.instanceId === wrongColor.instanceId),
    true,
  );
  assert.equal(
    afterP1.hand.some((card) => card.instanceId === tooExpensive.instanceId),
    true,
  );
});
