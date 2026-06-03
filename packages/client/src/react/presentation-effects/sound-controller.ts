import type {
  PresentationSoundCue,
  PresentationSoundIntent,
} from "./sound-planner.js";

export interface PresentationSoundOptions {
  enabled?: boolean;
  volume?: number;
}

type BrowserAudioContext = AudioContext & {
  resume: () => Promise<void>;
};

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

let sharedContext: BrowserAudioContext | undefined;
let lastPlayedIntentId: string | undefined;

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
    case "draw":
      return 660;
    case "play":
      return 440;
    case "trash":
      return 180;
    case "move":
      return 330;
  }
};

const playCue = (
  cue: PresentationSoundCue,
  options: Required<PresentationSoundOptions>,
): void => {
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
  };
  if (!resolvedOptions.enabled) {
    return;
  }
  for (const intent of intents) {
    if (intent.id === lastPlayedIntentId) {
      continue;
    }
    lastPlayedIntentId = intent.id;
    playCue(intent.cue, resolvedOptions);
  }
};
