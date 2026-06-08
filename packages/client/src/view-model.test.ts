import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type {
  CardId,
  CardRef,
  EffectId,
  EffectTextSourceMap,
  InstanceId,
  MatchId,
  PlayerId,
  PlayerView,
  StateSeq,
  Zone,
} from "@optcg/types";

import type { MatchCardCatalog, MatchSnapshot } from "./transport.js";
import { createBoardViewModel } from "./view-model.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const card = (
  id: string,
  cardId: string,
  zone: Zone,
  owner: PlayerId = p1,
): PlayerView["self"]["hand"][number] => ({
  instanceId: id as InstanceId,
  cardId: cardId as CardId,
  owner,
  controller: owner,
  zone: { playerId: owner, zone },
  attachedDonCount: 0,
  attachedDonIds: [],
});

const ref = (
  id: string,
  cardId = "OP13-080",
  playerId: PlayerId = p1,
): CardRef => ({
  instanceId: id as InstanceId,
  cardId: cardId as CardId,
  playerId,
});

const minimalView = (): PlayerView => ({
  matchId: "match-1" as MatchId,
  playerId: p1,
  stateSeq: 7 as StateSeq,
  actionSeq: 2,
  turn: {
    globalTurn: 1,
    playerTurnCounts: { [p1]: 1, [p2]: 0 },
    turnPlayerId: p1,
    phase: "main",
  },
  self: {
    playerId: p1,
    deckCount: 40,
    donDeckCount: 10,
    hand: [card("hand-1", "OP13-080", "hand")],
    trash: [],
    leader: {
      ...card("leader-1", "OP13-079", "leaderArea"),
      attachedDonCount: 1,
      attachedDonIds: ["don-1" as InstanceId],
      printedPower: 5000,
      currentPower: 7000,
      printedCost: 5,
      currentCost: 4,
      keywords: ["blocker"],
    },
    characters: [
      {
        ...card("char-1", "OP13-089", "characterArea"),
        printedPower: 5000,
        currentPower: 4000,
        printedCost: 3,
        currentCost: 5,
        keywords: ["doubleAttack"],
      },
    ],
    costArea: [
      card("don-1", "DON", "costArea"),
      card("don-2", "DON", "costArea"),
    ],
    life: { count: 5, faceUpCards: [] },
    hasMulliganed: true,
    turnCount: 1,
  },
  opponent: {
    playerId: p2,
    deckCount: 40,
    donDeckCount: 10,
    handCount: 5,
    trash: [],
    leader: card("opp-leader", "OP01-001", "leaderArea", p2),
    characters: [],
    costArea: [],
    life: { count: 5, faceUpCards: [] },
    hasMulliganed: true,
    turnCount: 0,
  },
  legalActions: [
    { type: "playCard", card: ref("hand-1") },
    {
      type: "activateEffect",
      source: ref("char-1", "OP13-089"),
      effectId: "effect-1" as EffectId,
    },
    {
      type: "attachDon",
      don: ref("don-1", "DON"),
      target: ref("leader-1", "OP13-079"),
    },
  ],
  revealedCards: [],
  events: [],
  timers: { players: {} },
});

