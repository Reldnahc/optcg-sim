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

const snapshotWithActions = (
  actions: DevMatchSnapshot["players"][PlayerId]["actions"],
  cards: {
    readonly selfLeader?: Partial<PublicCardView>;
    readonly selfLifeCount?: number;
    readonly selfHand?: readonly Partial<PublicCardView>[];
    readonly selfCharacters?: readonly Partial<PublicCardView>[];
    readonly selfCostArea?: readonly Partial<PublicCardView>[];
    readonly opponentLeader?: Partial<PublicCardView>;
    readonly opponentHandCount?: number;
    readonly opponentLifeCount?: number;
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
            life: { count: cards.selfLifeCount ?? 5, faceUpCards: [] },
          },
          opponent: {
            handCount: cards.opponentHandCount ?? 0,
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
            life: { count: cards.opponentLifeCount ?? 5, faceUpCards: [] },
            characters: cards.opponentCharacters ?? [],
            costArea: [],
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

describe("bot combat evaluation", () => {
  test("starts a lethal leader attack sequence when opponent hand cannot counter every hit", () => {
    const chosen = chooseBotAction(
      snapshotWithActions(
        [
          {
            index: 0,
            type: "declareAttack",
            label: "Attack leader with leader",
            attack: {
              attackerInstanceId: "bot-leader" as InstanceId,
              targetInstanceId: "opponent-leader" as InstanceId,
            },
          },
          {
            index: 1,
            type: "declareAttack",
            label: "Attack leader with character",
            attack: {
              attackerInstanceId: "bot-character" as InstanceId,
              targetInstanceId: "opponent-leader" as InstanceId,
            },
          },
          {
            index: 2,
            type: "declareAttack",
            label: "Attack character",
            attack: {
              attackerInstanceId: "bot-character" as InstanceId,
              targetInstanceId: "opponent-character" as InstanceId,
            },
          },
        ],
        {
          selfLeader: { currentPower: 6000 },
          selfCharacters: [
            {
              instanceId: "bot-character" as InstanceId,
              currentPower: 6000,
            },
          ],
          opponentLeader: { currentPower: 5000 },
          opponentHandCount: 1,
          opponentLifeCount: 0,
          opponentCharacters: [
            {
              instanceId: "opponent-character" as InstanceId,
              currentPower: 5000,
            },
          ],
        },
      ),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 0 });
  });

  test("prefers the highest-value character target when lethal is not available", () => {
    const chosen = chooseBotAction(
      snapshotWithActions(
        [
          {
            index: 0,
            type: "declareAttack",
            label: "Attack low value character",
            attack: {
              attackerInstanceId: "bot-character" as InstanceId,
              targetInstanceId: "low-value-character" as InstanceId,
            },
          },
          {
            index: 1,
            type: "declareAttack",
            label: "Attack high value character",
            attack: {
              attackerInstanceId: "bot-character" as InstanceId,
              targetInstanceId: "high-value-character" as InstanceId,
            },
          },
          {
            index: 2,
            type: "declareAttack",
            label: "Attack leader",
            attack: {
              attackerInstanceId: "bot-character" as InstanceId,
              targetInstanceId: "opponent-leader" as InstanceId,
            },
          },
        ],
        {
          selfCharacters: [
            {
              instanceId: "bot-character" as InstanceId,
              currentPower: 9000,
            },
          ],
          opponentLeader: { currentPower: 5000 },
          opponentHandCount: 2,
          opponentLifeCount: 4,
          opponentCharacters: [
            {
              instanceId: "low-value-character" as InstanceId,
              currentPower: 3000,
              printedCost: 1,
            },
            {
              instanceId: "high-value-character" as InstanceId,
              currentPower: 8000,
              printedCost: 8,
            },
          ],
        },
      ),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("attaches DON to create a lethal leader swing", () => {
    const chosen = chooseBotAction(
      snapshotWithActions(
        [
          {
            index: 0,
            type: "playCard",
            label: "Play card",
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
          selfLeader: { currentPower: 5000 },
          selfCostArea: [
            {
              instanceId: "don-1" as InstanceId,
              cardId: "DON!!" as CardId,
            },
          ],
          opponentLeader: { currentPower: 6000 },
          opponentHandCount: 0,
          opponentLifeCount: 0,
        },
      ),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("uses counter to protect leader from lethal damage", () => {
    const snapshot = snapshotWithActions(
      [
        {
          index: 0,
          type: "respondToDecision",
          label: "End step",
        },
        {
          index: 1,
          type: "useCounter",
          label: "Counter with character",
          counter: {
            cardInstanceId: "counter-card" as InstanceId,
            targetInstanceId: "bot-leader" as InstanceId,
          },
          placement: { instanceId: "counter-card" as InstanceId },
        },
      ],
      {
        selfLifeCount: 0,
        selfLeader: { currentPower: 5000 },
        selfHand: [
          {
            instanceId: "counter-card" as InstanceId,
            cardId: "OP01-003" as CardId,
          },
        ],
        opponentLeader: { currentPower: 7000 },
      },
    );
    viewForBot(snapshot).battle = {
      attacker: {
        instanceId: "opponent-leader" as InstanceId,
        cardId: "OP01-002" as CardId,
        playerId: "p1" as PlayerId,
      },
      originalTarget: {
        instanceId: "bot-leader" as InstanceId,
        cardId: "OP01-001" as CardId,
        playerId: botId,
      },
      currentTarget: {
        instanceId: "bot-leader" as InstanceId,
        cardId: "OP01-001" as CardId,
        playerId: botId,
      },
      step: "counter",
      damageCount: 1,
    };
    viewForBot(snapshot).pendingDecision = {
      id: "decision:counterStep:pass:test" as DecisionId,
      type: "selectCards",
      playerId: botId,
      prompt: "Use counter or end step.",
      causedBy: { type: "ruleProcess", name: "test" },
      presentation: { title: "Counter", instruction: "Use counter." },
      min: 0,
      max: 0,
      candidates: [],
      choices: [],
    };

    const chosen = chooseBotAction(snapshot, botId);

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("blocks lethal leader damage with the lowest-value blocker", () => {
    const lowValueBlocker = {
      instanceId: "small-blocker" as InstanceId,
      cardId: "OP01-004" as CardId,
      playerId: botId,
    };
    const highValueBlocker = {
      instanceId: "large-blocker" as InstanceId,
      cardId: "OP01-005" as CardId,
      playerId: botId,
    };
    const snapshot = snapshotWithActions([], {
      selfLifeCount: 0,
      selfLeader: { currentPower: 5000 },
      selfCharacters: [
        {
          instanceId: "small-blocker" as InstanceId,
          cardId: "OP01-004" as CardId,
          currentPower: 2000,
          printedCost: 1,
          keywords: ["blocker"],
        },
        {
          instanceId: "large-blocker" as InstanceId,
          cardId: "OP01-005" as CardId,
          currentPower: 9000,
          printedCost: 8,
          keywords: ["blocker"],
        },
      ],
      opponentLeader: { currentPower: 7000 },
    });
    viewForBot(snapshot).battle = {
      attacker: {
        instanceId: "opponent-leader" as InstanceId,
        cardId: "OP01-002" as CardId,
        playerId: "p1" as PlayerId,
      },
      originalTarget: {
        instanceId: "bot-leader" as InstanceId,
        cardId: "OP01-001" as CardId,
        playerId: botId,
      },
      currentTarget: {
        instanceId: "bot-leader" as InstanceId,
        cardId: "OP01-001" as CardId,
        playerId: botId,
      },
      step: "block",
      damageCount: 1,
    };
    viewForBot(snapshot).pendingDecision = {
      id: "decision:blockStep:test" as DecisionId,
      type: "selectCards",
      playerId: botId,
      prompt: "Choose blocker or decline.",
      causedBy: { type: "ruleProcess", name: "test" },
      presentation: { title: "Block", instruction: "Choose blocker." },
      min: 0,
      max: 1,
      candidates: [{ card: lowValueBlocker }, { card: highValueBlocker }],
      choices: [
        { card: lowValueBlocker, selectable: true },
        { card: highValueBlocker, selectable: true },
      ],
    };

    const chosen = chooseBotAction(snapshot, botId);

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:blockStep:test",
      response: { type: "cards", cards: [lowValueBlocker] },
    });
  });

  test("selects a useful optional card choice instead of defaulting to zero", () => {
    const searchHit = {
      instanceId: "search-hit" as InstanceId,
      cardId: "OP01-006" as CardId,
      playerId: botId,
    };
    const snapshot = snapshotWithActions([]);
    viewForBot(snapshot).pendingDecision = {
      id: "decision:optional-search" as DecisionId,
      type: "selectCards",
      playerId: botId,
      prompt: "Reveal up to 1 card.",
      causedBy: { type: "ruleProcess", name: "test" },
      presentation: { title: "Search", instruction: "Choose." },
      min: 0,
      max: 1,
      candidates: [{ card: searchHit }],
      choices: [{ card: searchHit, selectable: true }],
    };

    const chosen = chooseBotAction(snapshot, botId);

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:optional-search",
      response: { type: "cards", cards: [searchHit] },
    });
  });
});
