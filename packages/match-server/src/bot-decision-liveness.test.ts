import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type {
  CardId,
  DecisionId,
  InstanceId,
  MatchId,
  PlayerId,
} from "@optcg/types";

import { chooseBotAction } from "./bot-player.js";
import { createBotStrategy } from "./bot-strategy.js";
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
        view: { matchId: "match" as MatchId, pendingDecision },
        actions,
      },
    },
  }) as unknown as DevMatchSnapshot;

const snapshotWithActions = (
  actions: readonly DevVisibleAction[],
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
        view: {
          matchId: "match" as MatchId,
          playerId: botId,
          self: {
            leader: {
              instanceId: "bot-leader" as InstanceId,
              cardId: "OP01-001" as CardId,
              owner: botId,
              controller: botId,
              zone: { player: botId, zone: "leader" },
              attachedDonCount: 0,
              attachedDonIds: [],
            },
            hand: [],
            characters: [
              {
                instanceId: "activate-source" as InstanceId,
                cardId: "OP01-003" as CardId,
                owner: botId,
                controller: botId,
                zone: { player: botId, zone: "character" },
                attachedDonCount: 0,
                attachedDonIds: [],
              },
            ],
            costArea: [],
            trash: [],
            life: { count: 5, faceUpCards: [] },
          },
          opponent: {
            handCount: 0,
            leader: {
              instanceId: "opponent-leader" as InstanceId,
              cardId: "OP01-002" as CardId,
              owner: "p1" as PlayerId,
              controller: "p1" as PlayerId,
              zone: { player: "p1" as PlayerId, zone: "leader" },
              attachedDonCount: 0,
              attachedDonIds: [],
            },
            characters: [],
            costArea: [],
            trash: [],
            life: { count: 5, faceUpCards: [] },
          },
        },
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

  test("does not reactivate the same effect after declining its cost", () => {
    const strategy = createBotStrategy();
    const activateAction: DevVisibleAction = {
      index: 0,
      type: "activateEffect",
      label: "Activate effect",
      placement: { instanceId: "activate-source" as InstanceId },
    };
    const endAction: DevVisibleAction = {
      index: 1,
      type: "endMainPhase",
      label: "End turn",
    };

    assert.deepEqual(
      strategy.chooseAction({
        snapshot: snapshotWithActions([activateAction, endAction]),
        botPlayerId: botId,
      }),
      { type: "submitAction", actionIndex: 0 },
    );
    assert.deepEqual(
      strategy.chooseAction({
        snapshot: snapshotWithDecision({
          id: "decision:activation-cost" as DecisionId,
          type: "payCost",
          playerId: botId,
          prompt: "Pay the cost?",
          causedBy: { type: "ruleProcess", name: "test" },
          presentation: { title: "Pay cost", instruction: "Pay the cost." },
        }),
        botPlayerId: botId,
      }),
      {
        type: "respondToDecision",
        decisionId: "decision:activation-cost",
        response: { type: "paymentDeclined" },
      },
    );

    assert.deepEqual(
      strategy.chooseAction({
        snapshot: snapshotWithActions([activateAction, endAction]),
        botPlayerId: botId,
      }),
      { type: "submitAction", actionIndex: 1 },
    );
  });
});