describe("board view model", () => {
  test("projects player display names from the match snapshot", () => {
    const snapshot: MatchSnapshot = {
      matchId: "match-1" as MatchId,
      stateSeq: 7,
      playerLabels: {
        [p1]: { displayName: "Alice", connectionStatus: "connected" },
        [p2]: { displayName: "Bob", connectionStatus: "disconnected" },
      },
      players: {
        [p1]: {
          view: minimalView(),
          actions: [],
        },
      },
    };

    const p1Model = createBoardViewModel({
      snapshot,
      catalog: { players: {} },
      playerId: p1,
    });

    assert.equal(p1Model.selfLabel, "Alice");
    assert.equal(p1Model.opponentLabel, "Bob");
    assert.equal(p1Model.selfConnectionStatus, "connected");
    assert.equal(p1Model.opponentConnectionStatus, "disconnected");
  });

  test("projects game and disconnect timers for both player summaries", () => {
    const view = minimalView();
    view.timers = {
      activePlayerId: p1,
      players: {
        [p1]: { remainingMs: 1_050_000, isRunning: true },
        [p2]: { remainingMs: 65_000, isRunning: false },
      },
      disconnects: {
        [p2]: { remainingMs: 119_000, isRunning: true },
      },
    };
    const snapshot: MatchSnapshot = {
      matchId: "match-1" as MatchId,
      stateSeq: 7,
      players: {
        [p1]: {
          view,
          actions: [],
        },
      },
    };

    const p1Model = createBoardViewModel({
      snapshot,
      catalog: { players: {} },
      playerId: p1,
    });

    assert.deepEqual(p1Model.selfTimer, {
      game: "17:30",
      isRunning: true,
    });
    assert.deepEqual(p1Model.opponentTimer, {
      game: "1:05",
      isRunning: false,
      disconnect: "1:59",
    });
  });

  test("projects player-level restrictions for summary badges", () => {
    const view = minimalView();
    view.self.restrictions = ["no-character-don-refresh"];
    view.opponent.restrictions = ["no-event-don-refresh"];
    const snapshot: MatchSnapshot = {
      matchId: "match-1" as MatchId,
      stateSeq: 7,
      players: {
        [p1]: {
          view,
          actions: [],
        },
      },
    };

    const model = createBoardViewModel({
      snapshot,
      catalog: { players: {} },
      playerId: p1,
    });

    assert.deepEqual(model.selfRestrictions, ["no-character-don-refresh"]);
    assert.deepEqual(model.opponentRestrictions, ["no-event-don-refresh"]);
  });

  test("marks which player summary owns the current turn", () => {
    const view = minimalView();
    view.turn.turnPlayerId = p2;
    const snapshot: MatchSnapshot = {
      matchId: "match-1" as MatchId,
      stateSeq: 7,
      players: {
        [p1]: {
          view,
          actions: [],
        },
      },
    };

    const p1Model = createBoardViewModel({
      snapshot,
      catalog: { players: {} },
      playerId: p1,
    });

    assert.equal(p1Model.selfIsTurnPlayer, false);
    assert.equal(p1Model.opponentIsTurnPlayer, true);
  });

  test("builds zones and card-attached action menus from a filtered player view", () => {
    const snapshot: MatchSnapshot = {
      matchId: "match-1" as MatchId,
      stateSeq: 7,
      players: {
        [p1]: {
          view: minimalView(),
          actions: [
            {
              index: 0,
              type: "playCard",
              label: "Play OP13-080",
              placement: { instanceId: "hand-1" as InstanceId },
            },
            {
              index: 1,
              type: "activateEffect",
              label: "Activate effect",
              placement: { instanceId: "char-1" as InstanceId },
            },
            {
              index: 2,
              type: "attachDon",
              label: "Attach DON!!",
              placement: { instanceId: "leader-1" as InstanceId },
              attachment: {
                donInstanceId: "don-2" as InstanceId,
                targetInstanceId: "leader-1" as InstanceId,
              },
            },
          ],
        },
      },
    };
    const effectTextSourceMap: EffectTextSourceMap = {
      textKind: "effect",
      sourceText: "[On Play] Look at cards.",
      spans: [
        {
          id: "span:body:look",
          role: "body",
          start: 10,
          end: 24,
          text: "Look at cards.",
          primitiveEvidence: ["instruction:look"],
        },
      ],
    };
    const triggerTextSourceMap: EffectTextSourceMap = {
      textKind: "trigger",
      sourceText: "Draw 1 card.",
      spans: [
        {
          id: "span:body:draw",
          role: "body",
          start: 0,
          end: 12,
          text: "Draw 1 card.",
          primitiveEvidence: ["instruction:draw"],
        },
      ],
    };
    const catalog: MatchCardCatalog = {
      players: {
        [p1]: {
          cards: {
            ["OP13-080" as CardId]: {
              cardId: "OP13-080" as CardId,
              name: "Searcher",
              category: "Character",
              counter: 1000,
              attributes: ["special"],
              types: ["Dressrosa", "Navy"],
              effectText: "[On Play] Look at cards.",
              triggerText: "Draw 1 card.",
              effectTextSourceMap,
              triggerTextSourceMap,
              imageUrl: "https://cdn.example/card.png",
            },
            ["OP13-089" as CardId]: {
              cardId: "OP13-089" as CardId,
              name: "Character",
              category: "Character",
            },
          },
        },
      },
    };

    const model = createBoardViewModel({ snapshot, catalog, playerId: p1 });

    const handCard = model.self.hand[0];
    if (handCard === undefined) {
      throw new Error("Expected the hand card in the view model.");
    }
    assert.equal(handCard.name, "Searcher");
    assert.equal(handCard.effectText, "[On Play] Look at cards.");
    assert.equal(handCard.triggerText, "Draw 1 card.");
    assert.deepEqual(handCard.effectTextSourceMap, effectTextSourceMap);
    assert.deepEqual(handCard.triggerTextSourceMap, triggerTextSourceMap);
    assert.equal(handCard.imageUrl, "https://cdn.example/card.png");
    assert.equal(handCard.counter, 1000);
    assert.deepEqual(handCard.attributes, ["special"]);
    assert.deepEqual(handCard.types, ["Dressrosa", "Navy"]);
    assert.deepEqual(
      model.actionsByCardInstanceId["hand-1"]?.map((action) => action.label),
      ["Play OP13-080"],
    );
    assert.deepEqual(
      model.actionsByCardInstanceId["char-1"]?.map((action) => action.label),
      ["Activate effect"],
    );
    assert.equal(model.actionsByCardInstanceId["leader-1"], undefined);
    assert.deepEqual(
      model.self.costArea.map((costCard) => String(costCard.instanceId)),
      ["don-2"],
    );
    assert.deepEqual(
      model.self.leader.attachedDonCards.map((don) => String(don.instanceId)),
      ["don-1"],
    );
    assert.equal(model.self.leader.printedPower, 5000);
    assert.equal(model.self.leader.currentPower, 7000);
    assert.equal(model.self.leader.powerDelta, 2000);
    assert.equal(model.self.leader.printedCost, 5);
    assert.equal(model.self.leader.currentCost, 4);
    assert.equal(model.self.leader.costDelta, -1);
    assert.deepEqual(model.self.leader.keywords, ["blocker"]);
    const character = model.self.characters[0];
    if (character === undefined) {
      throw new Error("Expected the character in the view model.");
    }
    assert.equal(character.printedPower, 5000);
    assert.equal(character.currentPower, 4000);
    assert.equal(character.powerDelta, -1000);
    assert.equal(character.printedCost, 3);
    assert.equal(character.currentCost, 5);
    assert.equal(character.costDelta, 2);
    assert.deepEqual(character.keywords, ["doubleAttack"]);
    assert.equal(JSON.stringify(model).includes("deckOrder"), false);
  });

  test("tolerates older snapshots that do not include attached DON ids yet", () => {
    const view = minimalView();
    const legacyLeader: Partial<PlayerView["self"]["leader"]> = {
      ...view.self.leader,
    };
    delete legacyLeader.attachedDonIds;
    view.self.leader = legacyLeader as unknown as PlayerView["self"]["leader"];
    const snapshot: MatchSnapshot = {
      matchId: "match-1" as MatchId,
      stateSeq: 7,
      players: {
        [p1]: {
          view,
          actions: [],
        },
      },
    };

    const model = createBoardViewModel({
      snapshot,
      catalog: { players: {} },
      playerId: p1,
    });

    assert.deepEqual(model.self.leader.attachedDonCards, []);
  });

  test("prefers per-instance catalog art for visible board cards", () => {
    const snapshot: MatchSnapshot = {
      matchId: "match-1" as MatchId,
      stateSeq: 7,
      players: {
        [p1]: {
          view: minimalView(),
          actions: [],
        },
      },
    };
    const catalog: MatchCardCatalog = {
      players: {
        [p1]: {
          cards: {
            ["OP13-080" as CardId]: {
              cardId: "OP13-080" as CardId,
              name: "Searcher",
              category: "Character",
              imageUrl: "https://cdn.example/default.png",
            },
          },
          instances: {
            ["hand-1" as InstanceId]: {
              cardId: "OP13-080" as CardId,
              name: "Searcher Variant",
              category: "Character",
              imageUrl: "https://cdn.example/variant.png",
            },
          },
        },
      },
    };

    const model = createBoardViewModel({ snapshot, catalog, playerId: p1 });
    const handCard = model.self.hand[0];
    if (handCard === undefined) {
      throw new Error("Expected visible hand card.");
    }

    assert.equal(handCard.imageUrl, "https://cdn.example/variant.png");
    assert.equal(handCard.name, "Searcher Variant");
  });

  test("projects face-up life cards into indexed life positions", () => {
    const view = minimalView();
    view.self.life = {
      count: 3,
      faceUpCards: [
        {
          ...card("life-face-up", "OP15-116", "life"),
          zone: { playerId: p1, zone: "life", slot: "life", index: 1 },
        },
      ],
    };
    view.opponent.life = {
      count: 2,
      faceUpCards: [
        {
          ...card("opponent-life-face-up", "OP15-117", "life", p2),
          zone: { playerId: p2, zone: "life", slot: "life", index: 0 },
        },
      ],
    };
    const snapshot: MatchSnapshot = {
      matchId: "match-1" as MatchId,
      stateSeq: 7,
      players: {
        [p1]: {
          view,
          actions: [],
        },
      },
    };
    const catalog: MatchCardCatalog = {
      players: {
        [p1]: {
          cards: {
            ["OP15-116" as CardId]: {
              cardId: "OP15-116" as CardId,
              name: "Face-up Life",
              category: "Event",
              imageUrl: "https://cdn.example/life.png",
            },
          },
        },
        [p2]: {
          cards: {
            ["OP15-117" as CardId]: {
              cardId: "OP15-117" as CardId,
              name: "Opponent Face-up Life",
              category: "Event",
            },
          },
        },
      },
    };

    const model = createBoardViewModel({ snapshot, catalog, playerId: p1 });

    assert.deepEqual(
      model.self.lifeCards.map((lifeCard) => lifeCard.name),
      ["Hidden card", "Face-up Life", "Hidden card"],
    );
    assert.equal(
      model.self.lifeCards[1]?.imageUrl,
      "https://cdn.example/life.png",
    );
    assert.deepEqual(
      model.opponent.lifeCards.map((lifeCard) => lifeCard.name),
      ["Opponent Face-up Life", "Hidden card"],
    );
  });

  test("projects public battle attacker and current target for both seats", () => {
    const view = minimalView();
    view.battle = {
      attacker: ref("leader-1", "OP13-079", p1),
      originalTarget: ref("opp-leader", "OP01-001", p2),
      currentTarget: ref("opp-leader", "OP01-001", p2),
      step: "counter",
      damageCount: 1,
    };
    const snapshot: MatchSnapshot = {
      matchId: "match-1" as MatchId,
      stateSeq: 7,
      players: {
        [p1]: {
          view,
          actions: [],
        },
      },
    };

    const model = createBoardViewModel({
      snapshot,
      catalog: { players: {} },
      playerId: p1,
    });

    assert.deepEqual(model.battleArrow, {
      attackerInstanceId: "leader-1",
      targetInstanceId: "opp-leader",
    });
  });

  test("preserves active card ids separately from selection state", () => {
    const snapshot: MatchSnapshot = {
      matchId: "match-1" as MatchId,
      stateSeq: 7,
      players: {
        [p1]: {
          view: minimalView(),
          actions: [],
        },
      },
    };

    const model = createBoardViewModel({
      snapshot,
      catalog: { players: {} },
      playerId: p1,
      activeCardInstanceIds: ["char-1"],
    });

    assert.deepEqual(model.activeCardInstanceIds, ["char-1"]);
  });

  test("marks turn-player characters played this turn as first-turn attack restricted even when rested", () => {
    const view = minimalView();
    view.turn.globalTurn = 4;
    view.turn.turnPlayerId = p1;
    view.turn.phase = "main";
    view.self.characters = [
      {
        ...card("fresh-character", "OP13-089", "characterArea"),
        state: "active",
        turnPlayed: 4,
      },
      {
        ...card("fresh-rested-character", "OP13-089", "characterArea"),
        state: "rested",
        turnPlayed: 4,
      },
      {
        ...card("rush-character", "OP13-089", "characterArea"),
        state: "active",
        turnPlayed: 4,
        keywords: ["rush"],
      },
      {
        ...card("older-character", "OP13-089", "characterArea"),
        state: "active",
        turnPlayed: 3,
      },
    ];
    view.opponent.characters = [
      {
        ...card("opponent-fresh-character", "OP13-089", "characterArea", p2),
        state: "active",
        turnPlayed: 4,
      },
    ];
    const snapshot: MatchSnapshot = {
      matchId: "match-1" as MatchId,
      stateSeq: 7,
      players: {
        [p1]: {
          view,
          actions: [],
        },
      },
    };

    const model = createBoardViewModel({
      snapshot,
      catalog: { players: {} },
      playerId: p1,
    });

    assert.equal(model.self.characters[0]?.freshlyPlayedAttackRestricted, true);
    assert.equal(model.self.characters[1]?.freshlyPlayedAttackRestricted, true);
    assert.equal(
      model.self.characters[2]?.freshlyPlayedAttackRestricted,
      undefined,
    );
    assert.equal(
      model.self.characters[3]?.freshlyPlayedAttackRestricted,
      undefined,
    );
    assert.equal(
      model.opponent.characters[0]?.freshlyPlayedAttackRestricted,
      undefined,
    );
  });

  test("trash cards stay newest-first and render upright even if engine state was rested", () => {
    const view = minimalView();
    view.self.trash = [
      {
        instanceId: "new-trash" as InstanceId,
        cardId: "OP13-089" as CardId,
        owner: "p1" as PlayerId,
        controller: "p1" as PlayerId,
        zone: {
          zone: "trash",
          playerId: "p1" as PlayerId,
          slot: "trash",
          index: 0,
        },
        state: "rested",
        attachedDonCount: 0,
        attachedDonIds: [],
      },
      {
        instanceId: "old-trash" as InstanceId,
        cardId: "OP13-080" as CardId,
        owner: "p1" as PlayerId,
        controller: "p1" as PlayerId,
        zone: {
          zone: "trash",
          playerId: "p1" as PlayerId,
          slot: "trash",
          index: 1,
        },
        state: "rested",
        attachedDonCount: 0,
        attachedDonIds: [],
      },
    ];
    const snapshot: MatchSnapshot = {
      matchId: "match-1" as MatchId,
      stateSeq: 7,
      players: {
        [p1]: {
          view,
          actions: [],
        },
      },
    };

    const model = createBoardViewModel({
      snapshot,
      catalog: { players: {} },
      playerId: p1,
    });

    assert.equal(model.self.trash[0]?.instanceId, "new-trash");
    assert.equal(model.self.trash[1]?.instanceId, "old-trash");
    assert.equal(model.self.trash[0].state, undefined);
    assert.equal(model.self.trash[1].state, undefined);
  });
});
