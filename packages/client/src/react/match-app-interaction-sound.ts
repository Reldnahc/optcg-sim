import type { PresentationInteractionSoundCue } from "./presentation-effects/interaction-sound-planner.js";

const presentationSoundBaseVolume = 0.16;

export interface MatchPresentationSoundOptions {
  readonly enabled: boolean;
  readonly volume: number;
}

export const matchPresentationSoundOptions = (
  soundVolume: number,
): MatchPresentationSoundOptions => ({
  enabled: soundVolume > 0,
  volume: (soundVolume / 100) * presentationSoundBaseVolume,
});

export const boardCardClickInteractionCue = ({
  actionInFlight,
}: {
  readonly actionInFlight: boolean;
}): PresentationInteractionSoundCue =>
  actionInFlight ? "invalidClick" : "select";
