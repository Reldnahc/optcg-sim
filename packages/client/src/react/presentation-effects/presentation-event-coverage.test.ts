import assert from "node:assert/strict";
import { describe, test } from "vitest";

import type { EngineEvent, PlayerId } from "@optcg/types";

import { planPresentationEventIntents } from "./event-presentation-intents.js";
import { planEventSoundIntents } from "./event-sound-planner.js";
import {
  planCardMovementIntents,
  type PresentationSnapshot,
} from "./movement-planner.js";

const p1 = "p1" as PlayerId;
const p2 = "p2" as PlayerId;

const rect = (
  x: number,
  y: number,
  width = 100,
  height = 140,
): DOMRectReadOnly => {
  return {
    bottom: y + height,
    height,
    left: x,
    right: x + width,
    toJSON: () => ({}),
    top: y,
    width,
    x,
    y,
  };
};

const snapshot = (
  partial: Partial<PresentationSnapshot>,
): PresentationSnapshot => ({
  cards: {},
  zones: {},
  ...partial,
});

const visibleEvent = (type: EngineEvent["type"]): EngineEvent =>
  ({
    id: `event:${type}`,
    seq: 1,
    type,
    payload: {},
    visibility: { type: "public" },
    createdAtStateSeq: 1,
  }) as EngineEvent;

describe("presentation event coverage", () => {
  test("all presentation-relevant non-movement event types have sound coverage", () => {
    const coveredTypes: readonly EngineEvent["type"][] = [
      "cardRevealed",
      "cardRested",
      "deckShuffled",
      "donAttached",
      "donReturned",
      "counterUsed",
      "damageDealt",
      "lifeTaken",
      "triggerActivated",
      "cardKOd",
    ];

    const planned = planEventSoundIntents({
      intents: planPresentationEventIntents({
        events: coveredTypes.map(visibleEvent),
        currentPlayerId: p1,
      }),
      movementEventIds: new Set(),
      currentPlayerId: p1,
    });

    assert.deepEqual(
      planned.map((intent) => intent.id),
      coveredTypes.map((type) => `sound:event:event:${type}`),
    );
  });

  test("aggregate movement route coverage does not require card identity", () => {
    const movements = planCardMovementIntents({
      previous: snapshot({
        zones: {
          "opponent:deck": { zoneKey: "opponent:deck", rect: rect(500, 40) },
          "opponent:hand": { zoneKey: "opponent:hand", rect: rect(40, 40) },
        },
      }),
      current: snapshot({
        zones: {
          "opponent:deck": { zoneKey: "opponent:deck", rect: rect(500, 40) },
          "opponent:hand": { zoneKey: "opponent:hand", rect: rect(40, 40) },
        },
      }),
      events: [
        {
          ...visibleEvent("cardMoved"),
          payload: {
            from: "deck",
            to: "hand",
            playerId: p2,
            reason: "draw",
          },
        },
      ],
      currentPlayerId: p1,
    });

    assert.equal(movements.length, 1);
    const movement = movements[0];
    assert.ok(movement);
    assert.equal(movement.fromZoneKey, "opponent:deck");
    assert.equal(movement.toZoneKey, "opponent:hand");
  });
});
