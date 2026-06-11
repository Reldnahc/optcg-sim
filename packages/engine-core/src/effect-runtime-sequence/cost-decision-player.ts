import type {
  EffectQueueEntry,
  GameState,
  OptionalCost,
  PlayerId,
} from "@optcg/types";

import { resolvePlayerId } from "../runtime/primitives/execute.js";

export const costDecisionPlayerId = (
  state: GameState,
  entry: EffectQueueEntry,
  cost: OptionalCost,
): PlayerId => {
  const chooser =
    "chooser" in cost &&
    (cost.chooser === "self" || cost.chooser === "opponent")
      ? cost.chooser
      : undefined;
  if (chooser === undefined) {
    return entry.controllerId;
  }
  return resolvePlayerId(state, entry, chooser) ?? entry.controllerId;
};
