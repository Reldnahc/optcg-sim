import type { DecisionId, EffectQueueEntry, GameState } from "@optcg/types";

export const resolveQueuedQuantity = (
  state: GameState,
  entry: EffectQueueEntry,
  bounds: { readonly min: number; readonly max: number },
): number | undefined => {
  const expectedDecisionId =
    `decision:chooseQuantity:${String(entry.id)}` as DecisionId;
  for (let index = state.eventJournal.length - 1; index >= 0; index -= 1) {
    const event = state.eventJournal[index];
    if (event?.type !== "decisionResolved") {
      continue;
    }
    const payload =
      typeof event.payload === "object" && event.payload !== null
        ? (event.payload as Record<string, unknown>)
        : undefined;
    if (payload === undefined) {
      continue;
    }
    const decisionId = payload["decisionId"];
    const decisionType = payload["decisionType"];
    const responseType = payload["responseType"];
    const quantity = payload["quantity"];
    if (
      decisionId !== expectedDecisionId ||
      decisionType !== "chooseQuantity" ||
      responseType !== "chooseQuantity" ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < bounds.min ||
      quantity > bounds.max
    ) {
      continue;
    }
    return quantity;
  }
  return undefined;
};
