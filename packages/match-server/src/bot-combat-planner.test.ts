import { strict as assert } from "node:assert";
import type {
  CardId,
  InstanceId,
  PlayerId,
  PublicCardView,
} from "@optcg/types";
import { describe, test } from "vitest";

import { buildBotFeatures, type BotFeatures } from "./bot-features.js";
import { chooseCombatPlanAction } from "./bot-combat-planner.js";
import type {
  DevMatchSnapshot,
  DevVisibleAction,
} from "./dev-snapshot-types.js";

const botPlayerId = "p2" as PlayerId;
const opponentPlayerId = "p1" as PlayerId;

const publicCard = (
  instanceId: string,
  cardId: string,
  fields: Partial<PublicCardView> = {},
): PublicCardView => ({
  instanceId: instanceId as InstanceId,
  cardId: cardId as CardId,
  owner: fields.owner ?? botPlayerId,
  controller: fields.controller ?? botPlayerId,
  zone: fields.zone ?? { playerId: botPlayerId, zone: "characterArea" },
  attachedDonCount: fields.attachedDonCount ?? 0,
  attachedDonIds: fields.attachedDonIds ?? [],
  ...fields,
});

const combatFixture = (actions: readonly DevVisibleAction[]): BotFeatures => {
  const snapshot = {
    stateSeq: 1,
    actionSeq: 1,
    stateHash: "combat-planner",
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
            leader: publicCard("bot-leader", "OP09-001", {
              zone: { playerId: botPlayerId, zone: "leaderArea" },
              currentPower: 9_000,
            }),
            hand: [],
            characters: [],
            costArea: [],
            life: { count: 5, faceUpCards: [] },
          },
          opponent: {
            handCount: 4,
            leader: publicCard("opponent-leader", "OP01-001", {
              owner: opponentPlayerId,
              controller: opponentPlayerId,
              zone: { playerId: opponentPlayerId, zone: "leaderArea" },
              currentPower: 5_000,
            }),
            life: { count: 1, faceUpCards: [] },
            characters: [
              publicCard("small-character", "OP01-010", {
                owner: opponentPlayerId,
                controller: opponentPlayerId,
                zone: { playerId: opponentPlayerId, zone: "characterArea" },
                currentPower: 4_000,
                printedCost: 2,
              }),
              publicCard("big-character", "OP01-011", {
                owner: opponentPlayerId,
                controller: opponentPlayerId,
                zone: { playerId: opponentPlayerId, zone: "characterArea" },
                currentPower: 8_000,
                printedCost: 7,
              }),
            ],
            costArea: [],
          },
        },
        actions,
      },
    },
  } as unknown as DevMatchSnapshot;

  return buildBotFeatures(snapshot, botPlayerId);
};

describe("chooseCombatPlanAction", () => {
  test("pressure mode prefers leader pressure over low-value character attack", () => {
    const actions: readonly DevVisibleAction[] = [
      {
        index: 0,
        type: "declareAttack",
        label: "Attack character",
        attack: {
          attackerInstanceId: "bot-leader" as InstanceId,
          targetInstanceId: "small-character" as InstanceId,
        },
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
    ];
    const features = combatFixture(actions);

    const choice = chooseCombatPlanAction({
      actions,
      features,
      mode: "pressure",
    });

    assert.equal(choice?.action.index, 1);
  });

  test("stabilize mode prefers removing high-value character", () => {
    const actions: readonly DevVisibleAction[] = [
      {
        index: 0,
        type: "declareAttack",
        label: "Attack character",
        attack: {
          attackerInstanceId: "bot-leader" as InstanceId,
          targetInstanceId: "big-character" as InstanceId,
        },
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
    ];
    const features = combatFixture(actions);

    const choice = chooseCombatPlanAction({
      actions,
      features,
      mode: "stabilize",
    });

    assert.equal(choice?.action.index, 0);
  });

  test("low opponent counter density increases leader pressure", () => {
    const actions: readonly DevVisibleAction[] = [
      {
        index: 0,
        type: "declareAttack",
        label: "Attack leader",
        attack: {
          attackerInstanceId: "bot-leader" as InstanceId,
          targetInstanceId: "opponent-leader" as InstanceId,
        },
      },
    ];
    const features = combatFixture(actions);
    const highCounter = chooseCombatPlanAction({
      actions,
      features: {
        ...features,
        opponentDeckKnowledge: {
          knownDecklistCardIds: [],
          remainingUnknownCounterPrior: {
            unknownCardCount: 10,
            totalCounterPower: 20_000,
            counter1000Count: 0,
            counter2000Count: 10,
            averageCounterPower: 2_000,
          },
          remainingEventCount: 0,
          remainingBlockerCount: 0,
          remainingRemovalCount: 0,
        },
      },
      mode: "pressure",
    });
    const lowCounter = chooseCombatPlanAction({
      actions,
      features: {
        ...features,
        opponentDeckKnowledge: {
          knownDecklistCardIds: [],
          remainingUnknownCounterPrior: {
            unknownCardCount: 10,
            totalCounterPower: 10_000,
            counter1000Count: 10,
            counter2000Count: 0,
            averageCounterPower: 1_000,
          },
          remainingEventCount: 0,
          remainingBlockerCount: 0,
          remainingRemovalCount: 0,
        },
      },
      mode: "pressure",
    });

    assert.ok((lowCounter?.score.total ?? 0) > (highCounter?.score.total ?? 0));
  });
});
