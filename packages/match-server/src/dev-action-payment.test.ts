import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type {
  CardId,
  CardInstance,
  DecisionId,
  GameState,
  InstanceId,
  LegalAction,
  PlayerId,
} from "@optcg/types";

import { actionDecisionPayment } from "./dev-action-payment.js";

const p1 = "p1" as PlayerId;

const donCard = (instanceId: string): CardInstance => ({
  instanceId: instanceId as InstanceId,
  cardId: "DON" as CardId,
  owner: p1,
  controller: p1,
  zone: { zone: "costArea", playerId: p1 },
  state: "active",
  attachedDon: [],
});

const lifeCard = (instanceId: string): CardInstance => ({
  instanceId: instanceId as InstanceId,
  cardId: "life-card" as CardId,
  owner: p1,
  controller: p1,
  zone: { zone: "life", playerId: p1, slot: "life", index: 0 },
  attachedDon: [],
});

const handCard = (instanceId: string): CardInstance => ({
  instanceId: instanceId as InstanceId,
  cardId: "hand-card" as CardId,
  owner: p1,
  controller: p1,
  zone: { zone: "hand", playerId: p1, slot: "hand", index: 0 },
  attachedDon: [],
});

const secondHandCard = (instanceId: string): CardInstance => ({
  ...handCard(instanceId),
  cardId: "second-hand-card" as CardId,
  zone: { zone: "hand", playerId: p1, slot: "hand", index: 1 },
});

const characterCard = (instanceId: string): CardInstance => ({
  instanceId: instanceId as InstanceId,
  cardId: "character-card" as CardId,
  owner: p1,
  controller: p1,
  zone: { zone: "characterArea", playerId: p1, slot: "character", index: 0 },
  state: "active",
  attachedDon: [],
});

const deckCard = (instanceId: string, index: number): CardInstance => ({
  instanceId: instanceId as InstanceId,
  cardId: "deck-card" as CardId,
  owner: p1,
  controller: p1,
  zone: { zone: "deck", playerId: p1, slot: "deck", index },
  attachedDon: [],
});

const minimalState = (costArea: CardInstance[]): GameState =>
  ({
    pendingDecision: {
      id: "decision:return-don" as DecisionId,
      type: "payCost",
      playerId: p1,
      prompt: "Choose whether to pay this optional cost.",
      causedBy: { type: "ruleProcess", name: "privateCausality" },
      visibility: { type: "private", playerId: p1 },
      cost: { type: "returnDon", count: 2, optional: true },
      paymentOptions: [{ id: "returnDon", type: "returnDon", count: 2 }],
    },
    cardManifest: { cards: {} },
    players: {
      [p1]: {
        leader: donCard("leader"),
        deck: [],
        hand: [],
        trash: [],
        characters: [],
        costArea,
        donDeck: [],
        life: [],
      },
    },
  }) as unknown as GameState;

