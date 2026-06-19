import type {
  Action,
  Effect,
  EffectBlock,
  GameState,
  LegalAction,
  Target,
} from "@optcg/types";

export const chooseProbeDecisionAction = (
  state: GameState,
  legalActions: readonly LegalAction[],
  effectBlocks: readonly EffectBlock[],
): Extract<Action, { type: "respondToDecision" }> | undefined => {
  const legalAction = chooseDecisionAction(legalActions);
  const pendingAction = choosePendingDecisionAction(
    state,
    shouldProbeSelectOptionalTarget(state, effectBlocks),
  );
  return shouldPreferPendingDecisionAction(legalAction, pendingAction)
    ? pendingAction
    : (legalAction ?? pendingAction);
};

const chooseDecisionAction = (
  legalActions: readonly LegalAction[],
): Extract<Action, { type: "respondToDecision" }> | undefined => {
  const responses = legalActions.filter(
    (action): action is Extract<Action, { type: "respondToDecision" }> =>
      action.type === "respondToDecision",
  );
  if (responses.length === 0) {
    return undefined;
  }
  return [...responses].sort(compareDecisionProgress)[0];
};

const shouldPreferPendingDecisionAction = (
  legalAction: Extract<Action, { type: "respondToDecision" }> | undefined,
  pendingAction: Extract<Action, { type: "respondToDecision" }> | undefined,
): pendingAction is Extract<Action, { type: "respondToDecision" }> => {
  if (legalAction === undefined || pendingAction === undefined) {
    return false;
  }
  if (
    legalAction.response.type !== "targets" ||
    pendingAction.response.type !== "targets"
  ) {
    return false;
  }
  return (
    legalAction.response.targets.length === 0 &&
    pendingAction.response.targets.length > 0
  );
};

const compareDecisionProgress = (
  left: Extract<Action, { type: "respondToDecision" }>,
  right: Extract<Action, { type: "respondToDecision" }>,
): number => decisionScore(right) - decisionScore(left);

const decisionScore = (
  action: Extract<Action, { type: "respondToDecision" }>,
): number => {
  const response = action.response;
  switch (response.type) {
    case "optionalActivation":
      return response.choice === "activate" ? 100 : 0;
    case "payment":
      return (
        90 +
        selectionCount(response.selectedCardInstanceIds) +
        selectionCount(response.selectedDonInstanceIds)
      );
    case "paymentDeclined":
      return 0;
    case "chooseQuantity":
      return 80 + response.quantity;
    case "targets":
      return 70 + response.targets.length;
    case "cards":
      return 60 + response.cards.length;
    case "effectOption":
      return 50;
    case "effectOptionDeclined":
      return 0;
    case "lifeTrigger":
      return response.choice === "activateTrigger" ? 40 : 0;
    case "replacement":
      return response.replacementId === undefined ? 0 : 30;
    case "orderedIds":
      return 20 + response.ids.length;
    case "topBottomPlacement":
      return 20 + response.topIds.length + response.bottomIds.length;
    case "loopCount":
      return 10 + response.count;
    case "mulligan":
    case "rollbackConsent":
      return 1;
  }
};

const selectionCount = (values: readonly unknown[] | undefined): number =>
  values?.length ?? 0;

const choosePendingDecisionAction = (
  state: GameState,
  selectOptionalTarget: boolean,
): Extract<Action, { type: "respondToDecision" }> | undefined => {
  const decision = state.pendingDecision;
  if (decision === undefined) {
    return undefined;
  }
  if (decision.type === "selectTargets") {
    if (decision.request.min === 0 && !selectOptionalTarget) {
      return undefined;
    }
    const targetCount = Math.min(
      decision.request.max,
      decision.candidates.length,
      Math.max(1, decision.request.min),
    );
    if (targetCount < decision.request.min || targetCount === 0) {
      return undefined;
    }
    return {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "targets",
        targets: decision.candidates
          .slice(0, targetCount)
          .map((candidate) => candidate.card),
      },
    };
  }
  if (decision.type !== "orderCards") {
    return undefined;
  }
  if (decision.placement?.type === "topOrBottom") {
    return {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "topBottomPlacement",
        topIds: [],
        bottomIds: decision.cards.map((card) => String(card.instanceId)),
      },
    };
  }
  return {
    type: "respondToDecision",
    decisionId: decision.id,
    response: {
      type: "orderedIds",
      ids: decision.cards.map((card) => String(card.instanceId)),
    },
  };
};

const shouldProbeSelectOptionalTarget = (
  state: GameState,
  effectBlocks: readonly EffectBlock[],
): boolean => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "selectTargets" ||
    decision.request.min !== 0
  ) {
    return false;
  }
  const frame = state.effectExecutionFrames.find(
    (candidate) => candidate.pendingDecision.decisionId === decision.id,
  );
  if (frame === undefined) {
    return false;
  }
  const effectBlock = effectBlocks.find(
    (candidate) => candidate.id === frame.effectBlockId,
  );
  if (effectBlock?.effect.type !== "sequence") {
    return false;
  }
  const segment =
    effectBlock.effect.effects[frame.pendingDecision.resumeAtSegmentIndex];
  const saveResultAs = segment?.saveResultAs;
  if (segment?.effect.type !== "selectTargets" || saveResultAs === undefined) {
    return false;
  }
  return effectBlock.effect.effects
    .slice(frame.pendingDecision.resumeAtSegmentIndex + 1)
    .some((candidate) =>
      consumesSelectedTargetForRequiredBasePower(
        candidate.effect,
        saveResultAs,
      ),
    );
};

const consumesSelectedTargetForRequiredBasePower = (
  effect: Effect | { type: "payCost" },
  saveResultAs: string,
): boolean => {
  if (effect.type === "payCost") {
    return false;
  }
  if (effect.type === "setBasePower") {
    return (
      targetUsesSelectedTarget(effect.target, saveResultAs) ||
      (typeof effect.value !== "number" &&
        targetUsesSelectedTarget(effect.value.target, saveResultAs))
    );
  }
  if (effect.type === "sequence") {
    return effect.effects.some((segment) =>
      consumesSelectedTargetForRequiredBasePower(segment.effect, saveResultAs),
    );
  }
  if (effect.type === "conditional") {
    return (
      consumesSelectedTargetForRequiredBasePower(effect.then, saveResultAs) ||
      (effect.else === undefined
        ? false
        : consumesSelectedTargetForRequiredBasePower(effect.else, saveResultAs))
    );
  }
  if (
    effect.type === "delayed" ||
    effect.type === "repeat" ||
    effect.type === "forEachSavedTarget"
  ) {
    return consumesSelectedTargetForRequiredBasePower(
      effect.effect,
      saveResultAs,
    );
  }
  if (effect.type === "replacement") {
    return consumesSelectedTargetForRequiredBasePower(
      effect.instead,
      saveResultAs,
    );
  }
  if (effect.type === "choice") {
    return effect.options.some((option) =>
      consumesSelectedTargetForRequiredBasePower(option.effect, saveResultAs),
    );
  }
  return false;
};

const targetUsesSelectedTarget = (
  target: Target,
  saveResultAs: string,
): boolean =>
  target.type === "savedFieldObject" &&
  target.binding.family === "selectedTargets" &&
  target.binding.saveResultAs === saveResultAs;
