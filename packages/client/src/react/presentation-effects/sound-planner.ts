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

export const planSoundIntents = (
  movements: readonly CardMovementIntent[],
): PresentationSoundIntent[] =>
  movements.map((movement) => ({
    id: `sound:${movement.id}`,
    cue: cueForMovement(movement),
  }));
