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

const revealFromHandCostEvent = (): EngineEvent => ({
  id: "event:reveal-from-hand-cost" as EngineEventId,
  seq: 1,
  type: "cardRevealed",
  payload: {
    revealId: "reveal:reveal-from-hand:decision-1",
    cards: [cardRef],
    origin: "hand",
    reason: "revealFromHandCost",
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
  test("opens selected search reveal events for the opponent without an active reveal record", () => {
    const eventOnlyWindows = opponentRevealWindowsFromState({
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

    assert.equal(eventOnlyWindows.length, 1);
    const eventWindow = eventOnlyWindows[0];
    if (eventWindow === undefined) {
      throw new Error("Expected selected reveal event window.");
    }
    assert.equal(eventWindow.revealId, revealId);
    assert.equal(eventWindow.model.title, "Opponent revealed");
    assert.equal(activeWindows.length, 1);
    assert.equal(activeWindows[0]?.revealId, revealId);
  });

  test("does not reopen a selected search reveal record for the player who chose it", () => {
    const ownerWindows = opponentRevealWindowsFromState({
      currentPlayerId: p1,
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
    const opponentWindows = opponentRevealWindowsFromState({
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

    assert.deepEqual(ownerWindows, []);
    assert.equal(opponentWindows.length, 1);
    assert.equal(opponentWindows[0]?.revealId, revealId);
  });

  test("opens reveal-from-hand cost events for the opponent only", () => {
    const opponentWindows = opponentRevealWindowsFromState({
      currentPlayerId: p2,
      playerSnapshot: {
        view: {
          events: [revealFromHandCostEvent()],
          revealedCards: [],
        } as unknown as PlayerView,
        actions: [],
      },
      matchScope,
      revealWindowState: {
        scope: matchScope,
        dismissed: new Set(),
        minimized: new Set(),
      },
      activeDismissedRevealIds: new Set(),
      cardModel,
    });
    const ownerWindows = opponentRevealWindowsFromState({
      currentPlayerId: p1,
      playerSnapshot: {
        view: {
          events: [revealFromHandCostEvent()],
          revealedCards: [],
        } as unknown as PlayerView,
        actions: [],
      },
      matchScope,
      revealWindowState: {
        scope: matchScope,
        dismissed: new Set(),
        minimized: new Set(),
      },
      activeDismissedRevealIds: new Set(),
      cardModel,
    });

    assert.equal(opponentWindows.length, 1);
    const opponentWindow = opponentWindows[0];
    if (opponentWindow === undefined) {
      throw new Error("Expected reveal-from-hand cost window.");
    }
    assert.equal(opponentWindow.revealId, "reveal:reveal-from-hand:decision-1");
    assert.equal(opponentWindow.model.title, "Opponent revealed");
    assert.deepEqual(ownerWindows, []);
  });

  test("does not open floating windows for private looked deck records", () => {
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

  test("keeps active life trigger reveals visible even after dismissal", () => {
    const triggerRevealId = "reveal:life-trigger:trigger-card-1:12";
    const snapshot: ClientPlayerSnapshot = {
      view: {
        events: [],
        revealedCards: [
          {
            id: triggerRevealId,
            cards: [cardRef],
            visibility: "public",
            origin: "lifeDamage",
            cleanupPolicy: "trashAfterResolution",
            createdAtStateSeq: 12 as StateSeq,
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
      activeDismissedRevealIds: new Set([triggerRevealId]),
      cardModel,
    });

    assert.equal(windows.length, 1);
    assert.equal(windows[0]?.revealId, triggerRevealId);
    assert.equal(windows[0].model.title, "Revealed");
  });
});
