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

import {
  opponentRevealFromEvents,
  opponentRevealsFromEvents,
} from "./reveal-viewer.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const revealEvent = (options: {
  revealId?: string;
  cardOwner: PlayerId;
  origin?: string | { zone: "life"; playerId: PlayerId };
  visibility?: "public" | "private";
  seq?: number;
}): EngineEvent => ({
  id: `event:${options.revealId ?? "no-reveal-id"}` as EngineEventId,
  seq: options.seq ?? 1,
  type: "cardRevealed",
  payload: {
    ...(options.revealId === undefined ? {} : { revealId: options.revealId }),
    cards: [
      {
        instanceId: `${options.revealId ?? "no-reveal-id"}:card` as InstanceId,
        cardId: `${options.revealId ?? "no-reveal-id"}:card-id` as CardId,
        playerId: options.cardOwner,
      },
    ],
    origin: options.origin ?? "topOfDeck",
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
      [
        revealEvent({
          revealId: "reveal:search-reveal:selected:choice-1",
          cardOwner: p1,
        }),
      ],
      p2,
      new Set(),
    );

    if (reveal === undefined) {
      throw new Error("Expected opponent reveal.");
    }
    assert.equal(reveal.revealId, "reveal:search-reveal:selected:choice-1");
    assert.equal(reveal.title, "Opponent revealed");
    assert.equal(reveal.cards[0]?.playerId, p1);
  });

  test("does not show a reveal window to the player who revealed the card", () => {
    const reveal = opponentRevealFromEvents(
      [
        revealEvent({
          revealId: "reveal:search-reveal:selected:own-choice",
          cardOwner: p1,
        }),
      ],
      p1,
      new Set(),
    );

    assert.equal(reveal, undefined);
  });

  test("shows public Life reveal windows to both players", () => {
    const event = revealEvent({
      revealId: "reveal:sequence:life-reaction:0",
      cardOwner: p1,
      origin: { zone: "life", playerId: p1 },
    });

    const ownerReveal = opponentRevealFromEvents([event], p1, new Set());
    const opponentReveal = opponentRevealFromEvents([event], p2, new Set());

    if (ownerReveal === undefined || opponentReveal === undefined) {
      throw new Error("Expected both players to see the Life reveal.");
    }
    assert.equal(ownerReveal.revealId, "reveal:sequence:life-reaction:0");
    assert.equal(opponentReveal.revealId, "reveal:sequence:life-reaction:0");
    assert.equal(ownerReveal.title, "Revealed");
    assert.equal(opponentReveal.title, "Revealed");
    assert.equal(ownerReveal.cards[0]?.cardId, opponentReveal.cards[0]?.cardId);
  });

  test("does not reshow a closed reveal", () => {
    const reveal = opponentRevealFromEvents(
      [
        revealEvent({
          revealId: "reveal:search-reveal:selected:closed-reveal",
          cardOwner: p1,
        }),
      ],
      p2,
      new Set(["reveal:search-reveal:selected:closed-reveal"]),
    );

    assert.equal(reveal, undefined);
  });

  test("does not open for ordinary public card reveals", () => {
    const reveal = opponentRevealFromEvents(
      [
        revealEvent({
          revealId: "reveal:life-trigger:damage:1",
          cardOwner: p1,
          origin: "lifeDamage",
        }),
        revealEvent({ cardOwner: p1, seq: 2 }),
      ],
      p2,
      new Set(),
    );

    assert.equal(reveal, undefined);
  });

  test("ignores non-search reveals and uses the newest search-selected reveal", () => {
    const reveal = opponentRevealFromEvents(
      [
        revealEvent({
          revealId: "reveal:search-reveal:selected:private",
          cardOwner: p1,
          visibility: "private",
        }),
        revealEvent({
          revealId: "reveal:life-trigger:damage:1",
          cardOwner: p1,
          origin: "lifeDamage",
          seq: 2,
        }),
        revealEvent({ cardOwner: p1, seq: 3 }),
        revealEvent({
          revealId: "reveal:search-reveal:selected:older",
          cardOwner: p1,
          seq: 4,
        }),
        revealEvent({
          revealId: "reveal:search-reveal:selected:newer",
          cardOwner: p1,
          seq: 5,
        }),
      ],
      p2,
      new Set(),
    );

    assert.equal(reveal?.revealId, "reveal:search-reveal:selected:newer");
  });

  test("returns every active search reveal instead of replacing older reveal windows", () => {
    const reveals = opponentRevealsFromEvents(
      [
        revealEvent({
          revealId: "reveal:search-reveal:selected:first",
          cardOwner: p1,
          seq: 1,
        }),
        revealEvent({
          revealId: "reveal:search-reveal:selected:second",
          cardOwner: p1,
          seq: 2,
        }),
      ],
      p2,
      new Set(),
    );

    assert.deepEqual(
      reveals.map((reveal) => reveal.revealId),
      [
        "reveal:search-reveal:selected:first",
        "reveal:search-reveal:selected:second",
      ],
    );
  });
});
