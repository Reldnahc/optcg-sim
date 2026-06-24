import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type {
  CardId,
  CardRef,
  DecisionId,
  InstanceId,
  PlayerId,
  PublicPendingDecisionId,
  PublicCardView,
} from "@optcg/types";

import { chooseBotAction, chooseBotActionReport } from "./bot-player.js";
import { redShanksProfileData } from "./bot-red-shanks-profile.js";
import type { DevMatchSnapshot } from "./dev-snapshot-types.js";

const botId = "p2" as PlayerId;
const opponentId = "p1" as PlayerId;

const snapshotWithActions = (
  actions: DevMatchSnapshot["players"][PlayerId]["actions"],
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
      turnPlayerId: opponentId,
      phase: "main",
      globalTurn: 1,
      playerTurnCounts: { [botId]: 2, [opponentId]: 1 },
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
            characters: cards.selfCharacters ?? [],
            costArea: cards.selfCostArea ?? [],
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
  test("Red Shanks cheat targets are data, not decision callback branches", () => {
    assert.deepEqual(
      redShanksProfileData.cheatTargets.map((target) => target.cardId),
      ["OP06-007", "OP09-004", "ST23-002", "OP12-008"],
    );
  });

  test("Red Shanks search priorities are data-driven", () => {
    assert.deepEqual(redShanksProfileData.searchPriorities["OP09-002"], [
      "OP16-012",
      "OP09-004",
      "OP06-007",
      "ST23-002",
      "OP12-008",
      "OP09-011",
      "OP09-020",
      "OP09-002",
      "OP09-009",
      "OP09-014",
      "OP16-018",
    ]);
  });

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
      spotlightPendingId:
        "spotlight:pending:test:op09-leader-defense" as PublicPendingDecisionId,
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

    const report = chooseBotActionReport({ snapshot, botPlayerId: botId });

    assert.notEqual(report, undefined);
    if (report === undefined) {
      throw new Error("Expected bot action report.");
    }
    assert.deepEqual(report.choice, {
      type: "respondToDecision",
      decisionId: "decision:op09-leader-defense",
      response: { type: "optionalActivation", choice: "activate" },
    });
    assert.deepEqual(report.decisionReason, {
      kind: "profile",
      profileId: "red-shanks",
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
      spotlightPendingId:
        "spotlight:pending:test:op09-leader-counter-setup" as PublicPendingDecisionId,
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
      spotlightPendingId:
        "spotlight:pending:test:op09-leader-target" as PublicPendingDecisionId,
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

  test("does not activate configured power reduction effects without useful targets", () => {
    const snapshot = snapshotWithActions(
      [
        { index: 0, type: "endMainPhase", label: "End Main" },
        {
          index: 1,
          type: "activateEffect",
          label: "Activate OP09-011",
          placement: { instanceId: "op09-011" as InstanceId },
        },
      ],
      {
        selfCharacters: [
          {
            instanceId: "op09-011" as InstanceId,
            cardId: "OP09-011" as CardId,
            owner: botId,
            controller: botId,
            zone: { playerId: botId, zone: "characterArea" },
            currentPower: 5000,
          },
        ],
      },
    );

    const chosen = chooseBotAction(snapshot, botId);

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 0 });
  });

  test("activates configured power reduction effects when they enable an attack", () => {
    const snapshot = snapshotWithActions(
      [
        { index: 0, type: "endMainPhase", label: "End Main" },
        {
          index: 1,
          type: "activateEffect",
          label: "Activate OP09-011",
          placement: { instanceId: "op09-011" as InstanceId },
        },
      ],
      {
        selfCharacters: [
          {
            instanceId: "op09-011" as InstanceId,
            cardId: "OP09-011" as CardId,
            owner: botId,
            controller: botId,
            zone: { playerId: botId, zone: "characterArea" },
            currentPower: 5000,
          },
        ],
        opponentCharacters: [
          {
            instanceId: "opponent-7000" as InstanceId,
            cardId: "OP01-004" as CardId,
            owner: opponentId,
            controller: opponentId,
            zone: { playerId: opponentId, zone: "characterArea" },
            currentPower: 7000,
          },
        ],
      },
    );

    const chosen = chooseBotAction(snapshot, botId);

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("chooses useful targets for configured power reduction effects", () => {
    const usefulTarget = {
      instanceId: "opponent-7000" as InstanceId,
      cardId: "OP01-004" as CardId,
      playerId: opponentId,
    };
    const lowValueTarget = {
      instanceId: "opponent-3000" as InstanceId,
      cardId: "OP01-005" as CardId,
      playerId: opponentId,
    };
    const snapshot = snapshotWithActions(
      [
        {
          index: 0,
          type: "respondToDecision",
          label: "Choose target",
        },
      ],
      {
        opponentCharacters: [
          { ...usefulTarget, currentPower: 7000 },
          { ...lowValueTarget, currentPower: 3000 },
        ],
      },
    );
    viewForBot(snapshot).pendingDecision = {
      id: "decision:op09-011-target" as DecisionId,
      spotlightPendingId:
        "spotlight:pending:test:op09-011-target" as PublicPendingDecisionId,
      type: "selectTargets",
      playerId: botId,
      prompt: "Choose a target.",
      causedBy: { type: "ruleProcess", name: "test" },
      source: {
        instanceId: "op09-011" as InstanceId,
        cardId: "OP09-011" as CardId,
        playerId: botId,
      },
      presentation: { title: "Choose", instruction: "Choose." },
      min: 0,
      max: 1,
      candidates: [{ card: usefulTarget }, { card: lowValueTarget }],
    };

    const chosen = chooseBotAction(snapshot, botId);

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:op09-011-target",
      response: { type: "targets", targets: [usefulTarget] },
    });
  });

  test("does not play OP16-012 into a full field of preserved Shanks cards", () => {
    const chosen = chooseBotAction(
      snapshotWithActions(
        [
          {
            index: 0,
            type: "playCard",
            label: "Play Benn.Beckman",
            placement: { instanceId: "op16-benn" as InstanceId },
          },
          {
            index: 1,
            type: "endMainPhase",
            label: "End main phase",
          },
        ],
        {
          selfHand: [
            {
              instanceId: "op16-benn" as InstanceId,
              cardId: "OP16-012" as CardId,
              zone: { playerId: botId, zone: "hand" },
            },
            {
              instanceId: "hand-shanks" as InstanceId,
              cardId: "ST23-002" as CardId,
              zone: { playerId: botId, zone: "hand" },
            },
          ],
          selfCharacters: Array.from({ length: 5 }, (_, index) => ({
            instanceId: `field-shanks-${String(index)}` as InstanceId,
            cardId: "ST23-002" as CardId,
            zone: { playerId: botId, zone: "characterArea", index },
            currentPower: 10000,
          })),
          selfCostArea: Array.from({ length: 10 }, (_, index) => ({
            instanceId: `don-${String(index)}` as InstanceId,
            cardId: "DON!!" as CardId,
            zone: { playerId: botId, zone: "costArea" },
          })),
        },
      ),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("plays OP16-012 into a full field when a setup character can be overflowed", () => {
    const chosen = chooseBotAction(
      snapshotWithActions(
        [
          {
            index: 0,
            type: "playCard",
            label: "Play Benn.Beckman",
            placement: { instanceId: "op16-benn" as InstanceId },
          },
          {
            index: 1,
            type: "endMainPhase",
            label: "End main phase",
          },
        ],
        {
          selfHand: [
            {
              instanceId: "op16-benn" as InstanceId,
              cardId: "OP16-012" as CardId,
              zone: { playerId: botId, zone: "hand" },
            },
            {
              instanceId: "hand-shanks" as InstanceId,
              cardId: "ST23-002" as CardId,
              zone: { playerId: botId, zone: "hand" },
            },
          ],
          selfCharacters: [
            {
              instanceId: "searcher" as InstanceId,
              cardId: "OP09-002" as CardId,
              zone: { playerId: botId, zone: "characterArea", index: 0 },
              currentPower: 3000,
            },
            ...Array.from({ length: 4 }, (_, index) => ({
              instanceId: `field-shanks-${String(index)}` as InstanceId,
              cardId: "ST23-002" as CardId,
              zone: {
                playerId: botId,
                zone: "characterArea" as const,
                index: index + 1,
              },
              currentPower: 10000,
            })),
          ],
          selfCostArea: Array.from({ length: 10 }, (_, index) => ({
            instanceId: `don-${String(index)}` as InstanceId,
            cardId: "DON!!" as CardId,
            zone: { playerId: botId, zone: "costArea" },
          })),
        },
      ),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 0 });
  });

  test("trashes setup characters for OP16-012 play-card overflow before preserved Shanks cards", () => {
    const setupCharacter: CardRef = {
      instanceId: "searcher" as InstanceId,
      cardId: "OP09-002" as CardId,
      playerId: botId,
      zone: { zone: "characterArea", playerId: botId, index: 0 },
    };
    const shanksCharacter: CardRef = {
      instanceId: "field-shanks" as InstanceId,
      cardId: "ST23-002" as CardId,
      playerId: botId,
      zone: { zone: "characterArea", playerId: botId, index: 1 },
    };
    const snapshot = snapshotWithActions([]);
    viewForBot(snapshot).pendingDecision = {
      id: "decision:playCard:overflow:op16-benn:11" as DecisionId,
      type: "selectCards",
      playerId: botId,
      prompt: "Choose a Character to trash.",
      causedBy: { type: "ruleProcess", name: "characterOverflow" },
      source: {
        instanceId: "op16-benn" as InstanceId,
        cardId: "OP16-012" as CardId,
        playerId: botId,
      },
      presentation: {
        title: "Character overflow",
        instruction: "Choose a Character to trash.",
      },
      min: 1,
      max: 1,
      candidates: [{ card: shanksCharacter }, { card: setupCharacter }],
      choices: [
        { card: shanksCharacter, selectable: true },
        { card: setupCharacter, selectable: true },
      ],
    };

    const chosen = chooseBotAction(snapshot, botId);

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:playCard:overflow:op16-benn:11",
      response: { type: "cards", cards: [setupCharacter] },
    });
  });
});
