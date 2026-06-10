import type { ClientActionModel } from "../view-model.js";

export const cardIsSelectable = (
  actions: readonly ClientActionModel[],
): boolean =>
  actions.some(
    (action) => action.type === "playCard" || action.type === "useCounter",
  );
