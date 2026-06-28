import assert from "node:assert/strict";

import { describe, test } from "vitest";

import {
  boardCardClickInteractionCue,
  matchPresentationSoundOptions,
} from "./match-app-interaction-sound.js";

describe("MatchApp interaction sound decisions", () => {
  test("treats normal board card focus as a valid selection sound", () => {
    assert.equal(
      boardCardClickInteractionCue({ actionInFlight: false }),
      "select",
    );
  });

  test("uses invalid click only when the app is not accepting card clicks", () => {
    assert.equal(
      boardCardClickInteractionCue({ actionInFlight: true }),
      "invalidClick",
    );
  });

  test("maps persisted sound volume to presentation controller options", () => {
    assert.deepEqual(matchPresentationSoundOptions(0), {
      enabled: false,
      volume: 0,
    });
    assert.deepEqual(matchPresentationSoundOptions(50), {
      enabled: true,
      volume: 0.08,
    });
  });
});
