import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type {
  CardId,
  DecisionId,
  InstanceId,
  PlayerId,
  PublicCardView,
  PublicPendingDecisionId,
} from "@optcg/types";

import { buildBotFeatures } from "./bot-features.js";
import { chooseBotActionReport } from "./bot-player.js";
import { chooseBotTurnIntent } from "./bot-turn-intent.js";
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
    readonly selfLifeCount?: number;
    readonly selfHand?: readonly Partial<PublicCardView>[];
    readonly selfCharacters?: readonly Partial<PublicCardView>[];
    readonly selfCostArea?: readonly Partial<PublicCardView>[];
    readonly opponentLeader?: Partial<PublicCardView>;
    readonly opponentHandCount?: number;
    readonly opponentLifeCount?: number;
    readonly pendingDecision?: DevMatchSnapshot["players"][PlayerId]["view"]["pendingDecision"];
    readonly battle?: DevMatchSnapshot["players"][PlayerId]["view"]["battle"];
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
              currentPower: 5_000,
              ...cards.selfLeader,
            },
            hand: cards.selfHand ?? [],
            characters: cards.selfCharacters ?? [],
            costArea: cards.selfCostArea ?? [],
            life: { count: cards.selfLifeCount ?? 5, faceUpCards: [] },
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
              currentPower: 5_000,
              ...cards.opponentLeader,
            },
            life: { count: cards.opponentLifeCount ?? 5, faceUpCards: [] },
            characters: [],
            costArea: [],
          },
          ...(cards.pendingDecision === undefined
            ? {}
            : { pendingDecision: cards.pendingDecision }),
          ...(cards.battle === undefined ? {} : { battle: cards.battle }),
        },
        actions,
      },
    },
  }) as unknown as DevMatchSnapshot;

const featuresFrom = (snapshot: DevMatchSnapshot) =>
  buildBotFeatures(snapshot, botPlayerId);

describe("chooseBotTurnIntent", () => {
  test("answers bot-owned pending decisions first", () => {
    const snapshot = snapshotWithActions([], {
      pendingDecision: {
        id: "decision:cost" as DecisionId,
        spotlightPendingId:
          "spotlight:pending:test:cost" as PublicPendingDecisionId,
        type: "payCost",
        playerId: botPlayerId,
        prompt: "Pay the cost?",
        causedBy: { type: "ruleProcess", name: "test" },
        presentation: { title: "Pay cost", instruction: "Pay the cost." },
      },
    });
    const intent = chooseBotTurnIntent(featuresFrom(snapshot));
    const report = chooseBotActionReport({
      snapshot,
      botPlayerId,
    });

    assert.equal(intent.type, "answerDecision");
    assert.deepEqual(report, {
      choice: {
        type: "respondToDecision",
        decisionId: "decision:cost",
        response: { type: "paymentDeclined" },
      },
      intent: { type: "answerDecision" },
      decisionReason: { kind: "fallback", decisionType: "payCost" },
    });
  });

  test("prioritizes survival during lethal battle", () => {
    const intent = chooseBotTurnIntent(
      featuresFrom(
        snapshotWithActions(
          [
            {
              index: 0,
              type: "useCounter",
              label: "Use counter",
              counter: {
                cardInstanceId: "counter-card" as InstanceId,
                targetInstanceId: "bot-leader" as InstanceId,
              },
            },
          ],
          {
            selfLifeCount: 0,
            selfLeader: { currentPower: 5_000 },
            selfHand: [
              {
                instanceId: "counter-card" as InstanceId,
                cardId: "OP01-003" as CardId,
                printedCounter: 2_000,
              },
            ],
            opponentLeader: { currentPower: 6_000 },
            battle: {
              attacker: {
                instanceId: "opponent-leader" as InstanceId,
                cardId: "OP01-002" as CardId,
                playerId: opponentPlayerId,
              },
              originalTarget: {
                instanceId: "bot-leader" as InstanceId,
                cardId: "OP01-001" as CardId,
                playerId: botPlayerId,
              },
              currentTarget: {
                instanceId: "bot-leader" as InstanceId,
                cardId: "OP01-001" as CardId,
                playerId: botPlayerId,
              },
              step: "counter",
              damageCount: 1,
            },
          },
        ),
      ),
    );

    assert.equal(intent.type, "surviveLethal");
  });

  test("prioritizes available lethal before normal development", () => {
    const intent = chooseBotTurnIntent(
      featuresFrom(
        snapshotWithActions(
          [
            {
              index: 0,
              type: "playCard",
              label: "Play card",
              placement: { instanceId: "playable-card" as InstanceId },
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
            selfLeader: { currentPower: 6_000 },
            selfHand: [
              {
                instanceId: "playable-card" as InstanceId,
                cardId: "OP01-004" as CardId,
              },
            ],
            opponentLeader: { currentPower: 5_000 },
            opponentLifeCount: 0,
            opponentHandCount: 0,
          },
        ),
      ),
    );

    assert.equal(intent.type, "findLethal");
  });

  test("detects multi-attack lethal before normal development", () => {
    const intent = chooseBotTurnIntent(
      featuresFrom(
        snapshotWithActions(
          [
            {
              index: 0,
              type: "playCard",
              label: "Play card",
              placement: { instanceId: "playable-card" as InstanceId },
            },
            {
              index: 1,
              type: "declareAttack",
              label: "Attack leader with leader",
              attack: {
                attackerInstanceId: "bot-leader" as InstanceId,
                targetInstanceId: "opponent-leader" as InstanceId,
              },
            },
            {
              index: 2,
              type: "declareAttack",
              label: "Attack leader with character",
              attack: {
                attackerInstanceId: "bot-character" as InstanceId,
                targetInstanceId: "opponent-leader" as InstanceId,
              },
            },
          ],
          {
            selfLeader: { currentPower: 6_000 },
            selfHand: [
              {
                instanceId: "playable-card" as InstanceId,
                cardId: "OP01-004" as CardId,
              },
            ],
            selfCharacters: [
              {
                instanceId: "bot-character" as InstanceId,
                cardId: "OP01-005" as CardId,
                currentPower: 6_000,
              },
            ],
            opponentLeader: { currentPower: 5_000 },
            opponentLifeCount: 1,
            opponentHandCount: 0,
          },
        ),
      ),
    );

    assert.equal(intent.type, "findLethal");
  });

  test("develops board before low-value pressure", () => {
    const intent = chooseBotTurnIntent(
      featuresFrom(
        snapshotWithActions(
          [
            {
              index: 0,
              type: "playCard",
              label: "Play attacker",
              placement: { instanceId: "attacker-card" as InstanceId },
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
          ],
          {
            selfHand: [
              {
                instanceId: "attacker-card" as InstanceId,
                cardId: "OP01-004" as CardId,
                printedPower: 6_000,
              },
            ],
            selfCostArea: [
              {
                instanceId: "don-1" as InstanceId,
                cardId: "DON!!" as CardId,
              },
            ],
            opponentLeader: { currentPower: 5_000 },
          },
        ),
      ),
    );

    assert.equal(intent.type, "developBoard");
  });
});
