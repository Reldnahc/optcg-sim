import assert from "node:assert/strict";
import { describe, test } from "vitest";

import type { CardId, InstanceId } from "@optcg/types";

import type { ClientCardModel } from "../../view-model.js";
import type { CardMovementIntent } from "./movement-planner.js";
import { planSoundIntents } from "./sound-planner.js";

const card = (): ClientCardModel => ({
  instanceId: "card-1" as InstanceId,
  cardId: "OP00-001" as CardId,
  name: "Moving Card",
  category: "Character",
  attachedDonCount: 0,
  attachedDonCards: [],
});

const rect = (): DOMRectReadOnly => ({
  x: 0,
  y: 0,
  width: 50,
  height: 70,
  top: 0,
  right: 50,
  bottom: 70,
  left: 0,
  toJSON: () => ({}),
});

const movement = (
  overrides: Partial<CardMovementIntent> = {},
): CardMovementIntent => ({
  id: "move-1",
  instanceId: "card-1",
  card: card(),
  fromRect: rect(),
  toRect: rect(),
  fromZoneKey: "self:deck",
  toZoneKey: "self:hand",
  ...overrides,
});

describe("presentation sound planner", () => {
  test("maps deck to hand movement to a draw cue", () => {
    assert.deepEqual(planSoundIntents([movement()]), [
      { id: "sound:move-1", cue: "draw" },
    ]);
  });

  test("maps field to trash movement to a trash cue", () => {
    assert.deepEqual(
      planSoundIntents([
        movement({
          fromZoneKey: "self:characterArea",
          toZoneKey: "self:trash",
        }),
      ]),
      [{ id: "sound:move-1", cue: "trash" }],
    );
  });

  test("maps hand to field movement to a play cue", () => {
    assert.deepEqual(
      planSoundIntents([
        movement({
          fromZoneKey: "self:hand",
          toZoneKey: "self:characterArea",
        }),
      ]),
      [{ id: "sound:move-1", cue: "play" }],
    );
  });

  test("falls back to generic movement for known but uncategorized movement", () => {
    assert.deepEqual(
      planSoundIntents([
        movement({
          fromZoneKey: "self:life",
          toZoneKey: "self:hand",
        }),
      ]),
      [{ id: "sound:move-1", cue: "move" }],
    );
  });

  test("coalesces simultaneous DON attachment movements into one movement cue", () => {
    assert.deepEqual(
      planSoundIntents([
        movement({
          id: "attach-don-1",
          fromZoneKey: "self:costArea",
          toZoneKey: "self:leaderArea",
        }),
        movement({
          id: "attach-don-2",
          fromZoneKey: "self:costArea",
          toZoneKey: "self:leaderArea",
        }),
        movement({
          id: "attach-don-3",
          fromZoneKey: "self:costArea",
          toZoneKey: "self:leaderArea",
        }),
      ]),
      [{ id: "sound:movement-burst:move", cue: "move" }],
    );
  });

  test("uses one trash cue when a trashed character also moves attached DON", () => {
    assert.deepEqual(
      planSoundIntents([
        movement({
          id: "character-trash",
          fromZoneKey: "self:characterArea",
          toZoneKey: "self:trash",
        }),
        movement({
          id: "attached-don-1",
          fromZoneKey: "self:characterArea",
          toZoneKey: "self:costArea",
        }),
        movement({
          id: "attached-don-2",
          fromZoneKey: "self:characterArea",
          toZoneKey: "self:costArea",
        }),
      ]),
      [{ id: "sound:movement-burst:trash", cue: "trash" }],
    );
  });
});
