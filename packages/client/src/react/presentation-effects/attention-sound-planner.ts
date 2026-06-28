import type { PresentationSoundIntent } from "./sound-planner.js";

export interface AttentionSoundPlannerInput {
  readonly previousLocalActive: boolean;
  readonly currentLocalActive: boolean;
  readonly documentHidden: boolean;
  readonly windowFocused: boolean;
  readonly activationKey: string;
}

export const planAttentionSoundIntent = ({
  previousLocalActive,
  currentLocalActive,
  documentHidden,
  windowFocused,
  activationKey,
}: AttentionSoundPlannerInput): PresentationSoundIntent[] => {
  if (previousLocalActive || !currentLocalActive) {
    return [];
  }
  return [
    {
      id: `sound:attention:${activationKey}`,
      cue: documentHidden || !windowFocused ? "attention" : "yourTurn",
    },
  ];
};
