import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { playInteractionSound } from "./interaction-sound-router.js";
import type { PresentationSoundIntent } from "./sound-planner.js";
import type { PresentationSoundOptions } from "./sound-controller.js";

describe("interaction sound router", () => {
  test("plays a planned interaction cue with caller sound options", () => {
    const calls: Array<{
      readonly intents: readonly PresentationSoundIntent[];
      readonly options: PresentationSoundOptions;
    }> = [];

    playInteractionSound({
      cue: "select",
      sourceKey: "card-1",
      enabled: true,
      volume: 0.08,
      play: (intents, options) => {
        calls.push({ intents, options });
      },
    });

    assert.deepEqual(calls, [
      {
        intents: [{ id: "sound:interaction:select:card-1", cue: "select" }],
        options: { enabled: true, volume: 0.08 },
      },
    ]);
  });
});
