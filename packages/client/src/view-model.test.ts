import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type {
  CardId,
  CardRef,
  EffectId,
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
    },
    characters: [card("char-1", "OP13-089", "characterArea")],
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
              attachment: {
                donInstanceId: "don-2" as InstanceId,
                targetInstanceId: "leader-1" as InstanceId,
              },
            },
          ],
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
              effectText: "[On Play] Look at cards.",
              triggerText: "Draw 1 card.",
              imageUrl: "https://cdn.example/card.png",
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
    assert.equal(handCard.imageUrl, "https://cdn.example/card.png");
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
});
