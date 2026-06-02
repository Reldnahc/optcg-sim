import type { GameState } from "@optcg/types";

import { computeView } from "../view/compute-view.js";

export const getUnsupportedCombatViewMetadataReason = (
  state: GameState,
): string | undefined => {
  let view: ReturnType<typeof computeView>;
  try {
    view = computeView(state);
  } catch {
    return "Battle requires unsupported combat metadata.";
  }
  if (Object.keys(view.restrictions).length > 0) {
    return "Battle requires unsupported restriction handling.";
  }
  return undefined;
};
