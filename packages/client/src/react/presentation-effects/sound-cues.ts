export const allPresentationSoundCues = [
  "attach",
  "attention",
  "confirm",
  "counter",
  "damage",
  "draw",
  "emptyClick",
  "invalidClick",
  "ko",
  "move",
  "play",
  "rest",
  "return",
  "reveal",
  "select",
  "shuffle",
  "trash",
  "trigger",
  "yourTurn",
] as const;

export type PresentationSoundCue = (typeof allPresentationSoundCues)[number];

export type PresentationSoundCueDomain =
  | "movement"
  | "effect"
  | "interaction"
  | "attention";

export interface PresentationSoundCueProfile {
  readonly domain: PresentationSoundCueDomain;
  readonly volume: number;
  readonly playbackRateJitter: number;
  readonly minimumIntervalMs: number;
  readonly priority: number;
  readonly burstSpacingMs: number;
}

export const presentationSoundCueProfiles: Record<
  PresentationSoundCue,
  PresentationSoundCueProfile
> = {
  attach: {
    domain: "movement",
    volume: 0.72,
    playbackRateJitter: 0.035,
    minimumIntervalMs: 32,
    priority: 2,
    burstSpacingMs: 14,
  },
  attention: {
    domain: "attention",
    volume: 1,
    playbackRateJitter: 0,
    minimumIntervalMs: 1600,
    priority: 8,
    burstSpacingMs: 0,
  },
  confirm: {
    domain: "interaction",
    volume: 0.52,
    playbackRateJitter: 0.01,
    minimumIntervalMs: 45,
    priority: 3,
    burstSpacingMs: 0,
  },
  counter: {
    domain: "effect",
    volume: 0.9,
    playbackRateJitter: 0.015,
    minimumIntervalMs: 80,
    priority: 6,
    burstSpacingMs: 0,
  },
  damage: {
    domain: "effect",
    volume: 0.92,
    playbackRateJitter: 0.015,
    minimumIntervalMs: 90,
    priority: 6,
    burstSpacingMs: 0,
  },
  draw: {
    domain: "movement",
    volume: 0.72,
    playbackRateJitter: 0.025,
    minimumIntervalMs: 26,
    priority: 3,
    burstSpacingMs: 12,
  },
  emptyClick: {
    domain: "interaction",
    volume: 0.34,
    playbackRateJitter: 0.008,
    minimumIntervalMs: 55,
    priority: 1,
    burstSpacingMs: 0,
  },
  invalidClick: {
    domain: "interaction",
    volume: 0.42,
    playbackRateJitter: 0.008,
    minimumIntervalMs: 80,
    priority: 2,
    burstSpacingMs: 0,
  },
  ko: {
    domain: "effect",
    volume: 0.92,
    playbackRateJitter: 0.012,
    minimumIntervalMs: 90,
    priority: 6,
    burstSpacingMs: 0,
  },
  move: {
    domain: "movement",
    volume: 0.58,
    playbackRateJitter: 0.03,
    minimumIntervalMs: 32,
    priority: 1,
    burstSpacingMs: 10,
  },
  play: {
    domain: "movement",
    volume: 0.82,
    playbackRateJitter: 0.018,
    minimumIntervalMs: 60,
    priority: 4,
    burstSpacingMs: 0,
  },
  rest: {
    domain: "movement",
    volume: 0.52,
    playbackRateJitter: 0.03,
    minimumIntervalMs: 35,
    priority: 2,
    burstSpacingMs: 10,
  },
  return: {
    domain: "movement",
    volume: 0.62,
    playbackRateJitter: 0.025,
    minimumIntervalMs: 45,
    priority: 2,
    burstSpacingMs: 12,
  },
  reveal: {
    domain: "movement",
    volume: 0.72,
    playbackRateJitter: 0.018,
    minimumIntervalMs: 60,
    priority: 3,
    burstSpacingMs: 0,
  },
  select: {
    domain: "interaction",
    volume: 0.42,
    playbackRateJitter: 0.01,
    minimumIntervalMs: 32,
    priority: 2,
    burstSpacingMs: 0,
  },
  shuffle: {
    domain: "movement",
    volume: 0.65,
    playbackRateJitter: 0.02,
    minimumIntervalMs: 100,
    priority: 3,
    burstSpacingMs: 0,
  },
  trash: {
    domain: "movement",
    volume: 0.78,
    playbackRateJitter: 0.02,
    minimumIntervalMs: 55,
    priority: 4,
    burstSpacingMs: 0,
  },
  trigger: {
    domain: "effect",
    volume: 0.9,
    playbackRateJitter: 0.012,
    minimumIntervalMs: 100,
    priority: 7,
    burstSpacingMs: 0,
  },
  yourTurn: {
    domain: "attention",
    volume: 0.86,
    playbackRateJitter: 0,
    minimumIntervalMs: 700,
    priority: 7,
    burstSpacingMs: 0,
  },
};
