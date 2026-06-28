import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { planAttentionSoundIntent } from "./attention-sound-planner.js";

describe("attention sound planner", () => {
  test("plays yourTurn when local player newly becomes active and focused", () => {
    assert.deepEqual(
      planAttentionSoundIntent({
        previousLocalActive: false,
        currentLocalActive: true,
        documentHidden: false,
        windowFocused: true,
        activationKey: "turn:3",
      }),
      [{ id: "sound:attention:turn:3", cue: "yourTurn" }],
    );
  });

  test("plays attention when local player newly becomes active while hidden", () => {
    assert.deepEqual(
      planAttentionSoundIntent({
        previousLocalActive: false,
        currentLocalActive: true,
        documentHidden: true,
        windowFocused: true,
        activationKey: "decision:abc",
      }),
      [{ id: "sound:attention:decision:abc", cue: "attention" }],
    );
  });

  test("does not replay while already active", () => {
    assert.deepEqual(
      planAttentionSoundIntent({
        previousLocalActive: true,
        currentLocalActive: true,
        documentHidden: false,
        windowFocused: true,
        activationKey: "turn:3",
      }),
      [],
    );
  });
});
