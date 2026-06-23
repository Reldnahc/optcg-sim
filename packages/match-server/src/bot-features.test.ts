import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type {
  CardId,
  InstanceId,
  PlayerId,
  PublicCardView,
} from "@optcg/types";

import { buildBotFeatures } from "./bot-features.js";
import type {
  DevMatchSnapshot,
  DevVisibleAction,
} from "./dev-snapshot-types.js";

const botPlayerId = "p2" as PlayerId;
const opponentPlayerId = "p1" as PlayerId;

const snapshotWithActions = (
  actions: readonly DevVisibleAction[],
  cards: {
    readonly selfLeader?: Partial<PublicCardView>;
    readonly selfHand?: readonly Partial<PublicCardView>[];
    readonly selfCharacters?: readonly Partial<PublicCardView>[];
    readonly selfCostArea?: readonly Partial<PublicCardView>[];
    readonly opponentLeader?: Partial<PublicCardView>;
    readonly opponentHandCount?: number;
  } = {},
): DevMatchSnapshot =>
  ({
    stateSeq: 7,
    actionSeq: 3,
    stateHash: "hash",
    status: "active",
    turn: {
      turnNumber: 1,
      turnPlayerId: botPlayerId,
      phase: "main",
      globalTurn: 1,
      playerTurnCounts: { [botPlayerId]: 1 },
    },
    activePlayerId: botPlayerId,
    players: {
      [botPlayerId]: {
        view: {
          self: {
            leader: {
              instanceId: "bot-leader" as InstanceId,
              cardId: "OP01-001" as CardId,
              owner: botPlayerId,
              controller: botPlayerId,
              zone: { playerId: botPlayerId, zone: "leader" },
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
            handCount: cards.opponentHandCount ?? 0,
            leader: {
              instanceId: "opponent-leader" as InstanceId,
              cardId: "OP01-002" as CardId,
              owner: opponentPlayerId,
              controller: opponentPlayerId,
              zone: { playerId: opponentPlayerId, zone: "leader" },
              attachedDonCount: 0,
              attachedDonIds: [],
              ...cards.opponentLeader,
            },
            life: { count: 5, faceUpCards: [] },
            characters: [],
            costArea: [],
          },
        },
        actions,
      },
    },
  }) as unknown as DevMatchSnapshot;

describe("buildBotFeatures", () => {
  test("computes visible hand counter power", () => {
    const features = buildBotFeatures(
      snapshotWithActions([], {
        selfHand: [
          {
            instanceId: "counter-2000" as InstanceId,
            cardId: "OP01-003" as CardId,
            printedCounter: 2_000,
          },
          {
            instanceId: "counter-1000" as InstanceId,
            cardId: "OP01-004" as CardId,
            printedCounter: 1_000,
          },
        ],
      }),
      botPlayerId,
    );

    assert.equal(features.self.handCounterPower, 3_000);
  });

  test("indexes visible cards by instance id", () => {
    const features = buildBotFeatures(snapshotWithActions([]), botPlayerId);

    assert.equal(
      features.cards.byInstanceId.get("bot-leader")?.instanceId,
      "bot-leader",
    );
  });

  test("computes legal leader attack pressure", () => {
    const features = buildBotFeatures(
      snapshotWithActions(
        [
          {
            index: 0,
            type: "declareAttack",
            label: "Attack leader",
            attack: {
              attackerInstanceId: "bot-leader" as InstanceId,
              targetInstanceId: "opponent-leader" as InstanceId,
            },
          },
        ],
        {
          selfLeader: { currentPower: 6_000 },
          opponentLeader: { currentPower: 5_000 },
          opponentHandCount: 1,
        },
      ),
      botPlayerId,
    );

    assert.deepEqual(features.combat.leaderAttackPressure[0], {
      attackerInstanceId: "bot-leader",
      targetInstanceId: "opponent-leader",
      cardsToStop: 1,
    });
  });

  test("marks DON attachment as not useful when target has no remaining attack", () => {
    const features = buildBotFeatures(
      snapshotWithActions(
        [
          {
            index: 1,
            type: "attachDon",
            label: "Attach DON to rested character",
            attachment: {
              donInstanceId: "don-1" as InstanceId,
              targetInstanceId: "rested-character" as InstanceId,
            },
          },
        ],
        {
          selfCharacters: [
            {
              instanceId: "rested-character" as InstanceId,
              cardId: "OP01-005" as CardId,
              currentPower: 5_000,
              state: "rested",
            },
          ],
          selfCostArea: [
            {
              instanceId: "don-1" as InstanceId,
              cardId: "DON!!" as CardId,
            },
          ],
        },
      ),
      botPlayerId,
    );

    assert.equal(
      features.actions.byIndex.get(1)?.hasRemainingAttackAfterAttachment,
      false,
    );
  });
});
