import type {
  PresentationSoundCue,
  PresentationSoundIntent,
} from "./sound-planner.js";
import { presentationSoundAssetUrls } from "./sound-assets.js";

export interface PresentationSoundOptions {
  enabled?: boolean;
  volume?: number;
  assetUrls?: Partial<Record<PresentationSoundCue, string>>;
  audioFactory?: PresentationAudioFactory;
}

type BrowserAudioContext = AudioContext & {
  resume: () => Promise<void>;
};

export interface PresentationAudioElement {
  currentTime: number;
  volume: number;
  play: () => Promise<void> | void;
}

export type PresentationAudioFactory = (
  url: string,
) => PresentationAudioElement | undefined;

const audioConstructor = (): (new () => BrowserAudioContext) | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }
  const constructors = window as unknown as {
    AudioContext?: new () => BrowserAudioContext;
    webkitAudioContext?: new () => BrowserAudioContext;
  };
  return constructors.AudioContext ?? constructors.webkitAudioContext;
};

const defaultAudioFactory: PresentationAudioFactory = (url) => {
  if (typeof Audio === "undefined") {
    return undefined;
  }
  return new Audio(url);
};

let sharedContext: BrowserAudioContext | undefined;
let lastPlayedIntentId: string | undefined;
const maxSoundIntentsPerBatch = 3;

const context = (): BrowserAudioContext | undefined => {
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

const cueFrequency = (cue: PresentationSoundCue): number => {
  switch (cue) {
    case "attention":
      return 880;
    case "yourTurn":
      return 740;
    case "confirm":
      return 720;
    case "draw":
    case "reveal":
      return 660;
    case "select":
      return 620;
    case "play":
    case "trigger":
    case "counter":
      return 440;
    case "emptyClick":
      return 300;
    case "trash":
    case "ko":
    case "damage":
    case "invalidClick":
      return 180;
    case "attach":
    case "return":
    case "rest":
    case "shuffle":
    case "move":
      return 330;
  }
};

const playAssetCue = (
  cue: PresentationSoundCue,
  options: Required<PresentationSoundOptions>,
): boolean => {
  const url = options.assetUrls[cue];
  if (url === undefined) {
    return false;
  }
  const audio = options.audioFactory(url);
  if (audio === undefined) {
    return false;
  }
  audio.volume = options.volume;
  audio.currentTime = 0;
  void Promise.resolve(audio.play()).catch(() => undefined);
  return true;
};

const playCue = (
  cue: PresentationSoundCue,
  options: Required<PresentationSoundOptions>,
): void => {
  if (playAssetCue(cue, options)) {
    return;
  }
  const audio = context();
  if (audio === undefined) {
    return;
  }
  void audio.resume().catch(() => undefined);
  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = cue === "trash" ? "sawtooth" : "triangle";
  oscillator.frequency.setValueAtTime(cueFrequency(cue), now);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(80, cueFrequency(cue) * 0.72),
    now + 0.08,
  );
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(options.volume, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.12);
};

export const playPresentationSoundIntents = (
  intents: readonly PresentationSoundIntent[],
  options: PresentationSoundOptions = {},
): void => {
  const resolvedOptions: Required<PresentationSoundOptions> = {
    enabled: options.enabled ?? true,
    volume: options.volume ?? 0.16,
    assetUrls: options.assetUrls ?? presentationSoundAssetUrls,
    audioFactory: options.audioFactory ?? defaultAudioFactory,
  };
  if (!resolvedOptions.enabled) {
    return;
  }
  for (const intent of intents.slice(0, maxSoundIntentsPerBatch)) {
    if (intent.id === lastPlayedIntentId) {
      continue;
    }
    lastPlayedIntentId = intent.id;
    playCue(intent.cue, resolvedOptions);
  }
};
