import type { CardMovementIntent } from "./movement-planner.js";

export type PresentationSoundCue =
  | "attach"
  | "counter"
  | "damage"
  | "draw"
  | "ko"
  | "move"
  | "play"
  | "rest"
  | "return"
  | "reveal"
  | "shuffle"
  | "trash"
  | "trigger";

export interface PresentationSoundIntent {
  id: string;
  cue: PresentationSoundCue;
}

const zoneName = (zoneKey: string | undefined): string | undefined =>
  zoneKey?.split(":")[1];

const cueForMovement = (movement: CardMovementIntent): PresentationSoundCue => {
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

const cuePriority = (cue: PresentationSoundCue): number => {
  switch (cue) {
    case "trash":
    case "ko":
    case "damage":
      return 4;
    case "draw":
    case "reveal":
      return 3;
    case "play":
    case "trigger":
    case "counter":
      return 2;
    case "attach":
    case "return":
    case "rest":
    case "shuffle":
    case "move":
      return 1;
  }
};

const dominantCue = (
  cues: readonly PresentationSoundCue[],
): PresentationSoundCue | undefined =>
  cues.reduce<PresentationSoundCue | undefined>((best, cue) => {
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
