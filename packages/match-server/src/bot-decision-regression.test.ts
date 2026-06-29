import { strict as assert } from "node:assert";
import type {
  CardId,
  CardRef,
  DecisionId,
  InstanceId,
  PlayerId,
  PublicCardView,
  PublicPendingDecisionId,
} from "@optcg/types";
import { describe, test } from "vitest";

import { chooseBotAction } from "./bot-player.js";
import type {
  DevMatchSnapshot,
  DevVisibleAction,
} from "./dev-snapshot-types.js";

const botPlayerId = "p2" as PlayerId;
const opponentPlayerId = "p1" as PlayerId;

const cardRef = (
  instanceId: string,
  cardId: string,
  playerId: PlayerId,
): CardRef => ({
  instanceId: instanceId as InstanceId,
  cardId: cardId as CardId,
  playerId,
});

const publicCard = (
  instanceId: string,
  cardId: string,
  fields: Partial<PublicCardView> = {},
): PublicCardView => ({
  instanceId: instanceId as InstanceId,
  cardId: cardId as CardId,
  owner: fields.owner ?? botPlayerId,
  controller: fields.controller ?? botPlayerId,
  zone: fields.zone ?? { playerId: botPlayerId, zone: "hand" },
  attachedDonCount: fields.attachedDonCount ?? 0,
  attachedDonIds: fields.attachedDonIds ?? [],
  ...fields,
});

const snapshotWithDecision = ({
  actions,
  selfHand = [],
  opponentCharacters = [],
  pendingDecision,
  battle,
}: {
  readonly actions: readonly DevVisibleAction[];
  readonly selfHand?: readonly PublicCardView[];
  readonly opponentCharacters?: readonly PublicCardView[];
  readonly pendingDecision: NonNullable<
    DevMatchSnapshot["players"][PlayerId]["view"]["pendingDecision"]
  >;
  readonly battle?:
    | DevMatchSnapshot["players"][PlayerId]["view"]["battle"]
    | undefined;
}): DevMatchSnapshot =>
  ({
    stateSeq: 1,
    actionSeq: 1,
    stateHash: "bot-decision-regression",
    status: "active",
    turn: {
      turnNumber: 1,
      turnPlayerId: opponentPlayerId,
      phase: "main",
      globalTurn: 1,
      playerTurnCounts: { [botPlayerId]: 1, [opponentPlayerId]: 1 },
    },
    activePlayerId: botPlayerId,
    players: {
      [botPlayerId]: {
        view: {
          self: {
            leader: publicCard("bot-leader", "OP09-001", {
              zone: { playerId: botPlayerId, zone: "leaderArea" },
              currentPower: 5_000,
            }),
            hand: selfHand,
            characters: [],
            costArea: [],
            life: { count: 3, faceUpCards: [] },
          },
          opponent: {
            handCount: 4,
            leader: publicCard("opponent-leader", "OP01-001", {
              owner: opponentPlayerId,
              controller: opponentPlayerId,
              zone: { playerId: opponentPlayerId, zone: "leaderArea" },
              currentPower: 6_000,
            }),
            life: { count: 5, faceUpCards: [] },
            characters: opponentCharacters,
            costArea: [],
          },
          pendingDecision,
          ...(battle === undefined ? {} : { battle }),
        },
        actions: [...actions],
      },
    },
  }) as unknown as DevMatchSnapshot;

describe("bot decision regressions", () => {
  test("selects counter cards before submitting visible pass action", () => {
    const counter2000 = publicCard("counter-2000", "OP01-004", {
      printedCounter: 2_000,
    });
    const snapshot = snapshotWithDecision({
      actions: [
        {
          index: 0,
          type: "respondToDecision",
          label: "End counter step",
          responseKey: "0",
        },
      ],
      selfHand: [counter2000],
      battle: {
        attacker: cardRef("opponent-leader", "OP01-001", opponentPlayerId),
        originalTarget: cardRef("bot-leader", "OP09-001", botPlayerId),
        currentTarget: cardRef("bot-leader", "OP09-001", botPlayerId),
        step: "counter",
        damageCount: 1,
      },
      pendingDecision: {
        id: "decision:counter-cards" as DecisionId,
        spotlightPendingId:
          "spotlight:pending:counter-cards" as PublicPendingDecisionId,
        type: "selectCards",
        playerId: botPlayerId,
        prompt: "Select counter cards.",
        causedBy: { type: "ruleProcess", name: "counter-step" },
        presentation: {
          title: "Counter",
          instruction: "Select counter cards.",
        },
        min: 0,
        max: 1,
        candidates: [cardRef("counter-2000", "OP01-004", botPlayerId)].map(
          (card) => ({ card }),
        ),
        choices: [
          {
            card: cardRef("counter-2000", "OP01-004", botPlayerId),
            selectable: true,
          },
        ],
      },
    });

    assert.deepEqual(chooseBotAction(snapshot, botPlayerId), {
      type: "respondToDecision",
      decisionId: "decision:counter-cards",
      response: {
        type: "cards",
        cards: [cardRef("counter-2000", "OP01-004", botPlayerId)],
      },
    });
  });

  test("selects highest-value target before submitting visible target action", () => {
    const lowValueTarget = publicCard("low-value-target", "OP01-010", {
      owner: opponentPlayerId,
      controller: opponentPlayerId,
      zone: { playerId: opponentPlayerId, zone: "characterArea" },
      currentPower: 3_000,
      printedCost: 1,
    });
    const highValueTarget = publicCard("high-value-target", "OP01-011", {
      owner: opponentPlayerId,
      controller: opponentPlayerId,
      zone: { playerId: opponentPlayerId, zone: "characterArea" },
      currentPower: 8_000,
      printedCost: 8,
    });
    const snapshot = snapshotWithDecision({
      actions: [
        {
          index: 0,
          type: "respondToDecision",
          label: "Choose low value target",
        },
      ],
      opponentCharacters: [lowValueTarget, highValueTarget],
      pendingDecision: {
        id: "decision:effect-target" as DecisionId,
        spotlightPendingId:
          "spotlight:pending:effect-target" as PublicPendingDecisionId,
        type: "selectTargets",
        playerId: botPlayerId,
        prompt: "Choose a target.",
        causedBy: { type: "ruleProcess", name: "effect-target" },
        presentation: {
          title: "Choose target",
          instruction: "Choose a target.",
        },
        min: 1,
        max: 1,
        candidates: [
          { card: cardRef("low-value-target", "OP01-010", opponentPlayerId) },
          { card: cardRef("high-value-target", "OP01-011", opponentPlayerId) },
        ],
      },
    });

    assert.deepEqual(chooseBotAction(snapshot, botPlayerId), {
      type: "respondToDecision",
      decisionId: "decision:effect-target",
      response: {
        type: "targets",
        targets: [cardRef("high-value-target", "OP01-011", opponentPlayerId)],
      },
    });
  });
});