describe("dev action payment metadata", () => {
  test("projects returnDon payment as selectable cost-area DON", () => {
    const action: LegalAction = {
      type: "respondToDecision",
      decisionId: "decision:return-don" as DecisionId,
      response: {
        type: "payment",
        optionId: "returnDon",
        selectedDonInstanceIds: ["don-1" as InstanceId, "don-2" as InstanceId],
      },
    };

    assert.deepEqual(
      actionDecisionPayment(
        minimalState([donCard("don-1"), donCard("don-2")]),
        action,
      ),
      {
        kind: "cardCost",
        operation: "returnDon",
        chooseLabel: "Choose DON!! to return",
        selectedCardInstanceIds: ["don-1", "don-2"],
        selectedCards: [
          { instanceId: "don-1", zone: "costArea", playerId: p1 },
          { instanceId: "don-2", zone: "costArea", playerId: p1 },
        ],
        source: { zone: "costArea", playerId: p1 },
      },
    );
  });

  test("projects restDon payment as selectable cost-area DON", () => {
    const state = minimalState([donCard("don-1"), donCard("don-2")]);
    state.pendingDecision = {
      id: "decision:rest-don" as DecisionId,
      type: "payCost",
      playerId: p1,
      prompt: "Choose whether to pay this optional cost.",
      causedBy: { type: "ruleProcess", name: "privateCausality" },
      visibility: { type: "private", playerId: p1 },
      cost: { type: "restDon", count: 2, optional: true },
      paymentOptions: [{ id: "restDon", type: "restDon", count: 2 }],
    };
    const action: LegalAction = {
      type: "respondToDecision",
      decisionId: "decision:rest-don" as DecisionId,
      response: {
        type: "payment",
        optionId: "restDon",
        selectedDonInstanceIds: ["don-1" as InstanceId, "don-2" as InstanceId],
      },
    };

    assert.deepEqual(actionDecisionPayment(state, action), {
      kind: "cardCost",
      operation: "restDon",
      chooseLabel: "Choose DON!! to rest",
      selectedCardInstanceIds: ["don-1", "don-2"],
      selectedCards: [
        { instanceId: "don-1", zone: "costArea", playerId: p1 },
        { instanceId: "don-2", zone: "costArea", playerId: p1 },
      ],
      source: { zone: "costArea", playerId: p1 },
    });
  });

  test("projects rest-from-field payment as selectable field cards", () => {
    const selected = characterCard("character-1");
    const state = minimalState([]);
    state.pendingDecision = {
      id: "decision:rest-from-field" as DecisionId,
      type: "payCost",
      playerId: p1,
      prompt: "Choose whether to pay this optional cost.",
      causedBy: { type: "ruleProcess", name: "privateCausality" },
      visibility: { type: "private", playerId: p1 },
      cost: {
        type: "restFromField",
        count: 1,
        chooser: "self",
        optional: true,
      },
      paymentOptions: [
        {
          id: "restFromField",
          type: "restFromField",
          count: 1,
        },
      ],
    };
    const player = state.players[p1];
    if (player === undefined) {
      throw new Error("Expected p1 in minimal state.");
    }
    player.characters = [selected];
    const action: LegalAction = {
      type: "respondToDecision",
      decisionId: "decision:rest-from-field" as DecisionId,
      response: {
        type: "payment",
        optionId: "restFromField",
        selectedCardInstanceIds: [selected.instanceId],
      },
    };

    assert.deepEqual(actionDecisionPayment(state, action), {
      kind: "cardCost",
      operation: "rest",
      chooseLabel: "Choose card to rest",
      selectedCardInstanceIds: [selected.instanceId],
      selectedCards: [
        {
          instanceId: selected.instanceId,
          zone: "characterArea",
          playerId: p1,
          index: 0,
        },
      ],
      source: { zone: "characterArea", playerId: p1 },
    });
  });

  test("projects K.O.-from-field payment as selectable field cards", () => {
    const selected = characterCard("character-1");
    const state = minimalState([]);
    state.pendingDecision = {
      id: "decision:ko-from-field" as DecisionId,
      type: "payCost",
      playerId: p1,
      prompt: "Choose whether to pay this optional cost.",
      causedBy: { type: "ruleProcess", name: "privateCausality" },
      visibility: { type: "private", playerId: p1 },
      cost: {
        type: "koFromField",
        count: 1,
        chooser: "self",
        optional: true,
      },
      paymentOptions: [
        {
          id: "koFromField",
          type: "koFromField",
          count: 1,
        },
      ],
    };
    const player = state.players[p1];
    if (player === undefined) {
      throw new Error("Expected p1 in minimal state.");
    }
    player.characters = [selected];
    const action: LegalAction = {
      type: "respondToDecision",
      decisionId: "decision:ko-from-field" as DecisionId,
      response: {
        type: "payment",
        optionId: "koFromField",
        selectedCardInstanceIds: [selected.instanceId],
      },
    };

    assert.deepEqual(actionDecisionPayment(state, action), {
      kind: "cardCost",
      operation: "ko",
      chooseLabel: "Choose card to K.O.",
      selectedCardInstanceIds: [selected.instanceId],
      selectedCards: [
        {
          instanceId: selected.instanceId,
          zone: "characterArea",
          playerId: p1,
          index: 0,
        },
      ],
      source: { zone: "characterArea", playerId: p1 },
    });
  });

  test("does not project deterministic Life-to-hand cost as a collection choice", () => {
    const topLife = lifeCard("life-1");
    const state = minimalState([]);
    state.pendingDecision = {
      id: "decision:life-to-hand" as DecisionId,
      type: "payCost",
      playerId: p1,
      prompt: "Choose whether to pay this optional cost.",
      causedBy: { type: "ruleProcess", name: "privateCausality" },
      visibility: { type: "private", playerId: p1 },
      cost: {
        type: "moveCards",
        count: 1,
        chooser: "self",
        from: { player: "self", zone: "life", position: "top" },
        to: { player: "self", zone: "hand" },
        order: "chooserChoice",
        optional: true,
      },
      paymentOptions: [
        {
          id: "moveCards:top",
          type: "moveCards",
          count: 1,
          from: { player: "self", zone: "life", position: "top" },
          to: { player: "self", zone: "hand" },
        },
      ],
    };
    const player = state.players[p1];
    if (player === undefined) {
      throw new Error("Expected p1 in minimal state.");
    }
    player.life = [{ card: topLife, faceUp: false }];
    const action: LegalAction = {
      type: "respondToDecision",
      decisionId: "decision:life-to-hand" as DecisionId,
      response: {
        type: "payment",
        optionId: "moveCards:top",
        selectedCardInstanceIds: [topLife.instanceId],
      },
    };

    assert.equal(actionDecisionPayment(state, action), undefined);
  });

  test("projects top-or-bottom Life-to-hand cost as selectable life cards", () => {
    const topLife = lifeCard("life-top");
    const bottomLife = {
      ...lifeCard("life-bottom"),
      zone: { zone: "life", playerId: p1, slot: "life", index: 1 } as const,
    };
    const state = minimalState([]);
    state.pendingDecision = {
      id: "decision:life-to-hand" as DecisionId,
      type: "payCost",
      playerId: p1,
      prompt: "Choose whether to pay this optional cost.",
      causedBy: { type: "ruleProcess", name: "privateCausality" },
      visibility: { type: "private", playerId: p1 },
      cost: {
        type: "moveCards",
        count: 1,
        chooser: "self",
        from: { player: "self", zone: "life", position: "topOrBottom" },
        to: { player: "self", zone: "hand" },
        order: "chooserChoice",
        optional: true,
      },
      paymentOptions: [
        {
          id: "moveCards:top",
          type: "moveCards",
          count: 1,
          from: { player: "self", zone: "life", position: "top" },
          to: { player: "self", zone: "hand" },
        },
        {
          id: "moveCards:bottom",
          type: "moveCards",
          count: 1,
          from: { player: "self", zone: "life", position: "bottom" },
          to: { player: "self", zone: "hand" },
        },
      ],
    };
    const player = state.players[p1];
    if (player === undefined) {
      throw new Error("Expected p1 in minimal state.");
    }
    player.life = [
      { card: topLife, faceUp: false },
      { card: bottomLife, faceUp: false },
    ];
    const action: LegalAction = {
      type: "respondToDecision",
      decisionId: "decision:life-to-hand" as DecisionId,
      response: {
        type: "payment",
        optionId: "moveCards:bottom",
        selectedCardInstanceIds: [bottomLife.instanceId],
      },
    };

    assert.deepEqual(actionDecisionPayment(state, action), {
      kind: "cardCost",
      operation: "moveCards",
      chooseLabel: "Choose Life card",
      selectedCardInstanceIds: [bottomLife.instanceId],
      selectedCards: [
        {
          instanceId: bottomLife.instanceId,
          zone: "life",
          playerId: p1,
          index: 1,
        },
      ],
      source: { zone: "life", playerId: p1 },
    });
  });

  test("projects hand-to-deck-top cost with a precise choose label", () => {
    const selected = handCard("hand-1");
    const state = minimalState([]);
    state.pendingDecision = {
      id: "decision:hand-to-deck-top" as DecisionId,
      type: "payCost",
      playerId: p1,
      prompt: "Choose whether to pay this optional cost.",
      causedBy: { type: "ruleProcess", name: "privateCausality" },
      visibility: { type: "private", playerId: p1 },
      cost: {
        type: "moveCards",
        count: 1,
        chooser: "self",
        from: { player: "self", zone: "hand" },
        to: { player: "self", zone: "deck", position: "top" },
        order: "chooserChoice",
        optional: true,
      },
      paymentOptions: [
        {
          id: "moveCards",
          type: "moveCards",
          count: 1,
          from: { player: "self", zone: "hand" },
          to: { player: "self", zone: "deck", position: "top" },
        },
      ],
    };
    const player = state.players[p1];
    if (player === undefined) {
      throw new Error("Expected p1 in minimal state.");
    }
    player.hand = [selected];
    const action: LegalAction = {
      type: "respondToDecision",
      decisionId: "decision:hand-to-deck-top" as DecisionId,
      response: {
        type: "payment",
        optionId: "moveCards",
        selectedCardInstanceIds: [selected.instanceId],
      },
    };

    assert.deepEqual(actionDecisionPayment(state, action), {
      kind: "cardCost",
      operation: "moveCards",
      chooseLabel: "Choose card to place on top of deck",
      selectedCardInstanceIds: [selected.instanceId],
      selectedCards: [
        {
          instanceId: selected.instanceId,
          zone: "hand",
          playerId: p1,
          index: 0,
        },
      ],
      source: { zone: "hand", playerId: p1 },
    });
  });

  test("projects reveal-from-hand cost as selectable hand cards", () => {
    const first = handCard("hand-1");
    const second = secondHandCard("hand-2");
    const state = minimalState([]);
    state.pendingDecision = {
      id: "decision:reveal-from-hand" as DecisionId,
      type: "payCost",
      playerId: p1,
      prompt: "Choose whether to pay this optional cost.",
      causedBy: { type: "ruleProcess", name: "privateCausality" },
      visibility: { type: "private", playerId: p1 },
      cost: {
        type: "revealFromHand",
        count: 2,
        chooser: "self",
        optional: true,
      },
      paymentOptions: [
        {
          id: "revealFromHand",
          type: "revealFromHand",
          count: 2,
        },
      ],
    };
    const player = state.players[p1];
    if (player === undefined) {
      throw new Error("Expected p1 in minimal state.");
    }
    player.hand = [first, second];
    const action: LegalAction = {
      type: "respondToDecision",
      decisionId: "decision:reveal-from-hand" as DecisionId,
      response: {
        type: "payment",
        optionId: "revealFromHand",
        selectedCardInstanceIds: [first.instanceId, second.instanceId],
      },
    };

    assert.deepEqual(actionDecisionPayment(state, action), {
      kind: "cardCost",
      operation: "reveal",
      chooseLabel: "Choose card to reveal",
      selectedCardInstanceIds: [first.instanceId, second.instanceId],
      selectedCards: [
        {
          instanceId: first.instanceId,
          zone: "hand",
          playerId: p1,
          index: 0,
        },
        {
          instanceId: second.instanceId,
          zone: "hand",
          playerId: p1,
          index: 1,
        },
      ],
      source: { zone: "hand", playerId: p1 },
    });
  });

  test("does not project deterministic deck-top trash costs as card selection", () => {
    const first = deckCard("deck-1", 0);
    const second = deckCard("deck-2", 1);
    const state = minimalState([]);
    state.pendingDecision = {
      id: "decision:deck-top-to-trash" as DecisionId,
      type: "payCost",
      playerId: p1,
      prompt: "Choose whether to pay this optional cost.",
      causedBy: { type: "ruleProcess", name: "privateCausality" },
      visibility: { type: "private", playerId: p1 },
      cost: {
        type: "moveCards",
        count: 2,
        chooser: "self",
        from: { player: "self", zone: "deck", position: "top" },
        to: { player: "self", zone: "trash" },
        order: "chooserChoice",
        optional: true,
      },
      paymentOptions: [
        {
          id: "moveCards",
          type: "moveCards",
          count: 2,
          from: { player: "self", zone: "deck", position: "top" },
          to: { player: "self", zone: "trash" },
        },
      ],
    };
    const player = state.players[p1];
    if (player === undefined) {
      throw new Error("Expected p1 in minimal state.");
    }
    player.deck = [first, second];
    const action: LegalAction = {
      type: "respondToDecision",
      decisionId: "decision:deck-top-to-trash" as DecisionId,
      response: {
        type: "payment",
        optionId: "moveCards",
        selectedCardInstanceIds: [first.instanceId, second.instanceId],
      },
    };

    assert.equal(actionDecisionPayment(state, action), undefined);
  });
});
