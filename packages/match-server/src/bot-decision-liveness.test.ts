import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type {
  CardId,
  CardRef,
  DecisionId,
  InstanceId,
  PlayerId,
} from "@optcg/types";

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

  test("answers character overflow selectCards decisions from candidates", () => {
    const overflowCard: CardRef = {
      instanceId: "character-1" as InstanceId,
      cardId: "OP01-001" as CardId,
      playerId: botId,
      zone: { zone: "characterArea", playerId: botId, index: 0 },
    };
    const chosen = chooseBotAction(
      snapshotWithDecision({
        id: "decision:character-overflow:played-card" as DecisionId,
        type: "selectCards",
        playerId: botId,
        prompt: "Choose a Character to trash.",
        causedBy: { type: "ruleProcess", name: "characterOverflow" },
        presentation: {
          title: "Character overflow",
          instruction: "Choose a Character to trash.",
        },
        min: 1,
        max: 1,
        candidates: [{ card: overflowCard }],
        choices: [],
      }),
      botId,
    );

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:character-overflow:played-card",
      response: { type: "cards", cards: [overflowCard] },
    });
  });

  test("answers runtime play overflow by selecting exactly one character", () => {
    const firstCharacter: CardRef = {
      instanceId: "character-1" as InstanceId,
      cardId: "OP01-001" as CardId,
      playerId: botId,
      zone: { zone: "characterArea", playerId: botId, index: 0 },
    };
    const secondCharacter: CardRef = {
      instanceId: "character-2" as InstanceId,
      cardId: "OP01-002" as CardId,
      playerId: botId,
      zone: { zone: "characterArea", playerId: botId, index: 1 },
    };
    const chosen = chooseBotAction(
      snapshotWithDecision({
        id: "decision:play-selected-overflow:played-card" as DecisionId,
        type: "selectCards",
        playerId: botId,
        prompt: "Choose a Character to trash.",
        causedBy: { type: "ruleProcess", name: "playSelectedOverflow" },
        presentation: {
          title: "Character overflow",
          instruction: "Choose a Character to trash.",
        },
        min: 0,
        max: 5,
        candidates: [{ card: firstCharacter }, { card: secondCharacter }],
        choices: [
          { card: firstCharacter, selectable: true },
          { card: secondCharacter, selectable: true },
        ],
      }),
      botId,
    );

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:play-selected-overflow:played-card",
      response: { type: "cards", cards: [firstCharacter] },
    });
  });
});
