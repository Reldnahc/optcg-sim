import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type {
  CardId,
  InstanceId,
  PlayerId,
  PublicCardView,
} from "@optcg/types";

import { chooseBotAction } from "./bot-player.js";
import type {
  DevMatchSnapshot,
  DevVisibleAction,
} from "./dev-snapshot-types.js";

const botId = "p2" as PlayerId;

const snapshotWithActions = (
  actions: readonly DevVisibleAction[],
  cards: {
    readonly selfLeader?: Partial<PublicCardView>;
    readonly selfHand?: readonly Partial<PublicCardView>[];
    readonly selfCharacters?: readonly Partial<PublicCardView>[];
    readonly selfCostArea?: readonly Partial<PublicCardView>[];
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
      turnPlayerId: botId,
      phase: "main",
      globalTurn: 1,
      playerTurnCounts: { [botId]: 1 },
    },
    activePlayerId: botId,
    players: {
      [botId]: {
        view: {
          self: {
            leader: {
              instanceId: "bot-leader",
              cardId: "OP01-001",
              owner: botId,
              controller: botId,
              zone: { player: botId, zone: "leader" },
              attachedDonCount: 0,
              attachedDonIds: [],
              ...cards.selfLeader,
            },
            hand: cards.selfHand ?? [],
            characters: cards.selfCharacters ?? [],
            costArea: cards.selfCostArea ?? [],
            life: { count: 5, faceUpCards: [] },
          },
          opponent: {
            handCount: 0,
            leader: {
              instanceId: "opponent-leader",
              cardId: "OP01-002",
              owner: "p1",
              controller: "p1",
              zone: { player: "p1", zone: "leader" },
              attachedDonCount: 0,
              attachedDonIds: [],
              ...cards.opponentLeader,
            },
            life: { count: 5, faceUpCards: [] },
            characters: cards.opponentCharacters ?? [],
            costArea: [],
          },
        },
        actions,
      },
    },
  }) as unknown as DevMatchSnapshot;

describe("bot strategy priorities", () => {
  test("attacks before playing a high-counter card", () => {
    const chosen = chooseBotAction(
      snapshotWithActions(
        [
          {
            index: 0,
            type: "playCard",
            label: "Play counter card",
            placement: { instanceId: "counter-card" as InstanceId },
          },
          {
            index: 1,
            type: "declareAttack",
            label: "Attack leader",
            attack: {
              attackerInstanceId: "bot-leader" as InstanceId,
              targetInstanceId: "opponent-leader" as InstanceId,
            },
          },
        ],
        {
          selfHand: [
            {
              instanceId: "counter-card" as InstanceId,
              cardId: "OP01-003" as CardId,
              zone: { playerId: botId, zone: "hand" },
              printedCounter: 2000,
            },
          ],
          selfLeader: { currentPower: 6000 },
          opponentLeader: { currentPower: 5000 },
        },
      ),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("attaches DON for combat pressure before making a generic play", () => {
    const chosen = chooseBotAction(
      snapshotWithActions(
        [
          {
            index: 0,
            type: "playCard",
            label: "Play card",
            placement: { instanceId: "generic-card" as InstanceId },
          },
          {
            index: 1,
            type: "attachDon",
            label: "Attach DON to leader",
            attachment: {
              donInstanceId: "don-1" as InstanceId,
              targetInstanceId: "bot-leader" as InstanceId,
            },
          },
          {
            index: 2,
            type: "declareAttack",
            label: "Attack leader",
            attack: {
              attackerInstanceId: "bot-leader" as InstanceId,
              targetInstanceId: "opponent-leader" as InstanceId,
            },
          },
        ],
        {
          selfHand: [
            {
              instanceId: "generic-card" as InstanceId,
              cardId: "OP01-004" as CardId,
              zone: { playerId: botId, zone: "hand" },
            },
          ],
          selfLeader: { currentPower: 5000 },
          selfCostArea: [
            {
              instanceId: "don-1" as InstanceId,
              cardId: "DON!!" as CardId,
              zone: { playerId: botId, zone: "costArea" },
            },
          ],
          opponentLeader: { currentPower: 5000 },
        },
      ),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });
});
