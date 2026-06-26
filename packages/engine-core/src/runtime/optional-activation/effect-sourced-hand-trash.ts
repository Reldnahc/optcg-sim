import type { GameState } from "@optcg/types";

import { effectQueueEntryForDecision } from "../../decisions/continuation-gate.js";

export const effectSourcedHandTrashPayload = (
  state: GameState,
  decision: Extract<
    NonNullable<GameState["pendingDecision"]>,
    { type: "payCost" }
  >,
): Record<string, unknown> | undefined => {
  const entryLookup = effectQueueEntryForDecision(state, decision);
  if (!entryLookup.ok) {
    return undefined;
  }
  return {
    triggerSource: "effect",
    sourceCardId: entryLookup.entry.source.cardId,
    sourceCategory: entryLookup.entry.sourceSnapshot.category,
  };
};
