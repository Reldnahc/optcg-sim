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
  p2,
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
    power: 5000,
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

const restSelfMoveCardsThenOpponentTrashSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-rest-self-and-move-cards",
      connector: "always",
      effect: {
        type: "payCost",
        cost: {
          type: "sequence",
          optional: true,
          costs: [
            { type: "restSelf" },
            {
              type: "moveCards",
              count: 2,
              chooser: "self",
              from: { player: "self", zone: "trash" },
              to: { player: "self", zone: "deck", position: "bottom" },
              order: "chooserChoice",
            },
          ],
        },
      },
      saveResultAs: "paidOptionalCost",
    },
    {
      id: "opponent-hand-count-discard",
      connector: "ifYouDo",
      effect: {
        type: "conditional",
        if: { type: "handCount", player: "opponent", op: "gte", value: 6 },
        then: {
          type: "trashFromHand",
          player: "opponent",
          chooser: "opponent",
          count: 1,
        },
      },
    },
  ],
});

const returnDonTrashFromHandThenDrawSequence = (): Extract<
  Effect,
  { type: "sequence" }
> => ({
  type: "sequence",
  effects: [
    {
      id: "optional-return-don-and-trash-from-hand",
      connector: "always",
      effect: {
        type: "payCost",
        cost: {
          type: "sequence",
          optional: true,
          costs: [
            { type: "returnDon", count: 2 },
            { type: "trashFromHand", count: 1, chooser: "self" },
          ],
        },
      },
      saveResultAs: "paidOptionalCost",
    },
    {
      id: "draw-if-paid",
      connector: "ifYouDo",
      effect: { type: "draw", player: "self", count: 2 },
    },
  ],
});

const returnDonKeywordThenTrashFromHandSequence = (): Extract<
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
      id: "give-blocker-if-paid",
      connector: "ifYouDo",
      effect: {
        type: "giveKeyword",
        target: { type: "self" },
        keyword: "blocker",
        duration: { type: "untilEndOfNextTurn", player: "opponent" },
      },
    },
    {
      id: "trash-after-keyword",
      connector: "then",
      effect: {
        type: "trashFromHand",
        player: "self",
        chooser: "self",
        count: 1,
      },
    },
  ],
});

const returnDonLeaderOrCharacterPowerSequence = (): Extract<
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
      id: "power-leader-or-character",
      connector: "ifYouDo",
      effect: {
        type: "modifyPower",
        target: {
          type: "chooseFromZones",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "self",
            zones: ["leaderArea", "characterArea"],
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            visibility: "public",
            filter: { categories: ["leader", "character"] },
          },
        },
        value: 1000,
        duration: { type: "thisTurn" },
      },
    },
  ],
});

