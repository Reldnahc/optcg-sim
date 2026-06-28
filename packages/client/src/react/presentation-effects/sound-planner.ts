import type { CardMovementIntent } from "./movement-planner.js";
import type { PresentationSoundCue } from "./sound-cues.js";

export type { PresentationSoundCue } from "./sound-cues.js";

export interface PresentationSoundIntent {
  id: string;
  cue: PresentationSoundCue;
}

type MovementSoundCue = Extract<
  PresentationSoundCue,
  "draw" | "move" | "play" | "trash"
>;

const zoneName = (zoneKey: string | undefined): string | undefined =>
  zoneKey?.split(":")[1];

const cueForMovement = (movement: CardMovementIntent): MovementSoundCue => {
  const fromZone = zoneName(movement.fromZoneKey);
  const toZone = zoneName(movement.toZoneKey);
  if (fromZone === "deck" && toZone === "hand") {
    return "draw";
  }
  if (toZone === "trash") {
    return "trash";
  }
  if (fromZone === "hand" && toZone === "characterArea") {
    return "play";
  }
  if (fromZone === "hand" && toZone === "stageArea") {
    return "play";
  }
  return "move";
};

const cuePriority = (cue: MovementSoundCue): number => {
  switch (cue) {
    case "trash":
      return 4;
    case "draw":
      return 3;
    case "play":
      return 2;
    case "move":
      return 1;
  }
};

const dominantCue = (
  cues: readonly MovementSoundCue[],
): MovementSoundCue | undefined =>
  cues.reduce<MovementSoundCue | undefined>((best, cue) => {
    if (best === undefined || cuePriority(cue) > cuePriority(best)) {
      return cue;
    }
    return best;
  }, undefined);

export const planSoundIntents = (
  movements: readonly CardMovementIntent[],
): PresentationSoundIntent[] => {
  if (movements.length === 0) {
    return [];
  }
  if (movements.length === 1) {
    const movement = movements[0];
    if (movement === undefined) {
      return [];
    }
    return [{ id: `sound:${movement.id}`, cue: cueForMovement(movement) }];
  }

  const cue = dominantCue(movements.map(cueForMovement));
  return cue === undefined ? [] : [{ id: `sound:movement-burst:${cue}`, cue }];
};
