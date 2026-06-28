import type {
  PresentationSoundCue,
  PresentationSoundIntent,
} from "./sound-planner.js";
import { presentationSoundAssetUrls } from "./sound-assets.js";
import { presentationSoundCueProfiles } from "./sound-cues.js";

export interface LoadedPresentationAudioBuffer {
  readonly kind: "loaded";
  readonly buffer: unknown;
}

export interface MissingPresentationAudioBuffer {
  readonly kind: "missing";
}

export type PresentationAudioBufferLoadResult =
  | LoadedPresentationAudioBuffer
  | MissingPresentationAudioBuffer;

export interface PresentationSoundOptions {
  enabled?: boolean;
  volume?: number;
  assetUrls?: Partial<Record<PresentationSoundCue, string>>;
  audioFactory?: PresentationAudioFactory;
  audioContextFactory?: () => AudioContext | undefined;
  bufferLoader?: (
    cue: PresentationSoundCue,
    url: string,
    context: AudioContext,
  ) => PresentationAudioBufferLoadResult;
  random?: () => number;
  nowMs?: () => number;
}

interface ResolvedPresentationSoundOptions {
  readonly enabled: boolean;
  readonly volume: number;
  readonly assetUrls: Partial<Record<PresentationSoundCue, string>>;
  readonly audioFactory: PresentationAudioFactory;
  readonly audioContextFactory: () => AudioContext | undefined;
  readonly bufferLoader: (
    cue: PresentationSoundCue,
    url: string,
    context: AudioContext,
  ) => PresentationAudioBufferLoadResult;
  readonly random: () => number;
  readonly nowMs: () => number;
}

type BrowserAudioContextConstructor = new () => AudioContext;

interface BrowserAudioContextWindow {
  AudioContext?: BrowserAudioContextConstructor;
  webkitAudioContext?: BrowserAudioContextConstructor;
}

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

export interface PresentationAudioElement {
  currentTime: number;
  volume: number;
  play: () => Promise<void> | void;
}

export type PresentationAudioFactory = (
  url: string,
) => PresentationAudioElement | undefined;

const audioConstructor = (): BrowserAudioContextConstructor | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }
  const constructors = window as unknown as BrowserAudioContextWindow;
  return constructors.AudioContext ?? constructors.webkitAudioContext;
};

const defaultAudioFactory: PresentationAudioFactory = (url) => {
  if (typeof Audio === "undefined") {
    return undefined;
  }
  return new Audio(url);
};

let sharedContext: AudioContext | undefined;
let lastPlayedIntentId: string | undefined;
const maxSoundIntentsPerBatch = 4;
const lastPlayedCueAtMs = new Map<PresentationSoundCue, number>();
const defaultAudioBufferCache = new Map<
  string,
  CachedPresentationAudioBuffer
>();

const defaultAudioBufferLoader = (
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

const defaultAudioContextFactory = (): AudioContext | undefined => {
  if (sharedContext !== undefined) {
    return sharedContext;
  }
  const AudioContextConstructor = audioConstructor();
  if (AudioContextConstructor === undefined) {
    return undefined;
  }
  sharedContext = new AudioContextConstructor();
  return sharedContext;
};

const orderedIntents = (
  intents: readonly PresentationSoundIntent[],
): PresentationSoundIntent[] =>
  [...intents]
    .sort(
      (left, right) =>
        presentationSoundCueProfiles[right.cue].priority -
        presentationSoundCueProfiles[left.cue].priority,
    )
    .slice(0, maxSoundIntentsPerBatch);

const allowedByCooldown = (
  cue: PresentationSoundCue,
  nowMs: number,
): boolean => {
  const profile = presentationSoundCueProfiles[cue];
  const previous = lastPlayedCueAtMs.get(cue);
  if (previous !== undefined && nowMs - previous < profile.minimumIntervalMs) {
    return false;
  }
  lastPlayedCueAtMs.set(cue, nowMs);
  return true;
};

const playbackRateForCue = (
  cue: PresentationSoundCue,
  random: () => number,
): number => {
  const jitter = presentationSoundCueProfiles[cue].playbackRateJitter;
  return 1 + (random() * 2 - 1) * jitter;
};

const playWebAudioCue = (
  cue: PresentationSoundCue,
  index: number,
  options: ResolvedPresentationSoundOptions,
): boolean => {
  const url = options.assetUrls[cue];
  if (url === undefined) {
    return false;
  }
  const audio = options.audioContextFactory();
  if (audio === undefined) {
    return false;
  }
  const loaded = options.bufferLoader(cue, url, audio);
  if (loaded.kind !== "loaded") {
    return false;
  }

  void audio.resume().catch(() => undefined);
  const profile = presentationSoundCueProfiles[cue];
  const source = audio.createBufferSource();
  const gain = audio.createGain();
  source.buffer = loaded.buffer as AudioBuffer;
  source.playbackRate.value = playbackRateForCue(cue, options.random);
  gain.gain.value = options.volume * profile.volume;
  source.connect(gain);
  gain.connect(audio.destination);
  source.start(audio.currentTime + (profile.burstSpacingMs * index) / 1000);
  return true;
};

const playAssetCue = (
  cue: PresentationSoundCue,
  options: ResolvedPresentationSoundOptions,
): boolean => {
  const url = options.assetUrls[cue];
  if (url === undefined) {
    return false;
  }
  const audio = options.audioFactory(url);
  if (audio === undefined) {
    return false;
  }
  audio.volume = options.volume * presentationSoundCueProfiles[cue].volume;
  audio.currentTime = 0;
  void Promise.resolve(audio.play()).catch(() => undefined);
  return true;
};

const playCue = (
  cue: PresentationSoundCue,
  index: number,
  options: ResolvedPresentationSoundOptions,
): void => {
  if (playWebAudioCue(cue, index, options)) {
    return;
  }
  playAssetCue(cue, options);
};

const playCueSafely = (
  cue: PresentationSoundCue,
  index: number,
  options: ResolvedPresentationSoundOptions,
): void => {
  try {
    playCue(cue, index, options);
  } catch {
    // Sound playback is decorative; failures must not affect gameplay.
  }
};

export const playPresentationSoundIntents = (
  intents: readonly PresentationSoundIntent[],
  options: PresentationSoundOptions = {},
): void => {
  const resolvedOptions: ResolvedPresentationSoundOptions = {
    enabled: options.enabled ?? true,
    volume: options.volume ?? 0.16,
    assetUrls: options.assetUrls ?? presentationSoundAssetUrls,
    audioFactory: options.audioFactory ?? defaultAudioFactory,
    audioContextFactory:
      options.audioContextFactory ?? defaultAudioContextFactory,
    bufferLoader: options.bufferLoader ?? defaultAudioBufferLoader,
    random: options.random ?? Math.random,
    nowMs: options.nowMs ?? Date.now,
  };
  if (!resolvedOptions.enabled) {
    return;
  }
  const nowMs = resolvedOptions.nowMs();
  for (const [index, intent] of orderedIntents(intents).entries()) {
    if (intent.id === lastPlayedIntentId) {
      continue;
    }
    lastPlayedIntentId = intent.id;
    if (!allowedByCooldown(intent.cue, nowMs)) {
      continue;
    }
    playCueSafely(intent.cue, index, resolvedOptions);
  }
};
