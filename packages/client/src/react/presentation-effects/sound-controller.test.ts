import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { playPresentationSoundIntents } from "./sound-controller.js";
import { allPresentationSoundCues } from "./sound-cues.js";
import { presentationSoundAssetUrls } from "./sound-assets.js";

const fakeAudioContext = (
  calls: string[],
  decodeAudioData?: (data: ArrayBuffer) => Promise<AudioBuffer>,
) =>
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
    decodeAudioData,
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
      audioFactory: () => {
        calls.push("audioFactory");
        return undefined;
      },
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
    assert.equal(calls.includes("audioFactory"), false);
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

  test("loads default Web Audio buffers asynchronously and reuses cached buffers", async () => {
    const calls: string[] = [];
    const played: string[] = [];
    const decodedBuffer = { decoded: true };
    const previousFetch = globalThis.fetch;
    const audioContext = fakeAudioContext(calls, (data) => {
      calls.push(`decode:${String(data.byteLength)}`);
      return Promise.resolve(decodedBuffer as unknown as AudioBuffer);
    });
    const fakeFetch: typeof fetch = (url) => {
      const requestUrl =
        typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      calls.push(`fetch:${requestUrl}`);
      return Promise.resolve(new Response(new ArrayBuffer(4)));
    };

    globalThis.fetch = fakeFetch;

    try {
      playPresentationSoundIntents(
        [{ id: "default-loader-confirm-1", cue: "confirm" }],
        {
          assetUrls: { confirm: "/sounds/default-loader-confirm.wav" },
          audioContextFactory: () => audioContext,
          audioFactory: (url) => ({
            volume: 1,
            currentTime: 0,
            play: () => {
              played.push(url);
            },
          }),
          nowMs: () => 10_000,
          random: () => 0.5,
        },
      );

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });

      playPresentationSoundIntents(
        [{ id: "default-loader-confirm-2", cue: "confirm" }],
        {
          assetUrls: { confirm: "/sounds/default-loader-confirm.wav" },
          audioContextFactory: () => audioContext,
          audioFactory: (url) => ({
            volume: 1,
            currentTime: 0,
            play: () => {
              played.push(url);
            },
          }),
          nowMs: () => 11_000,
          random: () => 0.5,
        },
      );
    } finally {
      globalThis.fetch = previousFetch;
    }

    assert.deepEqual(played, ["/sounds/default-loader-confirm.wav"]);
    assert.equal(
      calls.filter(
        (entry) => entry === "fetch:/sounds/default-loader-confirm.wav",
      ).length,
      1,
    );
    assert.ok(calls.includes("decode:4"));
    assert.equal(
      calls.filter((entry) => entry.startsWith("source.start:")).length,
      1,
    );
  });

  test("swallows throwing Web Audio setup and still attempts the next cue", () => {
    const played: string[] = [];
    const audioContext = fakeAudioContext([]);

    assert.doesNotThrow(() => {
      playPresentationSoundIntents(
        [
          { id: "web-audio-throw-trigger", cue: "trigger" },
          { id: "web-audio-throw-select", cue: "select" },
        ],
        {
          assetUrls: {
            select: "/sounds/select-after-web-audio-throw.wav",
            trigger: "/sounds/throwing-web-audio.wav",
          },
          audioContextFactory: () => audioContext,
          audioFactory: (url) => ({
            volume: 1,
            currentTime: 0,
            play: () => {
              played.push(url);
            },
          }),
          bufferLoader: (cue) => {
            if (cue === "trigger") {
              throw new Error("web audio setup failed");
            }
            return { kind: "missing" };
          },
          nowMs: () => 20_000,
          random: () => 0.5,
        },
      );
    });

    assert.deepEqual(played, ["/sounds/select-after-web-audio-throw.wav"]);
  });

  test("swallows throwing HTML audio setup and playback paths", () => {
    assert.doesNotThrow(() => {
      playPresentationSoundIntents(
        [{ id: "html-audio-factory-throw", cue: "ko" }],
        {
          assetUrls: { ko: "/sounds/throwing-html-factory.wav" },
          audioContextFactory: () => undefined,
          audioFactory: () => {
            throw new Error("html audio factory failed");
          },
          nowMs: () => 21_000,
        },
      );
    });

    assert.doesNotThrow(() => {
      playPresentationSoundIntents(
        [{ id: "html-audio-play-throw", cue: "yourTurn" }],
        {
          assetUrls: { yourTurn: "/sounds/throwing-html-play.wav" },
          audioContextFactory: () => undefined,
          audioFactory: () => ({
            volume: 1,
            currentTime: 0,
            play: () => {
              throw new Error("html audio play failed");
            },
          }),
          nowMs: () => 22_000,
        },
      );
    });
  });
});
