import { planAttentionSoundIntent } from "./attention-sound-planner.js";
import type { PresentationSoundIntent } from "./sound-planner.js";

export interface AttentionSoundRoutingBoard {
  readonly selfIsTurnPlayer: boolean;
  readonly activeCardInstanceIds?: readonly string[] | undefined;
  readonly statusBanner?:
    | {
        readonly tone: "self" | "opponent" | "block" | "counter";
        readonly turnNumber: number;
      }
    | undefined;
}

export interface AttentionSoundRoutingInput {
  readonly previousLocalActive: boolean | undefined;
  readonly board: AttentionSoundRoutingBoard;
  readonly documentHidden: boolean;
  readonly windowFocused: boolean;
}

export interface AttentionSoundRoutingResult {
  readonly nextPreviousLocalActive: boolean;
  readonly soundIntents: readonly PresentationSoundIntent[];
}

export const planAttentionSoundRouting = ({
  previousLocalActive,
  board,
  documentHidden,
  windowFocused,
}: AttentionSoundRoutingInput): AttentionSoundRoutingResult => {
  const currentLocalActive = board.selfIsTurnPlayer;
  if (previousLocalActive === undefined) {
    return {
      nextPreviousLocalActive: currentLocalActive,
      soundIntents: [],
    };
  }

  const activationKey =
    board.statusBanner === undefined
      ? `active:${String(currentLocalActive)}`
      : `turn:${String(board.statusBanner.turnNumber)}:${board.statusBanner.tone}`;

  return {
    nextPreviousLocalActive: currentLocalActive,
    soundIntents: planAttentionSoundIntent({
      previousLocalActive,
      currentLocalActive,
      documentHidden,
      windowFocused,
      activationKey,
    }),
  };
};
