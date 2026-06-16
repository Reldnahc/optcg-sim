import assert from "node:assert/strict";
import { describe, test } from "vitest";

import type { EngineEvent, PlayerId } from "@optcg/types";

import { planPresentationEventIntents } from "./event-presentation-intents.js";

const p1 = "p1" as PlayerId;

const event = (
  id: string,
  type: EngineEvent["type"],
  payload: unknown = {},
): EngineEvent =>
  ({
    id,
    seq: 1,
    type,
    payload,
    visibility: { type: "public" },
    createdAtStateSeq: 1,
  }) as EngineEvent;

describe("presentation event intent planner", () => {
  test("classifies canonical event sounds once for downstream planners", () => {
    assert.deepEqual(
      planPresentationEventIntents({
        events: [
          event("event:reveal", "cardRevealed"),
          event("event:shuffle", "deckShuffled"),
          event("event:damage", "damageDealt"),
          event("event:trigger", "triggerActivated"),
        ],
        currentPlayerId: p1,
      }),
      [
        { eventId: "event:reveal", soundCue: "reveal" },
        { eventId: "event:shuffle", soundCue: "shuffle" },
        { eventId: "event:damage", soundCue: "damage" },
        { eventId: "event:trigger", soundCue: "trigger" },
      ],
    );
  });

  test("normalizes DON attachment route data for downstream movement planners", () => {
    assert.deepEqual(
      planPresentationEventIntents({
        events: [
          event("event:attach", "donAttached", {
            playerId: p1,
            donInstanceId: "don-1",
            from: { zone: "costArea", playerId: p1 },
            to: { zone: "leaderArea", playerId: p1 },
          }),
        ],
        currentPlayerId: p1,
      }),
      [
        {
          eventId: "event:attach",
          soundCue: "attach",
          movementRoute: {
            instanceId: "don-1",
            category: "don",
            fromZoneKey: "self:costArea",
            toZoneKey: "self:leaderArea",
          },
        },
      ],
    );
  });
});
