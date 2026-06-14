import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type {
  DecisionId,
  CardId,
  InstanceId,
  MatchId,
  PlayerId,
  PlayerView,
  StateSeq,
  Zone,
} from "@optcg/types";

import type { ClientPlayerSnapshot } from "../transport.js";
import { createMatchClientDecisionModel } from "./use-match-client-decision-model.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const card = (
  instanceId: string,
  cardId: string,
  zone: Zone,
  owner: PlayerId,
): PlayerView["self"]["leader"] => ({
  instanceId: instanceId as InstanceId,
  cardId: cardId as CardId,
  owner,
  controller: owner,
  zone: { playerId: owner, zone },
  attachedDonCount: 0,
  attachedDonIds: [],
});

const payCostDecision = {
  id: "decision:quick-pay" as DecisionId,
  type: "payCost",
  playerId: p1,
  prompt: "Pay cost.",
  causedBy: { type: "playerAction", actionId: "action-quick-pay" },
  presentation: {
    title: "Pay cost",
    instruction: "Choose whether to pay.",
  },
} satisfies NonNullable<PlayerView["pendingDecision"]>;

const playerSnapshot = (): ClientPlayerSnapshot => ({
  view: {
    matchId: "match-1" as MatchId,
    playerId: p1,
    stateSeq: 1 as StateSeq,
    actionSeq: 1,
    turn: {
      globalTurn: 1,
      playerTurnCounts: { [p1]: 1 },
      turnPlayerId: p1,
      phase: "main",
    },
    self: {
      playerId: p1,
      deckCount: 0,
      donDeckCount: 0,
      hand: [],
      trash: [],
      leader: card("leader-1", "OP01-001", "leaderArea", p1),
      characters: [],
      costArea: [],
      life: { count: 0, faceUpCards: [] },
      hasMulliganed: true,
      turnCount: 1,
    },
    opponent: {
      playerId: p2,
      deckCount: 0,
      donDeckCount: 0,
      handCount: 0,
      trash: [],
      leader: card("opponent-leader-1", "OP01-002", "leaderArea", p2),
      characters: [],
      costArea: [],
      life: { count: 0, faceUpCards: [] },
      hasMulliganed: true,
      turnCount: 0,
    },
    pendingDecision: payCostDecision,
    legalActions: [],
    revealedCards: [],
    events: [],
    timers: { players: {} },
  },
  actions: [
    {
      index: 1,
      type: "respondToDecision",
      label: "Decline cost",
      decisionPayment: { kind: "paymentDeclined" },
    },
    { index: 2, type: "respondToDecision", label: "Rest this card" },
  ],
});

describe("match client decision model", () => {
  test("suppresses the payment modal while armed quick-pay will submit activate-main cost", () => {
    const model = createMatchClientDecisionModel({
      clientState: undefined,
      playerSnapshot: playerSnapshot(),
      pendingDecision: payCostDecision,
      activeAttackTargetChoice: undefined,
      activeCounterTargetChoice: undefined,
      activeCardCostChoice: undefined,
      activeCardCostSelectedInstanceIds: [],
      decisionDraft: undefined,
      quickPayActivateMainCosts: true,
      quickPayActivateMainArmed: true,
    });

    assert.equal(model.quickPayActivateMainCostActionIndex, 2);
    assert.equal(model.decisionModal, undefined);
  });

  test("attach-DON pay costs use board-click cost selection instead of a modal", () => {
    const snapshot = playerSnapshot();
    snapshot.view.opponent.costArea = [
      {
        ...card("opponent-rested-don", "DON", "costArea", p2),
        state: "rested",
      },
    ];
    snapshot.view.opponent.characters = [
      card("opponent-character", "OP01-003", "characterArea", p2),
    ];
    snapshot.actions = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Attach DON!!",
        attachment: {
          donInstanceId: "opponent-rested-don" as InstanceId,
          targetInstanceId: "opponent-character" as InstanceId,
        },
      },
    ];

    const model = createMatchClientDecisionModel({
      clientState: undefined,
      playerSnapshot: snapshot,
      pendingDecision: payCostDecision,
      activeAttackTargetChoice: undefined,
      activeCounterTargetChoice: undefined,
      activeCardCostChoice: undefined,
      activeCardCostSelectedInstanceIds: [],
      decisionDraft: undefined,
    });

    assert.equal(model.decisionModal, undefined);
    assert.equal(model.activeCardCostGroup?.operation, "attachDon");
    assert.deepEqual(model.pendingChoiceInstanceIds, ["opponent-rested-don"]);
    assert.equal(model.decisionPrompt, "Choose DON!! to attach");
  });

  test("attach-DON pay costs highlight legal targets after selecting DON", () => {
    const snapshot = playerSnapshot();
    snapshot.view.opponent.costArea = [
      {
        ...card("opponent-rested-don", "DON", "costArea", p2),
        state: "rested",
      },
    ];
    snapshot.view.opponent.characters = [
      card("opponent-character", "OP01-003", "characterArea", p2),
    ];
    snapshot.actions = [
      {
        index: 1,
        type: "respondToDecision",
        label: "Decline cost",
        decisionPayment: { kind: "paymentDeclined" },
      },
      {
        index: 2,
        type: "respondToDecision",
        label: "Attach DON!!",
        attachment: {
          donInstanceId: "opponent-rested-don" as InstanceId,
          targetInstanceId: "opponent-character" as InstanceId,
        },
      },
    ];

    const model = createMatchClientDecisionModel({
      clientState: undefined,
      playerSnapshot: snapshot,
      pendingDecision: payCostDecision,
      activeAttackTargetChoice: undefined,
      activeCounterTargetChoice: undefined,
      activeCardCostChoice: undefined,
      activeCardCostSelectedInstanceIds: ["opponent-rested-don"],
      decisionDraft: undefined,
    });

    assert.deepEqual(model.pendingChoiceInstanceIds, ["opponent-character"]);
  });
});
