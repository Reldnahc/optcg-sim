import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type { DecisionId, PlayerId } from "@optcg/types";

import { chooseBotAction } from "./bot-player.js";
import type {
  DevMatchSnapshot,
  DevVisibleAction,
} from "./dev-snapshot-types.js";

const botId = "p2" as PlayerId;

const snapshotWithDecision = (
  pendingDecision: NonNullable<
    DevMatchSnapshot["players"][PlayerId]["view"]["pendingDecision"]
  >,
  actions: readonly DevVisibleAction[] = [],
): DevMatchSnapshot =>
  ({
    stateSeq: 7,
    actionSeq: 3,
    stateHash: "hash",
    status: "active",
    turn: {
      turnNumber: 1,
      turnPlayerId: botId,
      phase: "main",
      globalTurn: 1,
      playerTurnCounts: { [botId]: 1 },
    },
    activePlayerId: botId,
    players: {
      [botId]: {
        view: { pendingDecision },
        actions,
      },
    },
  }) as unknown as DevMatchSnapshot;

describe("bot decision liveness", () => {
  test("declines a pending cost when no visible payment action exists", () => {
    const chosen = chooseBotAction(
      snapshotWithDecision({
        id: "decision:cost" as DecisionId,
        type: "payCost",
        playerId: botId,
        prompt: "Pay the cost?",
        causedBy: { type: "ruleProcess", name: "test" },
        presentation: { title: "Pay cost", instruction: "Pay the cost." },
      }),
      botId,
    );

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:cost",
      response: { type: "paymentDeclined" },
    });
  });

  test("submits an empty trigger order when there are no trigger choices", () => {
    const chosen = chooseBotAction(
      snapshotWithDecision({
        id: "decision:trigger-order" as DecisionId,
        type: "chooseTriggerOrder",
        playerId: botId,
        prompt: "Choose trigger order.",
        causedBy: { type: "ruleProcess", name: "test" },
        presentation: {
          title: "Choose order",
          instruction: "Choose trigger order.",
        },
        choices: [],
      }),
      botId,
    );

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:trigger-order",
      response: { type: "orderedIds", ids: [] },
    });
  });

  test("uses a visible effect option response instead of blindly declining", () => {
    const chosen = chooseBotAction(
      snapshotWithDecision(
        {
          id: "decision:effect-option" as DecisionId,
          type: "chooseEffectOption",
          playerId: botId,
          prompt: "Choose one.",
          causedBy: { type: "ruleProcess", name: "test" },
          presentation: { title: "Choose one", instruction: "Choose one." },
        },
        [
          {
            index: 0,
            type: "respondToDecision",
            label: "Use effect option",
            responseKey: "effect-option:0",
          },
        ],
      ),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 0 });
  });

  test("uses a visible replacement response instead of blindly declining", () => {
    const chosen = chooseBotAction(
      snapshotWithDecision(
        {
          id: "decision:replacement" as DecisionId,
          type: "chooseReplacement",
          playerId: botId,
          prompt: "Choose replacement.",
          causedBy: { type: "ruleProcess", name: "test" },
          presentation: {
            title: "Choose replacement",
            instruction: "Choose replacement.",
          },
        },
        [
          {
            index: 0,
            type: "respondToDecision",
            label: "Use replacement",
            responseKey: "replacement:0",
          },
        ],
      ),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 0 });
  });

  test("pays a visible cost response instead of declining it", () => {
    const chosen = chooseBotAction(
      snapshotWithDecision(
        {
          id: "decision:activation-cost" as DecisionId,
          type: "payCost",
          playerId: botId,
          prompt: "Pay the cost?",
          causedBy: { type: "ruleProcess", name: "test" },
          presentation: { title: "Pay cost", instruction: "Pay the cost." },
        },
        [
          {
            index: 0,
            type: "respondToDecision",
            label: "Decline cost",
            responseKey: "decline",
            decisionPayment: { kind: "paymentDeclined" },
          },
          {
            index: 1,
            type: "respondToDecision",
            label: "Rest 1 DON!!",
            responseKey: "restDon",
          },
        ],
      ),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("still activates an effect before ending main phase", () => {
    const chosen = chooseBotAction(
      {
        stateSeq: 7,
        actionSeq: 3,
        stateHash: "hash",
        status: "active",
        turn: {
          turnNumber: 1,
          turnPlayerId: botId,
          phase: "main",
          globalTurn: 1,
          playerTurnCounts: { [botId]: 1 },
        },
        activePlayerId: botId,
        players: {
          [botId]: {
            view: {},
            actions: [
              {
                index: 0,
                type: "endMainPhase",
                label: "End turn",
              },
              {
                index: 1,
                type: "activateEffect",
                label: "Activate effect",
              },
            ],
          },
        },
      } as unknown as DevMatchSnapshot,
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });
});
