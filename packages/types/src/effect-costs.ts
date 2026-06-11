import type { PlayerRef } from "./primitives.js";

export type TurnLifeFaceUpCost = {
  type: "turnLifeFaceUp";
  count: number;
  player: PlayerRef;
  position: "top" | "bottom";
};

export type SetLifeFaceUpCost = {
  type: "setLifeFaceUp";
  count: number;
  player: PlayerRef;
  position: "top" | "bottom";
  faceUp: boolean;
};

export type OptionalTurnLifeFaceUpCost = TurnLifeFaceUpCost & {
  optional: true;
};

export type OptionalSetLifeFaceUpCost = SetLifeFaceUpCost & {
  optional: true;
};
