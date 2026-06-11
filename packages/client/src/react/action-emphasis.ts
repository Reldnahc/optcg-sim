import type { ClientActionModel } from "../view-model.js";

const secondaryActionLabelPattern =
  /^(cancel|clear|decline|deny|do not|choose no)\b/iu;

const nonProgressionResponseKeys = new Set(["decline", "deny"]);

const isPositiveProgressionAction = (action: ClientActionModel): boolean => {
  if (secondaryActionLabelPattern.test(action.label)) {
    return false;
  }
  if (
    action.responseKey !== undefined &&
    nonProgressionResponseKeys.has(action.responseKey)
  ) {
    return false;
  }
  return (
    action.type === "confirmDecisionSelection" ||
    action.type === "respondToDecision" ||
    action.type === "advanceToMainPhase" ||
    action.type === "endMainPhase"
  );
};

export const primarySidebarActionPosition = (
  actions: readonly ClientActionModel[],
): number | undefined => {
  if (actions.length === 0) {
    return undefined;
  }
  if (actions.length === 1) {
    return 0;
  }
  const position = actions.findIndex(isPositiveProgressionAction);
  return position < 0 ? undefined : position;
};
