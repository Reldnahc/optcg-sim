import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { playPresentationSoundIntents } from "./sound-controller.js";
import type { PresentationSoundCue } from "./sound-planner.js";

const assetUrls: Record<PresentationSoundCue, string> = {
  draw: "/sounds/draw.wav",
  move: "/sounds/move.wav",
  play: "/sounds/play.wav",
  trash: "/sounds/trash.wav",
};

describe("presentation sound controller", () => {
  test("plays configured asset files for sound cues", () => {
    const played: Array<{ url: string; volume: number }> = [];

    playPresentationSoundIntents(
      [{ id: "sound-controller-asset-test", cue: "draw" }],
      {
        assetUrls,
        audioFactory: (url) => ({
          set volume(value) {
            played.push({ url, volume: value });
          },
          get volume() {
            return played.at(-1)?.volume ?? 1;
          },
          currentTime: 12,
          play: () => undefined,
        }),
      },
    );

    assert.deepEqual(played, [{ url: "/sounds/draw.wav", volume: 0.16 }]);
  });
});
