import { strict as assert } from "node:assert";
import { describe, test } from "vitest";
import type {
  CardId,
  CardRef,
  DecisionId,
  InstanceId,
  PlayerId,
  PublicCardView,
} from "@optcg/types";

import { chooseBotAction } from "./bot-player.js";
import { createBotStrategy } from "./bot-strategy.js";
import type { DevMatchSnapshot } from "./dev-snapshot-types.js";

const botId = "p2" as PlayerId;

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

const viewForBot = (snapshot: DevMatchSnapshot) => {
  const player = snapshot.players[botId];
  if (player === undefined) {
    throw new Error("Expected bot player snapshot.");
  }
  return player.view;
};

describe("bot player", () => {
  test("keeps mulligans when a mulligan decision is available", () => {
    const chosen = chooseBotAction(
      snapshotWithActions([
        {
          index: 0,
          type: "respondToDecision",
          label: "Mulligan",
          responseKey: "mulligan",
        },
        {
          index: 1,
          type: "respondToDecision",
          label: "Keep",
          responseKey: "keep",
        },
      ]),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("accepts rollback consent decisions", () => {
    const snapshot = snapshotWithActions([]);
    viewForBot(snapshot).pendingDecision = {
      id: "decision:rollback:test" as DecisionId,
      type: "rollbackConsent",
      playerId: botId,
      prompt: "Allow rollback?",
      causedBy: { type: "ruleProcess", name: "test" },
      presentation: { title: "Rollback", instruction: "Allow rollback?" },
    };

    const chosen = chooseBotAction(snapshot, botId);

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:rollback:test",
      response: { type: "rollbackConsent", allow: true },
    });
  });

  test("plays cards before ending main phase", () => {
    const chosen = chooseBotAction(
      snapshotWithActions([
        {
          index: 0,
          type: "playCard",
          label: "Play card",
        },
        {
          index: 1,
          type: "endMainPhase",
          label: "End main phase",
        },
      ]),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 0 });
  });

  test("prioritizes OP16-012 over hard-casting Shanks when the cheat line is live", () => {
    const chosen = chooseBotAction(
      snapshotWithActions(
        [
          {
            index: 0,
            type: "playCard",
            label: "Play Shanks",
            placement: { instanceId: "st23-shanks" as InstanceId },
          },
          {
            index: 1,
            type: "playCard",
            label: "Play Benn.Beckman",
            placement: { instanceId: "op16-benn" as InstanceId },
          },
        ],
        {
          selfHand: [
            {
              instanceId: "st23-shanks" as InstanceId,
              cardId: "ST23-002" as CardId,
              zone: { playerId: botId, zone: "hand" },
            },
            {
              instanceId: "op16-benn" as InstanceId,
              cardId: "OP16-012" as CardId,
              zone: { playerId: botId, zone: "hand" },
            },
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

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("saves OP16-012 when the Shanks cheat line is not live yet", () => {
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
            type: "playCard",
            label: "Play Shanks",
            placement: { instanceId: "st23-shanks" as InstanceId },
          },
          {
            index: 2,
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
              instanceId: "st23-shanks" as InstanceId,
              cardId: "ST23-002" as CardId,
              zone: { playerId: botId, zone: "hand" },
            },
          ],
          selfCostArea: Array.from({ length: 9 }, (_, index) => ({
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

  test("can still play OP16-012 before ending when no better action exists", () => {
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
          ],
        },
      ),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 0 });
  });

  test("chooses OP06-007 from the OP16-012 cheat when removal is live", () => {
    const st23 = {
      instanceId: "st23-shanks" as InstanceId,
      cardId: "ST23-002" as CardId,
      playerId: botId,
    };
    const op06 = {
      instanceId: "op06-shanks" as InstanceId,
      cardId: "OP06-007" as CardId,
      playerId: botId,
    };
    const snapshot = snapshotWithActions([], {
      opponentCharacters: [
        {
          instanceId: "opponent-character" as InstanceId,
          currentPower: 8000,
        },
      ],
    });
    viewForBot(snapshot).pendingDecision = {
      id: "decision:op16-cheat" as DecisionId,
      type: "selectCards",
      playerId: botId,
      prompt: "Play up to 1 Shanks.",
      causedBy: { type: "ruleProcess", name: "test" },
      source: {
        instanceId: "op16-benn" as InstanceId,
        cardId: "OP16-012" as CardId,
        playerId: botId,
      },
      presentation: { title: "Choose", instruction: "Choose." },
      min: 1,
      max: 1,
      candidates: [{ card: st23 }, { card: op06 }],
      choices: [
        { card: st23, selectable: true },
        { card: op06, selectable: true },
      ],
    };

    const chosen = chooseBotAction(snapshot, botId);

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:op16-cheat",
      response: { type: "cards", cards: [op06] },
    });
  });

  test("trashes a low-value character for OP16-012 play-selected overflow", () => {
    const cheatedShanks: CardRef = {
      instanceId: "op06-shanks" as InstanceId,
      cardId: "OP06-007" as CardId,
      playerId: botId,
      zone: { zone: "characterArea", playerId: botId, index: 5 },
    };
    const setupCharacter: CardRef = {
      instanceId: "searcher" as InstanceId,
      cardId: "OP09-002" as CardId,
      playerId: botId,
      zone: { zone: "characterArea", playerId: botId, index: 0 },
    };
    const snapshot = snapshotWithActions([]);
    viewForBot(snapshot).pendingDecision = {
      id: "decision:play-selected-overflow:op16-benn" as DecisionId,
      type: "selectCards",
      playerId: botId,
      prompt: "Choose a Character to trash.",
      causedBy: { type: "ruleProcess", name: "playSelectedOverflow" },
      source: {
        instanceId: "op16-benn" as InstanceId,
        cardId: "OP16-012" as CardId,
        playerId: botId,
      },
      presentation: {
        title: "Character overflow",
        instruction: "Choose a Character to trash.",
      },
      min: 0,
      max: 5,
      candidates: [{ card: cheatedShanks }, { card: setupCharacter }],
      choices: [
        { card: cheatedShanks, selectable: true },
        { card: setupCharacter, selectable: true },
      ],
    };

    const chosen = chooseBotAction(snapshot, botId);

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:play-selected-overflow:op16-benn",
      response: { type: "cards", cards: [setupCharacter] },
    });
  });

  test("chooses OP16-012 from Red-Haired Pirates search results", () => {
    const hongo = {
      instanceId: "hongo" as InstanceId,
      cardId: "OP09-011" as CardId,
      playerId: botId,
    };
    const op16 = {
      instanceId: "op16-benn" as InstanceId,
      cardId: "OP16-012" as CardId,
      playerId: botId,
    };
    const snapshot = snapshotWithActions([]);
    viewForBot(snapshot).pendingDecision = {
      id: "decision:search" as DecisionId,
      type: "selectCards",
      playerId: botId,
      prompt: "Reveal a Red-Haired Pirates card.",
      causedBy: { type: "ruleProcess", name: "test" },
      source: {
        instanceId: "searcher" as InstanceId,
        cardId: "OP09-002" as CardId,
        playerId: botId,
      },
      presentation: { title: "Choose", instruction: "Choose." },
      min: 1,
      max: 1,
      candidates: [{ card: hongo }, { card: op16 }],
      choices: [
        { card: hongo, selectable: true },
        { card: op16, selectable: true },
      ],
    };

    const chosen = chooseBotAction(snapshot, botId);

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:search",
      response: { type: "cards", cards: [op16] },
    });
  });

  test("resolves pending search decisions before playing another card", () => {
    const searchHit = {
      instanceId: "search-hit" as InstanceId,
      cardId: "OP16-012" as CardId,
      playerId: botId,
    };
    const snapshot = snapshotWithActions([
      {
        index: 0,
        type: "playCard",
        label: "Play another card",
      },
    ]);
    viewForBot(snapshot).pendingDecision = {
      id: "decision:ace-sabo-luffy-search" as DecisionId,
      type: "selectCards",
      playerId: botId,
      prompt: "Reveal up to 1 card with a cost of 3 or more.",
      causedBy: { type: "ruleProcess", name: "test" },
      source: {
        instanceId: "searcher" as InstanceId,
        cardId: "PRB02-002" as CardId,
        playerId: botId,
      },
      presentation: { title: "Choose", instruction: "Choose." },
      min: 1,
      max: 1,
      candidates: [{ card: searchHit }],
      choices: [{ card: searchHit, selectable: true }],
    };

    const chosen = chooseBotAction(snapshot, botId);

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:ace-sabo-luffy-search",
      response: { type: "cards", cards: [searchHit] },
    });
  });

  test("activates OP09-001 leader power reduction when it changes battle math", () => {
    const snapshot = snapshotWithActions([], {
      selfLeader: {
        cardId: "OP09-001" as CardId,
        currentPower: 5000,
      },
      opponentLeader: { currentPower: 5000 },
    });
    viewForBot(snapshot).battle = {
      attacker: {
        instanceId: "opponent-leader" as InstanceId,
        cardId: "OP01-002" as CardId,
        playerId: "p1" as PlayerId,
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
      step: "block",
      damageCount: 1,
    };
    viewForBot(snapshot).pendingDecision = {
      id: "decision:leader-defense" as DecisionId,
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
      decisionId: "decision:leader-defense",
      response: { type: "optionalActivation", choice: "activate" },
    });
  });

  test("targets the current attacker with OP09-001 leader power reduction", () => {
    const opponentCharacter = {
      instanceId: "opponent-character" as InstanceId,
      cardId: "OP01-003" as CardId,
      playerId: "p1" as PlayerId,
    };
    const opponentLeader = {
      instanceId: "opponent-leader" as InstanceId,
      cardId: "OP01-002" as CardId,
      playerId: "p1" as PlayerId,
    };
    const snapshot = snapshotWithActions([], {
      selfLeader: { cardId: "OP09-001" as CardId },
    });
    viewForBot(snapshot).battle = {
      attacker: opponentLeader,
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
      step: "block",
      damageCount: 1,
    };
    viewForBot(snapshot).pendingDecision = {
      id: "decision:leader-target" as DecisionId,
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
      decisionId: "decision:leader-target",
      response: { type: "targets", targets: [opponentLeader] },
    });
  });

  test("allows a behavior profile to prefer attaching DON before playing cards", () => {
    const strategy = createBotStrategy({
      scoreAction({ action }) {
        return action.type === "attachDon" ? -10 : undefined;
      },
    });

    const chosen = strategy.chooseAction({
      snapshot: snapshotWithActions([
        {
          index: 0,
          type: "playCard",
          label: "Play card",
        },
        {
          index: 1,
          type: "attachDon",
          label: "Attach DON",
        },
      ]),
      botPlayerId: botId,
    });

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("allows a behavior profile to reject specific visible actions", () => {
    const strategy = createBotStrategy({
      scoreAction({ action }) {
        return action.type === "playCard" ? false : undefined;
      },
    });

    const chosen = strategy.chooseAction({
      snapshot: snapshotWithActions([
        {
          index: 0,
          type: "playCard",
          label: "Play card",
        },
        {
          index: 1,
          type: "endMainPhase",
          label: "End main phase",
        },
      ]),
      botPlayerId: botId,
    });

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("allows card behavior profiles to score actions touching that card", () => {
    const strategy = createBotStrategy({
      cardBehaviors: {
        "OP01-003": {
          scoreAction({ action }) {
            return action.type === "attachDon" ? -20 : undefined;
          },
        },
      },
    });

    const chosen = strategy.chooseAction({
      snapshot: snapshotWithActions(
        [
          {
            index: 0,
            type: "playCard",
            label: "Play card",
          },
          {
            index: 1,
            type: "attachDon",
            label: "Attach DON",
            attachment: {
              donInstanceId: "don-1" as InstanceId,
              targetInstanceId: "bot-character" as InstanceId,
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
              cardId: "OP01-003" as CardId,
              currentPower: 5000,
            },
          ],
          opponentLeader: { currentPower: 5000 },
        },
      ),
      botPlayerId: botId,
    });

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("attacks before ending main phase", () => {
    const chosen = chooseBotAction(
      snapshotWithActions(
        [
          {
            index: 0,
            type: "endMainPhase",
            label: "End main phase",
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
          selfLeader: { currentPower: 7000 },
          opponentLeader: { currentPower: 5000 },
        },
      ),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("does not attack leader when the attacker has lower power", () => {
    const chosen = chooseBotAction(
      snapshotWithActions(
        [
          {
            index: 0,
            type: "endMainPhase",
            label: "End main phase",
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
          selfLeader: { currentPower: 5000 },
          opponentLeader: { currentPower: 7000 },
        },
      ),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 0 });
  });

  test("does not attack a character when the attacker has lower power", () => {
    const chosen = chooseBotAction(
      snapshotWithActions(
        [
          {
            index: 0,
            type: "endMainPhase",
            label: "End main phase",
          },
          {
            index: 1,
            type: "declareAttack",
            label: "Attack character",
            attack: {
              attackerInstanceId: "bot-character" as InstanceId,
              targetInstanceId: "opponent-character" as InstanceId,
            },
          },
        ],
        {
          selfCharacters: [
            {
              instanceId: "bot-character" as InstanceId,
              currentPower: 4000,
            },
          ],
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

  test("attacks a character when the attacker has enough power", () => {
    const chosen = chooseBotAction(
      snapshotWithActions(
        [
          {
            index: 0,
            type: "endMainPhase",
            label: "End main phase",
          },
          {
            index: 1,
            type: "declareAttack",
            label: "Attack character",
            attack: {
              attackerInstanceId: "bot-character" as InstanceId,
              targetInstanceId: "opponent-character" as InstanceId,
            },
          },
        ],
        {
          selfCharacters: [
            {
              instanceId: "bot-character" as InstanceId,
              currentPower: 6000,
            },
          ],
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

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("prefers attacking a character over leader when both attacks are live", () => {
    const chosen = chooseBotAction(
      snapshotWithActions(
        [
          {
            index: 0,
            type: "declareAttack",
            label: "Attack leader",
            attack: {
              attackerInstanceId: "bot-character" as InstanceId,
              targetInstanceId: "opponent-leader" as InstanceId,
            },
          },
          {
            index: 1,
            type: "declareAttack",
            label: "Attack character",
            attack: {
              attackerInstanceId: "bot-character" as InstanceId,
              targetInstanceId: "opponent-character" as InstanceId,
            },
          },
        ],
        {
          selfCharacters: [
            {
              instanceId: "bot-character" as InstanceId,
              currentPower: 6000,
            },
          ],
          opponentLeader: { currentPower: 5000 },
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

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("activates effects before ending main phase", () => {
    const chosen = chooseBotAction(
      snapshotWithActions([
        {
          index: 0,
          type: "endMainPhase",
          label: "End main phase",
        },
        {
          index: 1,
          type: "activateEffect",
          label: "Activate effect",
        },
      ]),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("pays available optional costs before declining them", () => {
    const chosen = chooseBotAction(
      snapshotWithActions([
        {
          index: 0,
          type: "respondToDecision",
          label: "Decline cost",
          responseKey: "decline",
          decisionPayment: { kind: "paymentDeclined" },
        },
        {
          index: 1,
          type: "respondToDecision",
          label: "Rest 1 DON!!",
          responseKey: "payment:don:1",
          decisionPayment: {
            kind: "cardCost",
            operation: "returnDon",
            chooseLabel: "Choose DON!!",
            selectedCardInstanceIds: ["don-1" as InstanceId],
          },
        },
      ]),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("attaches DON before ending main phase", () => {
    const chosen = chooseBotAction(
      snapshotWithActions([
        {
          index: 0,
          type: "endMainPhase",
          label: "End main phase",
        },
        {
          index: 1,
          type: "attachDon",
          label: "Attach DON",
        },
      ]),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("ignores concession when another legal action exists", () => {
    const chosen = chooseBotAction(
      snapshotWithActions([
        {
          index: 0,
          type: "concede",
          label: "Concede",
        },
        {
          index: 1,
          type: "advanceToMainPhase",
          label: "Advance to main phase",
        },
      ]),
      botId,
    );

    assert.deepEqual(chosen, { type: "submitAction", actionIndex: 1 });
  });

  test("does not concede when concession is the only visible action", () => {
    const chosen = chooseBotAction(
      snapshotWithActions([
        {
          index: 0,
          type: "concede",
          label: "Concede",
        },
      ]),
      botId,
    );

    assert.equal(chosen, undefined);
  });

  test("chooses the minimum selectable cards when no visible decision action exists", () => {
    const chosen = chooseBotAction(
      {
        ...snapshotWithActions([]),
        players: {
          [botId]: {
            actions: [],
            view: {
              pendingDecision: {
                id: "decision:select" as DecisionId,
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
                      cardId: "OP01-001",
                      playerId: botId,
                    },
                  },
                ],
                choices: [
                  {
                    card: {
                      instanceId: "card-1" as InstanceId,
                      cardId: "OP01-001",
                      playerId: botId,
                    },
                    selectable: true,
                  },
                  {
                    card: {
                      instanceId: "card-2" as InstanceId,
                      cardId: "OP01-002",
                      playerId: botId,
                    },
                    selectable: false,
                  },
                ],
              },
            },
          },
        },
      } as unknown as DevMatchSnapshot,
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
      {
        ...snapshotWithActions([]),
        players: {
          [botId]: {
            actions: [],
            view: {
              pendingDecision: {
                id: "decision:quantity" as DecisionId,
                type: "chooseQuantity",
                playerId: botId,
                prompt: "Choose quantity.",
                causedBy: { type: "ruleProcess", name: "test" },
                presentation: { title: "Choose", instruction: "Choose." },
                mode: "upTo",
                min: 0,
                max: 3,
              },
            },
          },
        },
      } as unknown as DevMatchSnapshot,
      botId,
    );

    assert.deepEqual(chosen, {
      type: "respondToDecision",
      decisionId: "decision:quantity",
      response: { type: "chooseQuantity", quantity: 0 },
    });
  });
});
