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
        source: { zone: "costArea", playerId: p1 },
      },
    );
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
});
