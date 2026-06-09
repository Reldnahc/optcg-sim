import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type {
  CardId,
  EngineEvent,
  EngineEventId,
  InstanceId,
  PlayerId,
  PlayerView,
  StateSeq,
} from "@optcg/types";

import type { ClientPlayerSnapshot } from "../transport.js";
import type { MatchCardCatalog } from "../transport.js";
import { cardModelFromCatalog } from "./card-model.js";
import type { ClientCardModel } from "../view-model.js";
import { opponentRevealWindowsFromState } from "./opponent-reveal-windows.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;
const matchScope = "match-1";
const revealId = "reveal:sequence-selected:choice-1";
const cardRef = {
  instanceId: "revealed-card-1" as InstanceId,
  cardId: "OP13-089" as CardId,
  playerId: p1,
};

const revealEvent = (): EngineEvent => ({
  id: "event:selected-reveal" as EngineEventId,
  seq: 1,
  type: "cardRevealed",
  payload: {
    revealId,
    cards: [cardRef],
  },
  visibility: { type: "public" },
  createdAtStateSeq: 1 as StateSeq,
});

const cardModel = (card: typeof cardRef): ClientCardModel => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  category: "Character",
  name: "Revealed card",
  attachedDonCount: 0,
  attachedDonCards: [],
});

const snapshotWithActiveReveal = (active: boolean): ClientPlayerSnapshot => ({
  view: {
    events: [revealEvent()],
    revealedCards: active
      ? [
          {
            id: revealId,
            cards: [cardRef],
            visibility: "public",
            origin: "topOfDeck",
            cleanupPolicy: "none",
            createdAtStateSeq: 1 as StateSeq,
          },
        ]
      : [],
  } as unknown as PlayerView,
  actions: [],
});

describe("opponent reveal windows", () => {
  test("uses active reveal records for windows while preserving historical events for logs", () => {
    const inactiveWindows = opponentRevealWindowsFromState({
      currentPlayerId: p2,
      playerSnapshot: snapshotWithActiveReveal(false),
      matchScope,
      revealWindowState: {
        scope: matchScope,
        dismissed: new Set(),
        minimized: new Set(),
      },
      activeDismissedRevealIds: new Set(),
      cardModel,
    });
    const activeWindows = opponentRevealWindowsFromState({
      currentPlayerId: p2,
      playerSnapshot: snapshotWithActiveReveal(true),
      matchScope,
      revealWindowState: {
        scope: matchScope,
        dismissed: new Set(),
        minimized: new Set(),
      },
      activeDismissedRevealIds: new Set(),
      cardModel,
    });

    assert.deepEqual(inactiveWindows, []);
    assert.equal(activeWindows.length, 1);
    assert.equal(activeWindows[0]?.revealId, revealId);
  });

  test("opens a window from private active reveal records without requiring a public event", () => {
    const snapshot: ClientPlayerSnapshot = {
      view: {
        events: [],
        revealedCards: [
          {
            id: "reveal:sequence:look-at-top:0",
            cards: [cardRef],
            visibility: "privateToRecipient",
            origin: "topOfDeck",
            cleanupPolicy: "returnToOrigin",
            createdAtStateSeq: 1 as StateSeq,
          },
        ],
      } as unknown as PlayerView,
      actions: [],
    };

    const windows = opponentRevealWindowsFromState({
      currentPlayerId: p1,
      playerSnapshot: snapshot,
      matchScope,
      revealWindowState: {
        scope: matchScope,
        dismissed: new Set(),
        minimized: new Set(),
      },
      activeDismissedRevealIds: new Set(),
      cardModel,
    });

    assert.equal(windows.length, 1);
    const window = windows[0];
    if (window === undefined) {
      throw new Error("Expected private reveal window.");
    }
    assert.equal(window.revealId, "reveal:sequence:look-at-top:0");
    assert.deepEqual(
      window.model.cards.map((card) => card.instanceId),
      [cardRef.instanceId],
    );
  });

  test("maps active reveal cards through the current card catalog for images", () => {
    const snapshot: ClientPlayerSnapshot = {
      view: {
        events: [],
        revealedCards: [
          {
            id: "reveal:sequence:look-at-top:0",
            cards: [cardRef],
            visibility: "privateToRecipient",
            origin: "topOfDeck",
            cleanupPolicy: "returnToOrigin",
            createdAtStateSeq: 1 as StateSeq,
          },
        ],
      } as unknown as PlayerView,
      actions: [],
    };
    const catalog: MatchCardCatalog = {
      players: {
        [p1]: {
          cards: {
            [cardRef.cardId]: {
              cardId: cardRef.cardId,
              name: "Catalog revealed card",
              category: "Character",
              imageUrl: "https://cdn.example.test/revealed-card.webp",
            },
          },
        },
      },
    };

    const windows = opponentRevealWindowsFromState({
      currentPlayerId: p1,
      playerSnapshot: snapshot,
      matchScope,
      revealWindowState: {
        scope: matchScope,
        dismissed: new Set(),
        minimized: new Set(),
      },
      activeDismissedRevealIds: new Set(),
      cardModel: (card) => cardModelFromCatalog(catalog, card),
    });

    assert.equal(windows.length, 1);
    assert.equal(
      windows[0]?.model.cards[0]?.imageUrl,
      "https://cdn.example.test/revealed-card.webp",
    );
  });

  test("opens a current selected reveal event without a persistent reveal record", () => {
    const snapshot: ClientPlayerSnapshot = {
      view: {
        stateSeq: 1 as StateSeq,
        events: [revealEvent()],
        revealedCards: [],
      } as unknown as PlayerView,
      actions: [],
    };

    const windows = opponentRevealWindowsFromState({
      currentPlayerId: p2,
      playerSnapshot: snapshot,
      matchScope,
      revealWindowState: {
        scope: matchScope,
        dismissed: new Set(),
        minimized: new Set(),
      },
      activeDismissedRevealIds: new Set(),
      cardModel,
    });

    assert.equal(windows.length, 1);
    assert.equal(windows[0]?.revealId, revealId);
  });

  test("does not reopen older event-only selected reveal windows", () => {
    const snapshot: ClientPlayerSnapshot = {
      view: {
        stateSeq: 2 as StateSeq,
        events: [revealEvent()],
        revealedCards: [],
      } as unknown as PlayerView,
      actions: [],
    };

    const windows = opponentRevealWindowsFromState({
      currentPlayerId: p2,
      playerSnapshot: snapshot,
      matchScope,
      revealWindowState: {
        scope: matchScope,
        dismissed: new Set(),
        minimized: new Set(),
      },
      activeDismissedRevealIds: new Set(),
      cardModel,
    });

    assert.deepEqual(windows, []);
  });

  test("does not open floating reveal windows for setup candidate records", () => {
    const snapshot: ClientPlayerSnapshot = {
      view: {
        events: [],
        revealedCards: [
          {
            id: "reveal:setup-start-of-game:decision-1",
            cards: [cardRef],
            visibility: "privateToRecipient",
            origin: "topOfDeck",
            cleanupPolicy: "none",
            createdAtStateSeq: 1 as StateSeq,
          },
        ],
      } as unknown as PlayerView,
      actions: [],
    };

    const windows = opponentRevealWindowsFromState({
      currentPlayerId: p1,
      playerSnapshot: snapshot,
      matchScope,
      revealWindowState: {
        scope: matchScope,
        dismissed: new Set(),
        minimized: new Set(),
      },
      activeDismissedRevealIds: new Set(),
      cardModel,
    });

    assert.deepEqual(windows, []);
  });
});
