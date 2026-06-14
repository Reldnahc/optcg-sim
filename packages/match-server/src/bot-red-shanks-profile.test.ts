import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type {
  CardId,
  DecisionId,
  InstanceId,
  PlayerId,
  PublicCardView,
} from "@optcg/types";

import { chooseBotAction } from "./bot-player.js";
import type { DevMatchSnapshot } from "./dev-snapshot-types.js";

const botId = "p2" as PlayerId;
const opponentId = "p1" as PlayerId;

const snapshotWithActions = (
  actions: DevMatchSnapshot["players"][PlayerId]["actions"],
  cards: {
    readonly selfLeader?: Partial<PublicCardView>;
    readonly selfHand?: readonly Partial<PublicCardView>[];
    readonly opponentLeader?: Partial<PublicCardView>;
    readonly opponentCharacters?: readonly Partial<PublicCardView>[];
  } = {},
): DevMatchSnapshot =>
  ({
    stateSeq: 7,
    actionSeq: 3,
    stateHash: "hash",
    status: "active",
    turn: {
      turnNumber: 1,
      turnPlayerId: opponentId,
      phase: "main",
      globalTurn: 1,
      playerTurnCounts: { [opponentId]: 1 },
    },
    activePlayerId: botId,
    players: {
      [botId]: {
        view: {
          self: {
            leader: {
              instanceId: "bot-leader",
              cardId: "OP09-001",
              owner: botId,
              controller: botId,
              zone: { player: botId, zone: "leader" },
              attachedDonCount: 0,
              attachedDonIds: [],
              currentPower: 5000,
              ...cards.selfLeader,
            },
            hand: cards.selfHand ?? [],
            characters: [],
            costArea: [],
            life: { count: 2, faceUpCards: [] },
          },
          opponent: {
            handCount: 0,
            leader: {
              instanceId: "opponent-leader",
              cardId: "OP01-002",
              owner: opponentId,
              controller: opponentId,
              zone: { player: opponentId, zone: "leader" },
              attachedDonCount: 0,
              attachedDonIds: [],
              currentPower: 6000,
              ...cards.opponentLeader,
            },
            life: { count: 5, faceUpCards: [] },
            characters: cards.opponentCharacters ?? [],
            costArea: [],
          },
          battle: {
            attacker: {
              instanceId: "opponent-leader" as InstanceId,
              cardId: "OP01-002" as CardId,
              playerId: opponentId,
            },
            originalTarget: {
              instanceId: "bot-leader" as InstanceId,
              cardId: "OP09-001" as CardId,
              playerId: botId,
            },
            currentTarget: {
              instanceId: "bot-leader" as InstanceId,
              cardId: "OP09-001" as CardId,
              playerId: botId,
            },
            step: "counter",
            damageCount: 1,
          },
        },
        actions,
      },
    },
  }) as unknown as DevMatchSnapshot;

const viewForBot = (snapshot: DevMatchSnapshot) => {
  const player = snapshot.players[botId];
  if (player === undefined) {
    throw new Error("Expected bot player snapshot.");
  }
  return player.view;
};

describe("red Shanks bot profile", () => {
  test("activates OP09-001 leader reduction during counter-step decisions", () => {
    const snapshot = snapshotWithActions(
      [
        {
          index: 0,
          type: "respondToDecision",
          label: "Decline",
          responseKey: "decline",
        },
        {
          index: 1,
          type: "respondToDecision",
          label: "Activate",
          responseKey: "activate",
        },
      ],
      {
        opponentLeader: { currentPower: 5000 },
      },
    );
    viewForBot(snapshot).pendingDecision = {
      id: "decision:op09-leader-defense" as DecisionId,
      type: "chooseOptionalActivation",
      playerId: botId,
      prompt: "Activate leader effect?",
      causedBy: { type: "ruleProcess", name: "test" },
      source: {
        instanceId: "bot-leader" as InstanceId,
        cardId: "OP09-001" as CardId,
        playerId: botId,
      },
      presentation: { title: "Choose", instruction: "Choose." },
    };

    const chosen = chooseBotAction(snapshot, botId);

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:op09-leader-defense",
      response: { type: "optionalActivation", choice: "activate" },
    });
  });

  test("activates OP09-001 when it makes an available counter enough", () => {
    const snapshot = snapshotWithActions(
      [
        {
          index: 0,
          type: "respondToDecision",
          label: "Decline",
          responseKey: "decline",
        },
        {
          index: 1,
          type: "respondToDecision",
          label: "Activate",
          responseKey: "activate",
        },
      ],
      {
        selfHand: [
          {
            instanceId: "counter-card" as InstanceId,
            cardId: "OP01-003" as CardId,
            printedCounter: 2000,
          },
        ],
        opponentLeader: { currentPower: 7000 },
      },
    );
    viewForBot(snapshot).pendingDecision = {
      id: "decision:op09-leader-counter-setup" as DecisionId,
      type: "chooseOptionalActivation",
      playerId: botId,
      prompt: "Activate leader effect?",
      causedBy: { type: "ruleProcess", name: "test" },
      source: {
        instanceId: "bot-leader" as InstanceId,
        cardId: "OP09-001" as CardId,
        playerId: botId,
      },
      presentation: { title: "Choose", instruction: "Choose." },
    };

    const chosen = chooseBotAction(snapshot, botId);

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:op09-leader-counter-setup",
      response: { type: "optionalActivation", choice: "activate" },
    });
  });

  test("targets the current attacker for OP09-001 during counter-step target decisions", () => {
    const opponentCharacter = {
      instanceId: "opponent-character" as InstanceId,
      cardId: "OP01-003" as CardId,
      playerId: opponentId,
    };
    const opponentLeader = {
      instanceId: "opponent-leader" as InstanceId,
      cardId: "OP01-002" as CardId,
      playerId: opponentId,
    };
    const snapshot = snapshotWithActions([
      {
        index: 0,
        type: "respondToDecision",
        label: "Choose character",
      },
      {
        index: 1,
        type: "respondToDecision",
        label: "Choose leader",
      },
    ]);
    viewForBot(snapshot).pendingDecision = {
      id: "decision:op09-leader-target" as DecisionId,
      type: "selectTargets",
      playerId: botId,
      prompt: "Choose a target.",
      causedBy: { type: "ruleProcess", name: "test" },
      source: {
        instanceId: "bot-leader" as InstanceId,
        cardId: "OP09-001" as CardId,
        playerId: botId,
      },
      presentation: { title: "Choose", instruction: "Choose." },
      min: 1,
      max: 1,
      candidates: [{ card: opponentCharacter }, { card: opponentLeader }],
    };

    const chosen = chooseBotAction(snapshot, botId);

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:op09-leader-target",
      response: { type: "targets", targets: [opponentLeader] },
    });
  });
});
