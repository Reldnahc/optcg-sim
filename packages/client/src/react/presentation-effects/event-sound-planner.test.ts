import assert from "node:assert/strict";
import { describe, test } from "vitest";

import type { EngineEvent, PlayerId } from "@optcg/types";

import { planPresentationEventIntents } from "./event-presentation-intents.js";
import { planEventSoundIntents } from "./event-sound-planner.js";

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

describe("presentation event sound planner", () => {
  test("plans sounds for event-only gameplay cues", () => {
    assert.deepEqual(
      planEventSoundIntents({
        intents: planPresentationEventIntents({
          events: [
            event("event:reveal", "cardRevealed"),
            event("event:shuffle", "deckShuffled"),
            event("event:damage", "damageDealt"),
            event("event:trigger", "triggerActivated"),
          ],
          currentPlayerId: p1,
        }),
        movementEventIds: new Set(),
        currentPlayerId: p1,
      }),
      [
        { id: "sound:event:event:reveal", cue: "reveal" },
        { id: "sound:event:event:shuffle", cue: "shuffle" },
        { id: "sound:event:event:damage", cue: "damage" },
        { id: "sound:event:event:trigger", cue: "trigger" },
      ],
    );
  });

  test("does not duplicate sounds already produced by movement intents", () => {
    assert.deepEqual(
      planEventSoundIntents({
        intents: [{ eventId: "event:move", soundCue: "move" }],
        movementEventIds: new Set(["event:move"]),
        currentPlayerId: p1,
      }),
      [],
    );
  });

  test("plans attach and return sounds from DON events", () => {
    assert.deepEqual(
      planEventSoundIntents({
        intents: planPresentationEventIntents({
          events: [
            event("event:attach", "donAttached", {
              playerId: p1,
              donInstanceId: "don-1",
            }),
            event("event:return", "donReturned", {
              playerId: p1,
              donInstanceId: "don-1",
            }),
          ],
          currentPlayerId: p1,
        }),
        movementEventIds: new Set(),
        currentPlayerId: p1,
      }),
      [
        { id: "sound:event:event:attach", cue: "attach" },
        { id: "sound:event:event:return", cue: "return" },
      ],
    );
  });
});
