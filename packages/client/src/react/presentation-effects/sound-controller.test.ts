import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { playPresentationSoundIntents } from "./sound-controller.js";
import { allPresentationSoundCues } from "./sound-cues.js";
import { presentationSoundAssetUrls } from "./sound-assets.js";

const fakeAudioContext = (calls: string[]) =>
  ({
    currentTime: 0,
    destination: {},
    resume: () => {
      calls.push("resume");
      return Promise.resolve();
    },
    createBufferSource: () => {
      calls.push("createBufferSource");
      return {
        buffer: undefined,
        playbackRate: { value: 1 },
        connect: () => {
          calls.push("source.connect");
        },
        start: (time: number) => {
          calls.push(`source.start:${String(time)}`);
        },
      };
    },
    createGain: () => {
      calls.push("createGain");
      return {
        gain: { value: 1 },
        connect: () => {
          calls.push("gain.connect");
        },
      };
    },
  }) as unknown as AudioContext;

test("declares one asset URL for every cue", () => {
  assert.deepEqual(
    Object.keys(presentationSoundAssetUrls).sort(),
    [...allPresentationSoundCues].sort(),
  );

  for (const cue of allPresentationSoundCues) {
    assert.match(
      presentationSoundAssetUrls[cue],
      /\.wav(?:$|\?)/u,
      `${cue} must map to a WAV asset.`,
    );
  }
});

describe("presentation sound controller", () => {
  test("uses Web Audio buffers before HTML audio fallback", () => {
    const calls: string[] = [];
    const audioContext = fakeAudioContext(calls);

    playPresentationSoundIntents([{ id: "web-audio-draw", cue: "draw" }], {
      audioContextFactory: () => audioContext,
      bufferLoader: () => ({
        kind: "loaded",
        buffer: { cue: "draw" },
      }),
      nowMs: () => 1_000,
      random: () => 0.5,
    });

    assert.deepEqual(calls, [
      "resume",
      "createBufferSource",
      "createGain",
      "source.connect",
      "gain.connect",
      "source.start:0",
    ]);
  });

  test("falls back to HTML audio when Web Audio is unavailable", () => {
    const played: string[] = [];

    playPresentationSoundIntents([{ id: "fallback-draw", cue: "draw" }], {
      audioContextFactory: () => undefined,
      audioFactory: (url) => ({
        volume: 1,
        currentTime: 0,
        play: () => {
          played.push(url);
        },
      }),
    });

    assert.equal(played.length, 1);
  });

  test("applies cooldowns without suppressing a higher priority cue", () => {
    const played: string[] = [];
    const audioContext = fakeAudioContext(played);

    playPresentationSoundIntents(
      [
        { id: "move-1", cue: "move" },
        { id: "move-2", cue: "move" },
        { id: "attention-1", cue: "attention" },
      ],
      {
        audioContextFactory: () => audioContext,
        bufferLoader: () => ({ kind: "loaded", buffer: {} }),
        nowMs: () => 2_000,
        random: () => 0.5,
      },
    );

    assert.equal(
      played.filter((entry) => entry.startsWith("source.start:")).length,
      2,
    );
  });
});
