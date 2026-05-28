import { strict as assert } from "node:assert";
import { describe, test } from "vitest";

import type {
  CardId,
  EngineEvent,
  EngineEventId,
  InstanceId,
  PlayerId,
  StateSeq,
} from "@optcg/types";

import { opponentRevealFromEvents } from "./reveal-viewer.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const revealEvent = (options: {
  revealId: string;
  cardOwner: PlayerId;
  visibility?: "public" | "private";
  seq?: number;
}): EngineEvent => ({
  id: `event:${options.revealId}` as EngineEventId,
  seq: options.seq ?? 1,
  type: "cardRevealed",
  payload: {
    revealId: options.revealId,
    cards: [
      {
        instanceId: `${options.revealId}:card` as InstanceId,
        cardId: `${options.revealId}:card-id` as CardId,
        playerId: options.cardOwner,
      },
    ],
    origin: "topOfDeck",
  },
  visibility:
    options.visibility === "private"
      ? { type: "private", playerId: options.cardOwner }
      : { type: "public" },
  createdAtStateSeq: 1 as StateSeq,
});

describe("reveal viewer", () => {
  test("creates an opponent-only reveal view from public reveal events", () => {
    const reveal = opponentRevealFromEvents(
      [revealEvent({ revealId: "search-selected", cardOwner: p1 })],
      p2,
      new Set(),
    );

    if (reveal === undefined) {
      throw new Error("Expected opponent reveal.");
    }
    assert.equal(reveal.revealId, "search-selected");
    assert.equal(reveal.cards[0]?.playerId, p1);
  });

  test("does not show a reveal window to the player who revealed the card", () => {
    const reveal = opponentRevealFromEvents(
      [revealEvent({ revealId: "own-search-selected", cardOwner: p1 })],
      p1,
      new Set(),
    );

    assert.equal(reveal, undefined);
  });

  test("does not reshow a closed reveal", () => {
    const reveal = opponentRevealFromEvents(
      [revealEvent({ revealId: "closed-reveal", cardOwner: p1 })],
      p2,
      new Set(["closed-reveal"]),
    );

    assert.equal(reveal, undefined);
  });

  test("ignores private reveal events and uses the newest public opponent reveal", () => {
    const reveal = opponentRevealFromEvents(
      [
        revealEvent({
          revealId: "private",
          cardOwner: p1,
          visibility: "private",
        }),
        revealEvent({ revealId: "older", cardOwner: p1, seq: 2 }),
        revealEvent({ revealId: "newer", cardOwner: p1, seq: 3 }),
      ],
      p2,
      new Set(),
    );

    assert.equal(reveal?.revealId, "newer");
  });
});