const conditionalReturnDonLeaderOrCharacterPowerSequence = (): Extract<
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
      id: "conditional-power-leader-or-character",
      connector: "ifYouDo",
      effect: {
        type: "conditional",
        if: {
          type: "hasCardInZone",
          player: "self",
          zone: "leaderArea",
          filter: { categories: ["leader"], names: ["leader-red"] },
        },
        then: {
          type: "modifyPower",
          target: {
            type: "chooseFromZones",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              zones: ["leaderArea", "characterArea"],
              min: 0,
              max: 1,
              allowFewerIfUnavailable: true,
              visibility: "public",
              filter: { categories: ["leader", "character"] },
            },
          },
          value: 1000,
          duration: { type: "thisTurn" },
        },
      },
    },
    {
      id: "ko-opponent-low-power-character",
      connector: "then",
      effect: {
        type: "sequence",
        effects: [
          {
            id: "select:ko-target",
            connector: "always",
            saveResultAs: "selected:ko-target",
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
                  currentPower: { max: 3000 },
                },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "ko",
              target: {
                type: "savedFieldObject",
                binding: {
                  family: "selectedTargets",
                  saveResultAs: "selected:ko-target",
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

const payTrashFromHandWithFirstHandCard = (state: GameState): EngineResult => {
  const decision = must(state.pendingDecision, "pending decision");
  const player = must(state.players[decision.playerId], "decision player");
  const card = must(player.hand[0], "hand card");
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

const declinePayment = (state: GameState): EngineResult => {
  const decision = must(state.pendingDecision, "pending decision");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: { type: "paymentDeclined" },
  });
};

const payMoveCardsFromTrash = (
  state: GameState,
  selectedCardIds: readonly CardInstance["instanceId"][],
): EngineResult => {
  const decision = must(state.pendingDecision, "pending decision");
  return applyAction(state, {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "payment",
      optionId: "moveCards",
      selectedCardInstanceIds: [...selectedCardIds],
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

test("optional return-DON plus hand-trash cost sequence only runs body after every child cost is paid", () => {
  const state = sequenceQueueState(returnDonTrashFromHandThenDrawSequence());
  placeActiveDon(state, 2);
  const beforeP1 = must(state.players[p1], "before p1");
  const beforeDeckCount = beforeP1.deck.length;
  const returnedDon = must(beforeP1.costArea[0], "returned DON");

  const returnDonPaused = processEffectRuntime(state);
  const returnDonDecision = must(
    returnDonPaused.state.pendingDecision,
    "return DON decision",
  );
  const paidReturnDon = payReturnDonWithFirstCostDon(returnDonPaused.state);
  const trashDecision = must(
    paidReturnDon.state.pendingDecision,
    "trash-from-hand decision",
  );
  const declinedTrash = declinePayment(paidReturnDon.state);
  const afterDeclineP1 = must(declinedTrash.state.players[p1], "after decline");

  assert.equal(returnDonPaused.errors, undefined);
  assert.equal(returnDonDecision.type, "payCost");
  assert.equal(returnDonDecision.cost.type, "returnDon");
  assert.equal(paidReturnDon.errors, undefined);
  assert.equal(trashDecision.type, "payCost");
  assert.equal(trashDecision.cost.type, "trashFromHand");
  assert.equal(declinedTrash.errors, undefined);
  assert.equal(declinedTrash.state.pendingDecision, undefined);
  assert.equal(afterDeclineP1.deck.length, beforeDeckCount);
  assert.equal(
    afterDeclineP1.donDeck.some(
      (card) => card.instanceId === returnedDon.instanceId,
    ),
    true,
  );

  const paidState = sequenceQueueState(
    returnDonTrashFromHandThenDrawSequence(),
  );
  placeActiveDon(paidState, 2);
  const paidBeforeP1 = must(paidState.players[p1], "paid before p1");
  const paidBeforeDeckCount = paidBeforeP1.deck.length;
  const paidBeforeHandCount = paidBeforeP1.hand.length;
  const paidReturnDonPaused = processEffectRuntime(paidState);
  const paidReturnDonResult = payReturnDonWithFirstCostDon(
    paidReturnDonPaused.state,
  );
  const paidTrashResult = payTrashFromHandWithFirstHandCard(
    paidReturnDonResult.state,
  );
  const paidAfterP1 = must(paidTrashResult.state.players[p1], "paid after p1");

  assert.equal(paidTrashResult.errors, undefined);
  assert.equal(paidTrashResult.state.pendingDecision, undefined);
  assert.equal(paidAfterP1.deck.length, paidBeforeDeckCount - 2);
  assert.equal(paidAfterP1.hand.length, paidBeforeHandCount + 1);
});

test("return-DON sequence can grant a temporary keyword before trailing hand trash", () => {
  const state = sequenceQueueState(returnDonKeywordThenTrashFromHandSequence());
  placeActiveDon(state, 1);

  const returnDonPaused = processEffectRuntime(state);
  const paidReturnDon = payReturnDonWithFirstCostDon(returnDonPaused.state);
  const trashDecision = must(
    paidReturnDon.state.pendingDecision,
    "trash-from-hand decision",
  );
  const keywordRecord = must(
    paidReturnDon.state.continuousEffects[0],
    "temporary keyword record",
  );

  assert.equal(returnDonPaused.errors, undefined);
  assert.equal(paidReturnDon.errors, undefined);
  assert.equal(trashDecision.type, "selectCards");
  assert.equal(keywordRecord.modifier.layer, "keywordAdd");
  assert.equal(keywordRecord.modifier.target.type, "self");
  assert.equal(keywordRecord.modifier.operation.type, "addKeyword");
  assert.equal(keywordRecord.modifier.operation.keyword, "blocker");
  assert.equal(keywordRecord.duration.type, "untilEndOfNextTurn");
});

test("return-DON sequence resolves choose-from-zones continuous target before materializing power", () => {
  const state = sequenceQueueState(returnDonLeaderOrCharacterPowerSequence());
  placeActiveDon(state, 1);
  const p1State = must(state.players[p1], "p1");
  state.cardManifest.cards[p1State.leader.cardId] = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  const returnDonPaused = processEffectRuntime(state);
  const paidReturnDon = payReturnDonWithFirstCostDon(returnDonPaused.state);
  const targetDecision = must(
    paidReturnDon.state.pendingDecision,
    "leader-or-character target decision",
  );

  assert.equal(returnDonPaused.errors, undefined);
  assert.equal(paidReturnDon.errors, undefined);
  assert.equal(targetDecision.type, "selectTargets");
  assert.ok("zones" in targetDecision.request);
  assert.deepEqual(targetDecision.request.zones, [
    "leaderArea",
    "characterArea",
  ]);
  assert.equal(targetDecision.candidates.length >= 2, true);

  const leaderCandidate = must(
    targetDecision.candidates.find(
      (candidate) => candidate.card.zone?.zone === "leaderArea",
    ),
    "leader target candidate",
  );
  const selectedLeader = applyAction(paidReturnDon.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: { type: "targets", targets: [leaderCandidate.card] },
  });
  const powerRecord = must(
    selectedLeader.state.continuousEffects[0],
    "power record",
  );

  assert.equal(selectedLeader.errors, undefined);
  assert.equal(selectedLeader.state.pendingDecision, undefined);
  assert.equal(powerRecord.modifier.layer, "powerAdd");
  assert.equal(powerRecord.modifier.target.type, "exactCard");
  assert.equal(
    powerRecord.modifier.target.card.instanceId,
    leaderCandidate.card.instanceId,
  );
});

test("conditional return-DON sequence resolves choose-from-zones continuous target before materializing power", () => {
  const state = sequenceQueueState(
    conditionalReturnDonLeaderOrCharacterPowerSequence(),
  );
  placeActiveDon(state, 1);
  const p1State = must(state.players[p1], "p1");
  state.cardManifest.cards[p1State.leader.cardId] = resolvedCard({
    cardId: p1State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  const p2State = must(state.players[p2], "p2");
  state.cardManifest.cards[p2State.leader.cardId] = resolvedCard({
    cardId: p2State.leader.cardId,
    category: "leader",
    power: 5000,
  });
  const koTarget = withCardInZone({
    state,
    playerId: p2,
    card: must(p2State.hand[0], "KO target"),
    zone: "characterArea",
  });
  state.cardManifest.cards[koTarget.cardId] = resolvedCard({
    cardId: koTarget.cardId,
    category: "character",
    power: 3000,
  });

  const returnDonPaused = processEffectRuntime(state);
  const paidReturnDon = payReturnDonWithFirstCostDon(returnDonPaused.state);
  const targetDecision = must(
    paidReturnDon.state.pendingDecision,
    "leader-or-character target decision",
  );

  assert.equal(returnDonPaused.errors, undefined);
  assert.equal(paidReturnDon.errors, undefined);
  assert.equal(targetDecision.type, "selectTargets");

  const leaderCandidate = must(
    targetDecision.candidates.find(
      (candidate) => candidate.card.zone?.zone === "leaderArea",
    ),
    "leader target candidate",
  );
  const selectedLeader = applyAction(paidReturnDon.state, {
    type: "respondToDecision",
    decisionId: targetDecision.id,
    response: { type: "targets", targets: [leaderCandidate.card] },
  });
  const powerRecord = must(
    selectedLeader.state.continuousEffects[0],
    "power record",
  );
  const koTargetDecision = must(
    selectedLeader.state.pendingDecision,
    "KO target decision",
  );

  assert.equal(selectedLeader.errors, undefined);
  assert.equal(koTargetDecision.type, "selectTargets");
  assert.deepEqual(koTargetDecision.request.filter, {
    categories: ["character"],
    currentPower: { max: 3000 },
  });
  assert.equal(powerRecord.modifier.layer, "powerAdd");
  assert.equal(powerRecord.modifier.target.type, "exactCard");
  assert.equal(
    powerRecord.modifier.target.card.instanceId,
    leaderCandidate.card.instanceId,
  );

  const skippedKo = applyAction(selectedLeader.state, {
    type: "respondToDecision",
    decisionId: koTargetDecision.id,
    response: { type: "targets", targets: [] },
  });

  assert.equal(skippedKo.errors, undefined);
  assert.equal(skippedKo.state.pendingDecision, undefined);
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

test("optional move-cards cost moves chosen trash cards to bottom deck before opponent hand discard", () => {
  const state = sequenceQueueState(
    restSelfMoveCardsThenOpponentTrashSequence(),
  );
  const p1State = must(state.players[p1], "p1");
  const p2State = must(state.players[p2], "p2");
  const trashCards = p1State.hand.slice(0, 2).map((card, index) => ({
    ...card,
    zone: {
      zone: "trash" as const,
      playerId: p1,
      slot: "trash" as const,
      index,
    },
  }));
  p1State.hand = reindexHand(p1State.hand.slice(2));
  p1State.trash = trashCards;
  const extraOpponentHand = must(p2State.deck[0], "extra p2 hand");
  p2State.deck = p2State.deck.slice(1).map((card, index) => ({
    ...card,
    zone: { zone: "deck", playerId: p2, slot: "deck", index },
  }));
  p2State.hand = reindexHand(
    [
      ...p2State.hand,
      {
        ...extraOpponentHand,
        zone: {
          zone: "hand",
          playerId: p2,
          slot: "hand",
          index: p2State.hand.length,
        },
      },
    ],
    p2,
  );
  const bottomOrder = [
    must(trashCards[1], "second trash card").instanceId,
    must(trashCards[0], "first trash card").instanceId,
  ];

  const restSelfPaused = processEffectRuntime(state);
  const restedSelf = payRestSelf(restSelfPaused.state);
  const moveCardsDecision = must(
    restedSelf.state.pendingDecision,
    "move cards decision",
  );
  const paidMoveCards = payMoveCardsFromTrash(restedSelf.state, bottomOrder);
  const opponentTrashDecision = must(
    paidMoveCards.state.pendingDecision,
    "opponent trash decision",
  );
  const opponentSelected = must(
    opponentTrashDecision.type === "selectCards"
      ? opponentTrashDecision.candidates[0]
      : undefined,
    "opponent trash candidate",
  ).card;
  const resolved = applyAction(paidMoveCards.state, {
    type: "respondToDecision",
    decisionId: opponentTrashDecision.id,
    response: { type: "cards", cards: [opponentSelected] },
  });
  const afterP1 = must(resolved.state.players[p1], "after p1");
  const afterP2 = must(resolved.state.players[p2], "after p2");

  assert.equal(restSelfPaused.errors, undefined);
  assert.equal(restedSelf.errors, undefined);
  assert.equal(moveCardsDecision.type, "payCost");
  assert.equal(paidMoveCards.errors, undefined);
  assert.equal(opponentTrashDecision.type, "selectCards");
  assert.equal(opponentTrashDecision.playerId, p2);
  assert.equal(resolved.errors, undefined);
  assert.deepEqual(
    afterP1.deck.slice(-2).map((card) => card.instanceId),
    bottomOrder,
  );
  assert.equal(afterP1.trash.length, 0);
  assert.equal(afterP2.hand.length, 5);
  assert.equal(
    afterP2.trash.some(
      (card) => card.instanceId === opponentSelected.instanceId,
    ),
    true,
  );
});
