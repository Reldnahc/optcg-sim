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

import { buildBotFeatures } from "./bot-features.js";
import { chooseCounterCardsForDefense } from "./bot-defense-planner.js";
import type { BotDecisionContext } from "./bot-types.js";
import type { DevMatchSnapshot } from "./dev-snapshot-types.js";

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

const contextWithLeaderAttack = ({
  botLifeCount,
}: {
  readonly botLifeCount: number;
}): BotDecisionContext => {
  const counter1000 = publicCard("counter-1000", "OP01-003", {
    printedCounter: 1_000,
  });
  const counter2000 = publicCard("counter-2000", "OP01-004", {
    printedCounter: 2_000,
  });
  const snapshot = {
    stateSeq: 1,
    actionSeq: 1,
    stateHash: "defense-planner",
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
            hand: [counter1000, counter2000],
            characters: [],
            costArea: [],
            life: { count: botLifeCount, faceUpCards: [] },
          },
          opponent: {
            handCount: 4,
            leader: publicCard("opponent-leader", "OP01-001", {
              owner: opponentPlayerId,
              controller: opponentPlayerId,
              zone: { playerId: opponentPlayerId, zone: "leaderArea" },
              currentPower: 7_000,
            }),
            life: { count: 5, faceUpCards: [] },
            characters: [],
            costArea: [],
          },
          battle: {
            attacker: cardRef(
              "opponent-leader",
              "OP01-001",
              opponentPlayerId,
            ),
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
            max: 2,
            candidates: [
              { card: cardRef("counter-1000", "OP01-003", botPlayerId) },
              { card: cardRef("counter-2000", "OP01-004", botPlayerId) },
            ],
            choices: [
              {
                card: cardRef("counter-1000", "OP01-003", botPlayerId),
                selectable: true,
              },
              {
                card: cardRef("counter-2000", "OP01-004", botPlayerId),
                selectable: true,
              },
            ],
          },
        },
        actions: [],
      },
    },
  } as unknown as DevMatchSnapshot;

  return { snapshot, botPlayerId };
};

const selectedInstanceIds = (
  choice: ReturnType<typeof chooseCounterCardsForDefense>,
): readonly string[] | undefined =>
  choice?.cards.map((card) => String(card.instanceId));

describe("chooseCounterCardsForDefense", () => {
  test("uses enough counter to stop lethal leader attack", () => {
    const context = contextWithLeaderAttack({ botLifeCount: 0 });
    const choice = chooseCounterCardsForDefense({
      context,
      features: buildBotFeatures(context.snapshot, botPlayerId),
    });

    assert.deepEqual(selectedInstanceIds(choice), [
      "counter-1000",
      "counter-2000",
    ]);
  });

  test("takes non-lethal early leader hit instead of spending counter", () => {
    const context = contextWithLeaderAttack({ botLifeCount: 5 });
    const choice = chooseCounterCardsForDefense({
      context,
      features: buildBotFeatures(context.snapshot, botPlayerId),
    });

    assert.deepEqual(choice?.cards, []);
  });
});
