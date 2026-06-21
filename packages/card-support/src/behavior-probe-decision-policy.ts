import type {
  Action,
  Condition,
  Effect,
  EffectBlock,
  GameState,
  LegalAction,
  SequencedEffect,
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
    shouldProbeSelectOptionalCard(state, effectBlocks),
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
    legalAction.response.type === "targets" &&
    pendingAction.response.type === "targets"
  ) {
    return (
      legalAction.response.targets.length === 0 &&
      pendingAction.response.targets.length > 0
    );
  }
  if (
    legalAction.response.type === "cards" &&
    pendingAction.response.type === "cards"
  ) {
    return (
      legalAction.response.cards.length === 0 &&
      pendingAction.response.cards.length > 0
    );
  }
  return false;
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
  selectOptionalCard: boolean,
): Extract<Action, { type: "respondToDecision" }> | undefined => {
  const decision = state.pendingDecision;
  if (decision === undefined) {
    return undefined;
  }
  if (decision.type === "chooseQuantity") {
    return {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "chooseQuantity",
        quantity: decision.max,
      },
    };
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
        targets: orderTargetCandidatesForProbe(state, decision.candidates)
          .slice(0, targetCount)
          .map((candidate) => candidate.card),
      },
    };
  }
  if (decision.type === "selectCards") {
    if (decision.request.min === 0 && !selectOptionalCard) {
      return undefined;
    }
    const max = decision.request.max;
    const cardCount = Math.min(
      max,
      decision.candidates.length,
      Math.max(1, decision.request.min),
    );
    if (cardCount < decision.request.min || cardCount === 0) {
      return undefined;
    }
    return {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "cards",
        cards: decision.candidates
          .slice(0, cardCount)
          .map((candidate) => candidate.card),
      },
    };
  }
  if (decision.type !== "orderCards") {
    return undefined;
  }
  if (decision.placement?.type === "topOrBottom") {
    const bottomIds =
      decision.destination === "life"
        ? decision.cards.slice(0, 1).map((card) => String(card.instanceId))
        : decision.cards.map((card) => String(card.instanceId));
    return {
      type: "respondToDecision",
      decisionId: decision.id,
      response: {
        type: "topBottomPlacement",
        topIds: [],
        bottomIds,
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

const shouldProbeSelectOptionalCard = (
  state: GameState,
  effectBlocks: readonly EffectBlock[],
): boolean => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
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
  const sequence =
    effectBlock?.effect.type === "sequence"
      ? resolveSequenceForPath(effectBlock.effect, frame.effectPath)
      : undefined;
  if (sequence === undefined) {
    return false;
  }
  const segment = sequence.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (
    segment?.effect.type !== "selectCards" &&
    segment?.effect.type !== "selectFromSet"
  ) {
    return false;
  }
  const saveAs =
    segment.effect.type === "selectCards"
      ? segment.effect.saveAs
      : segment.effect.saveAs;
  return sequence.effects
    .slice(frame.pendingDecision.resumeAtSegmentIndex + 1)
    .some(
      (candidate) =>
        consumesSelectedCards(candidate.effect, saveAs) ||
        candidate.connector === "ifPreviousSucceeded",
    );
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
  const sequence =
    effectBlock?.effect.type === "sequence"
      ? resolveSequenceForPath(effectBlock.effect, frame.effectPath)
      : undefined;
  if (sequence === undefined) {
    return false;
  }
  const segment = sequence.effects[frame.pendingDecision.resumeAtSegmentIndex];
  const saveResultAs = segment?.saveResultAs;
  if (segment?.effect.type !== "selectTargets" || saveResultAs === undefined) {
    return false;
  }
  return sequence.effects
    .slice(frame.pendingDecision.resumeAtSegmentIndex + 1)
    .some(
      (candidate) =>
        consumesSelectedTarget(candidate.effect, saveResultAs) ||
        consumesSelectedTargetInCondition(
          sequenceSegmentCondition(candidate),
          saveResultAs,
        ),
    );
};

type SequenceEffect = Extract<Effect, { type: "sequence" }>;

const rootSequencePath = ["effect", "sequence"] as const;

const isRootSequencePath = (path: readonly string[]): boolean =>
  path.length === rootSequencePath.length &&
  path.every((part, index) => part === rootSequencePath[index]);

const asSingleEffectSequence = (effect: Effect): SequenceEffect => ({
  type: "sequence",
  effects: [{ connector: "always", effect }],
});

const resolveSequenceForPath = (
  effect: SequenceEffect,
  path: readonly string[],
): SequenceEffect | undefined => {
  if (
    path.length < rootSequencePath.length ||
    !isRootSequencePath(path.slice(0, rootSequencePath.length))
  ) {
    return undefined;
  }
  let current = effect;
  let index = rootSequencePath.length;
  while (index < path.length) {
    const segmentIndex = Number(path[index]);
    const branchToken = path[index + 1];
    const sequenceToken = path[index + 2];
    if (!Number.isSafeInteger(segmentIndex)) {
      return undefined;
    }
    const segment = current.effects[segmentIndex];
    if (segment === undefined) {
      return undefined;
    }
    if (branchToken === "nested" && sequenceToken === "sequence") {
      if (segment.effect.type !== "sequence") {
        return undefined;
      }
      current = segment.effect;
    } else if (branchToken === "forEachSavedTarget") {
      if (segment.effect.type !== "forEachSavedTarget") {
        return undefined;
      }
      const itemIndex = Number(sequenceToken);
      const itemSequenceToken = path[index + 3];
      if (
        !Number.isSafeInteger(itemIndex) ||
        itemSequenceToken !== "sequence"
      ) {
        return undefined;
      }
      current =
        segment.effect.effect.type === "sequence"
          ? segment.effect.effect
          : asSingleEffectSequence(segment.effect.effect);
      index += 1;
    } else if (branchToken === "choice") {
      if (segment.effect.type !== "choice") {
        return undefined;
      }
      const optionIndex = Number(sequenceToken);
      const optionSequenceToken = path[index + 3];
      const option = segment.effect.options[optionIndex];
      if (
        !Number.isSafeInteger(optionIndex) ||
        optionSequenceToken !== "sequence" ||
        option === undefined
      ) {
        return undefined;
      }
      current =
        option.effect.type === "sequence"
          ? option.effect
          : asSingleEffectSequence(option.effect);
      index += 1;
    } else if (
      (branchToken === "then" || branchToken === "else") &&
      sequenceToken === "sequence"
    ) {
      if (segment.effect.type !== "conditional") {
        return undefined;
      }
      const branch =
        branchToken === "then" ? segment.effect.then : segment.effect.else;
      if (branch?.type !== "sequence") {
        return undefined;
      }
      current = branch;
    } else if (
      (branchToken === "then" || branchToken === "else") &&
      sequenceToken === "single"
    ) {
      if (segment.effect.type !== "conditional") {
        return undefined;
      }
      const branch =
        branchToken === "then" ? segment.effect.then : segment.effect.else;
      if (branch === undefined || branch.type === "sequence") {
        return undefined;
      }
      current = asSingleEffectSequence(branch);
    } else {
      return undefined;
    }
    index += 3;
  }
  return current;
};

const sequenceSegmentCondition = (
  segment: SequencedEffect,
): Condition | undefined =>
  "condition" in segment && segment.condition !== undefined
    ? (segment.condition as Condition)
    : undefined;

const consumesSelectedTargetInCondition = (
  condition: Condition | undefined,
  saveResultAs: string,
): boolean => {
  if (condition === undefined) {
    return false;
  }
  if (
    condition.type === "attachedDonCount" ||
    condition.type === "cardMatches" ||
    condition.type === "cardStatComparison" ||
    condition.type === "cardState"
  ) {
    return targetUsesSelectedTarget(condition.target, saveResultAs);
  }
  if (condition.type === "and" || condition.type === "or") {
    return condition.conditions.some((child) =>
      consumesSelectedTargetInCondition(child, saveResultAs),
    );
  }
  if (condition.type === "not") {
    return consumesSelectedTargetInCondition(condition.condition, saveResultAs);
  }
  return false;
};

const consumesSelectedTarget = (
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
  if (
    effect.type === "bounce" ||
    effect.type === "trash" ||
    effect.type === "ko" ||
    effect.type === "modifyPower" ||
    effect.type === "setPowerToZero" ||
    effect.type === "rest" ||
    effect.type === "activate" ||
    effect.type === "giveProtection" ||
    effect.type === "attachDon" ||
    effect.type === "invalidateEffects" ||
    effect.type === "protectFromKO" ||
    effect.type === "cannotBecomeActive" ||
    effect.type === "cannotAttack" ||
    effect.type === "attackCost" ||
    effect.type === "cannotBlock" ||
    effect.type === "preventBlockerActivation" ||
    effect.type === "changeAttackTarget"
  ) {
    return targetUsesSelectedTarget(effect.target, saveResultAs);
  }
  if (effect.type === "sequence") {
    return effect.effects.some((segment) =>
      consumesSelectedTarget(segment.effect, saveResultAs),
    );
  }
  if (effect.type === "conditional") {
    return (
      consumesSelectedTarget(effect.then, saveResultAs) ||
      (effect.else === undefined
        ? false
        : consumesSelectedTarget(effect.else, saveResultAs))
    );
  }
  if (effect.type === "delayed" || effect.type === "forEachSavedTarget") {
    return consumesSelectedTarget(effect.effect, saveResultAs);
  }
  if (effect.type === "replacement") {
    return consumesSelectedTarget(effect.instead, saveResultAs);
  }
  if (effect.type === "choice") {
    return effect.options.some((option) =>
      consumesSelectedTarget(option.effect, saveResultAs),
    );
  }
  return false;
};

const consumesSelectedCards = (
  effect: Effect | { type: "payCost" },
  selection: string,
): boolean => {
  if (effect.type === "payCost") {
    return false;
  }
  if (
    (effect.type === "moveSelected" && effect.selection === selection) ||
    (effect.type === "attachSelectedDon" && effect.selection === selection) ||
    (effect.type === "activateSelectedEvent" &&
      effect.selection === selection) ||
    (effect.type === "playSelected" && effect.selection === selection) ||
    (effect.type === "revealSelected" && effect.selection === selection)
  ) {
    return true;
  }
  if (effect.type === "sequence") {
    return effect.effects.some((segment) =>
      consumesSelectedCards(segment.effect, selection),
    );
  }
  if (effect.type === "conditional") {
    return (
      consumesSelectedCards(effect.then, selection) ||
      (effect.else === undefined
        ? false
        : consumesSelectedCards(effect.else, selection))
    );
  }
  if (effect.type === "delayed" || effect.type === "forEachSavedTarget") {
    return consumesSelectedCards(effect.effect, selection);
  }
  if (effect.type === "replacement") {
    return consumesSelectedCards(effect.instead, selection);
  }
  if (effect.type === "choice") {
    return effect.options.some((option) =>
      consumesSelectedCards(option.effect, selection),
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

type TargetCandidate = Extract<
  NonNullable<GameState["pendingDecision"]>,
  { type: "selectTargets" }
>["candidates"][number];

const orderTargetCandidatesForProbe = (
  state: GameState,
  candidates: readonly TargetCandidate[],
): readonly TargetCandidate[] => {
  if (state.battle === undefined) {
    return candidates;
  }
  return [...candidates].sort(
    (left, right) =>
      battleInstabilityScore(state, left) -
      battleInstabilityScore(state, right),
  );
};

const battleInstabilityScore = (
  state: GameState,
  candidate: TargetCandidate,
): number => {
  const battle = state.battle;
  if (battle === undefined) {
    return 0;
  }
  const refs = [battle.attacker, battle.currentTarget, battle.blocker].filter(
    (ref): ref is NonNullable<typeof ref> => ref !== undefined,
  );
  const card = candidate.card;
  if (
    refs.some(
      (ref) =>
        ref.instanceId === card.instanceId &&
        ref.cardId === card.cardId &&
        ref.playerId === card.playerId,
    )
  ) {
    return 100;
  }
  const zone = card.zone;
  if (
    zone === undefined ||
    zone.zone !== "characterArea" ||
    zone.index === undefined
  ) {
    return 0;
  }
  const candidateIndex = zone.index;
  return refs.some(
    (ref) =>
      ref.playerId === card.playerId &&
      ref.zone?.zone === "characterArea" &&
      ref.zone.index !== undefined &&
      candidateIndex < ref.zone.index,
  )
    ? 50
    : 0;
};
