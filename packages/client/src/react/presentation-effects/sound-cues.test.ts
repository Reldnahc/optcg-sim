import assert from "node:assert/strict";
import { describe, test } from "vitest";

import {
  allPresentationSoundCues,
  presentationSoundCueProfiles,
} from "./sound-cues.js";

describe("presentation sound cues", () => {
  test("declares a profile for every sound cue", () => {
    assert.deepEqual(
      Object.keys(presentationSoundCueProfiles).sort(),
      [...allPresentationSoundCues].sort(),
    );
  });

  test("attention cues outrank movement cues", () => {
    assert.ok(
      presentationSoundCueProfiles.attention.priority >
        presentationSoundCueProfiles.move.priority,
    );
    assert.ok(
      presentationSoundCueProfiles.yourTurn.priority >
        presentationSoundCueProfiles.move.priority,
    );
  });

  test("frequent movement cues have pitch variation and cooldowns", () => {
    for (const cue of ["move", "attach", "rest", "draw"] as const) {
      const profile = presentationSoundCueProfiles[cue];
      assert.ok(profile.playbackRateJitter > 0);
      assert.ok(profile.minimumIntervalMs > 0);
    }
  });
});
