import type { PresentationSoundCue } from "./react/presentation-effects/sound-planner.js";
import type { PresentationAudioBufferLoadResult } from "./react/presentation-effects/sound-controller.js";

type CachedPresentationAudioBuffer =
  | {
      readonly status: "loaded";
      readonly buffer: AudioBuffer;
    }
  | {
      readonly status: "pending";
    }
  | {
      readonly status: "failed";
    };

const defaultAudioBufferCache = new Map<
  string,
  CachedPresentationAudioBuffer
>();

export const defaultAudioBufferLoader = (
  _cue: PresentationSoundCue,
  url: string,
  context: AudioContext,
): PresentationAudioBufferLoadResult => {
  const cached = defaultAudioBufferCache.get(url);
  if (cached?.status === "loaded") {
    return {
      kind: "loaded",
      buffer: cached.buffer,
    };
  }
  if (cached !== undefined) {
    return {
      kind: "missing",
    };
  }
  if (typeof fetch === "undefined") {
    return {
      kind: "missing",
    };
  }

  defaultAudioBufferCache.set(url, { status: "pending" });
  void fetch(url)
    .then((response) => {
      if (!response.ok) {
        defaultAudioBufferCache.set(url, { status: "failed" });
        return undefined;
      }
      return response.arrayBuffer();
    })
    .then((encodedAudio) => {
      if (encodedAudio === undefined) {
        return undefined;
      }
      return context.decodeAudioData(encodedAudio);
    })
    .then((buffer) => {
      if (buffer !== undefined) {
        defaultAudioBufferCache.set(url, {
          status: "loaded",
          buffer,
        });
      }
    })
    .catch(() => {
      defaultAudioBufferCache.set(url, { status: "failed" });
    });

  return {
    kind: "missing",
  };
};
