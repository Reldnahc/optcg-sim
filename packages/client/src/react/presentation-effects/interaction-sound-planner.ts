import type { PresentationSoundCue } from "./sound-cues.js";
import type { PresentationSoundIntent } from "./sound-planner.js";

export type PresentationInteractionSoundCue = Extract<
  PresentationSoundCue,
  "emptyClick" | "invalidClick" | "select" | "confirm"
>;

export const planInteractionSoundIntent = (
  cue: PresentationInteractionSoundCue,
  sourceKey: string,
): PresentationSoundIntent[] => [
  {
    id: `sound:interaction:${cue}:${sourceKey}`,
    cue,
  },
];
