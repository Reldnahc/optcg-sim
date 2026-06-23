import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type {
  CardId,
  DecisionId,
  InstanceId,
  PlayerId,
  PublicPendingDecisionId,
} from "@optcg/types";

import { chooseBotAction } from "./bot-player.js";
import type { DevMatchSnapshot } from "./dev-snapshot-types.js";

const botId = "p2" as PlayerId;

const snapshotWithNoVisibleActions = (
  pendingDecision: NonNullable<
    DevMatchSnapshot["players"][PlayerId]["view"]["pendingDecision"]
  >,
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
        actions: [],
        view: { pendingDecision },
      },
    },
  }) as unknown as DevMatchSnapshot;

describe("bot player decision fallback", () => {
  test("chooses the minimum selectable cards when no visible decision action exists", () => {
    const chosen = chooseBotAction(
      snapshotWithNoVisibleActions({
        id: "decision:select" as DecisionId,
        spotlightPendingId:
          "spotlight:pending:test:select" as PublicPendingDecisionId,
        type: "selectCards",
        playerId: botId,
        prompt: "Choose cards.",
        causedBy: { type: "ruleProcess", name: "test" },
        presentation: { title: "Choose", instruction: "Choose." },
        min: 1,
        max: 2,
        candidates: [
          {
            card: {
              instanceId: "card-1" as InstanceId,
              cardId: "OP01-001" as CardId,
              playerId: botId,
            },
          },
        ],
        choices: [
          {
            card: {
              instanceId: "card-1" as InstanceId,
              cardId: "OP01-001" as CardId,
              playerId: botId,
            },
            selectable: true,
          },
          {
            card: {
              instanceId: "card-2" as InstanceId,
              cardId: "OP01-002" as CardId,
              playerId: botId,
            },
            selectable: false,
          },
        ],
      }),
      botId,
    );

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:select",
      response: {
        type: "cards",
        cards: [
          {
            instanceId: "card-1",
            cardId: "OP01-001",
            playerId: botId,
          },
        ],
      },
    });
  });

  test("chooses the minimum quantity when no visible quantity action exists", () => {
    const chosen = chooseBotAction(
      snapshotWithNoVisibleActions({
        id: "decision:quantity" as DecisionId,
        spotlightPendingId:
          "spotlight:pending:test:quantity" as PublicPendingDecisionId,
        type: "chooseQuantity",
        playerId: botId,
        prompt: "Choose quantity.",
        causedBy: { type: "ruleProcess", name: "test" },
        presentation: { title: "Choose", instruction: "Choose." },
        mode: "upTo",
        min: 0,
        max: 3,
      }),
      botId,
    );

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:quantity",
      response: { type: "chooseQuantity", quantity: 0 },
    });
  });
});
