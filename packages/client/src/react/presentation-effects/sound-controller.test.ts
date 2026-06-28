import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { playPresentationSoundIntents } from "./sound-controller.js";
import type { PresentationSoundCue } from "./sound-planner.js";

const assetUrls: Partial<Record<PresentationSoundCue, string>> = {
  attach: "/sounds/move.wav",
  counter: "/sounds/play.wav",
  damage: "/sounds/trash.wav",
  draw: "/sounds/draw.wav",
  ko: "/sounds/trash.wav",
  move: "/sounds/move.wav",
  play: "/sounds/play.wav",
  rest: "/sounds/move.wav",
  return: "/sounds/move.wav",
  reveal: "/sounds/draw.wav",
  shuffle: "/sounds/move.wav",
  trash: "/sounds/trash.wav",
  trigger: "/sounds/play.wav",
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

  test("caps one playback batch so stacked cues cannot all fire at once", () => {
    const played: string[] = [];

    playPresentationSoundIntents(
      [
        { id: "sound-controller-cap-1", cue: "draw" },
        { id: "sound-controller-cap-2", cue: "play" },
        { id: "sound-controller-cap-3", cue: "trash" },
        { id: "sound-controller-cap-4", cue: "move" },
      ],
      {
        assetUrls,
        audioFactory: (url) => ({
          volume: 1,
          currentTime: 0,
          play: () => {
            played.push(url);
          },
        }),
      },
    );

    assert.deepEqual(played, [
      "/sounds/draw.wav",
      "/sounds/play.wav",
      "/sounds/trash.wav",
    ]);
  });
});
