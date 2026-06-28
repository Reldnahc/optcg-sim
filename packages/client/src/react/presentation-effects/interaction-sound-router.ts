import {
  planInteractionSoundIntent,
  type PresentationInteractionSoundCue,
} from "./interaction-sound-planner.js";
import {
  playPresentationSoundIntents,
  type PresentationSoundOptions,
} from "./sound-controller.js";
import type { PresentationSoundIntent } from "./sound-planner.js";

interface PlayInteractionSoundInput {
  readonly cue: PresentationInteractionSoundCue;
  readonly sourceKey: string;
  readonly enabled: boolean;
  readonly volume: number;
  readonly play?: (
    intents: readonly PresentationSoundIntent[],
    options: PresentationSoundOptions,
  ) => void;
}

export const playInteractionSound = ({
  cue,
  sourceKey,
  enabled,
  volume,
  play = playPresentationSoundIntents,
}: PlayInteractionSoundInput): void => {
  play(planInteractionSoundIntent(cue, sourceKey), { enabled, volume });
};
