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
const revealId = "reveal:search-reveal:selected:choice-1";
const cardRef = {
  instanceId: "revealed-card-1" as InstanceId,
  cardId: "OP13-089" as CardId,
  playerId: p1,
};

const revealEvent = (): EngineEvent => ({
  id: "event:search-reveal" as EngineEventId,
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
});
