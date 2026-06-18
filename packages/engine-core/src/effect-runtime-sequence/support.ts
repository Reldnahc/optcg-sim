import type {
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  ActivateSelectedEventEffect,
  PlaySelectedEffect,
  SelectAllTargetsEffect,
  SelectTargetsEffect,
  SelectCardsEffect,
  Trigger,
  Target,
  SavedFieldObjectTargetBinding,
} from "@optcg/types";

import { isSupportedContinuousQueueEffect } from "../runtime/continuous/continuous.js";
import { isSupportedQueuedEffectConditionShape } from "../effect-runtime-conditions.js";
import { isSupportedChoiceEffect } from "./choice-support.js";
import {
  flattenSequenceEffect,
  toFlattenedSequenceBlock,
  toSingleEffectSequence,
  toSyntheticQueueEntry,
} from "./support-normalization.js";
import type { AutoRuntimeTriggerType } from "../effect-runtime-entry-adapters.js";
import { isScopedActivatedReactionQueueEntry } from "../runtime/optional-activation/event-reaction-support.js";
import { isScopedActivateMainQueueEntry } from "../runtime/optional-activation/activate-main-support.js";
import { isScopedStartOfTurnQueueEntry } from "../runtime/optional-activation/start-of-turn-support.js";
import {
  isSupportedDrawSegment,
  isSupportedDrawUpToSegment,
  isSupportedDamageSegment,
  isSupportedMoveCardsSegment,
  isSupportedPlaceTopLifeCardSegment,
  isSupportedPlaceTopDeckCardsSegment,
  isSupportedReorderLifeSegment,
  isSupportedReturnDonSegment,
  isSupportedSetLifeFaceUpSegment,
  isSupportedShuffleDeckSegment,
  isSupportedTrashFromHandSegment,
  isSupportedTrashFromHandUntilCountSegment,
  type DamageEffect,
  type DrawEffect,
  type DrawUpToEffect,
  type MoveCardsEffect,
  type PlaceTopLifeCardEffect,
  type PlaceTopDeckCardsEffect,
  type ReorderLifeEffect,
  type ReturnDonEffect,
  type SetLifeFaceUpEffect,
  type ShuffleDeckEffect,
  type TrashFromHandEffect,
  type TrashFromHandUntilCountEffect,
} from "./support/basic.js";
import {
  isSupportedAttachSelectedDonSegment,
  isSupportedChooseNumberSegment,
  isSupportedPlaceSetRemainderSegment,
  isSupportedPlaySourceSegment,
  isSupportedRevealSelectedSegment,
  isSupportedRevealTopSegment,
  isSupportedSelectFromSetSegment,
  isSupportedSequenceSelectCardsSegment,
  isSupportedMoveSelectedSegment,
  type AttachSelectedDonEffect,
  type ChooseNumberEffect,
  type MoveSelectedEffect,
  type PlaceSetRemainderEffect,
  type PlaySourceEffect,
  type RevealSelectedEffect,
  type RevealTopEffect,
  type SavedSelectedCardsKind,
  type SelectFromSetEffect,
} from "./support/selection.js";
import {
  canConstrainByOwner,
  canConsumeNumber,
  canConsumeSavedFieldObject,
  canConsumeSelectedCards,
  canConsumeTransientSet,
  cloneStaticSavedResultState,
  emptyStaticSavedResultState,
  recordProducer,
  type SavedReferenceCapability,
  type StaticSavedResultState,
} from "./support/save-result-contract.js";
import {
  isSupportedActivateSegment,
  isSupportedBounceSegment,
  isSupportedChangeAttackTargetSegment,
  isSupportedKoSegment,
  isSupportedRestSegment,
  isSupportedSequenceTargetRequest,
  isSupportedTrashSegment,
  type ActivateEffect,
  type BounceEffect,
  type ChangeAttackTargetEffect,
  type KoEffect,
  type RestEffect,
  type TrashEffect,
} from "./support/field.js";
import {
  isSourceDependentContinuousSegment,
  isSupportedConditionalContinuousSegment,
  isSupportedSavedTargetContinuousSegment,
  isSupportedSwapBasePowerSegment,
  type ConditionalContinuousEffect,
  type DirectContinuousEffect,
  type SavedTargetContinuousEffect,
  type SwapBasePowerEffect,
} from "./support/continuous.js";
import {
  isSupportedPayCostSegment,
  type PayCostEffect,
} from "./support/costs.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegmentEffect = SequenceEffect["effects"][number]["effect"];
type DelayedEffect = Extract<Effect, { type: "delayed" }>;
type ConditionalSequenceEffect = Extract<Effect, { type: "conditional" }> & {
  then: SequenceEffect;
};
type ConditionalEffect = Extract<Effect, { type: "conditional" }>;
type ForEachSavedTargetEffect = Extract<Effect, { type: "forEachSavedTarget" }>;
type NestedSequenceEffect = SequenceEffect;

export type SupportedSequenceSegment = SequenceEffect["effects"][number] & {
  effect:
    | DrawEffect
    | DrawUpToEffect
    | DamageEffect
    | MoveCardsEffect
    | ReturnDonEffect
    | ShuffleDeckEffect
    | ReorderLifeEffect
    | PlaceTopLifeCardEffect
    | SetLifeFaceUpEffect
    | TrashFromHandEffect
    | TrashFromHandUntilCountEffect
    | PlaceTopDeckCardsEffect
    | PayCostEffect
    | ChooseNumberEffect
    | SelectCardsEffect
    | MoveSelectedEffect
    | AttachSelectedDonEffect
    | PlaySourceEffect
    | RevealTopEffect
    | SelectFromSetEffect
    | RevealSelectedEffect
    | PlaceSetRemainderEffect
    | BounceEffect
    | DirectContinuousEffect
    | TrashEffect
    | SelectTargetsEffect
    | SelectAllTargetsEffect
    | PlaySelectedEffect
    | ActivateSelectedEventEffect
    | RestEffect
    | ActivateEffect
    | ChangeAttackTargetEffect
    | SavedTargetContinuousEffect
    | SwapBasePowerEffect
    | ConditionalContinuousEffect
    | ConditionalSequenceEffect
    | ConditionalEffect
    | ForEachSavedTargetEffect
    | NestedSequenceEffect
    | DelayedEffect
    | Extract<Effect, { type: "choice" }>
    | KoEffect;
};

export type SupportedSequenceBlock = EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: SequenceEffect & { effects: SupportedSequenceSegment[] };
};
export interface SequenceSupportOptions {
  allowSavedReferences?: boolean;
  allowInitialTrashFromHand?: boolean;
  initialSavedSelectedTargets?: readonly string[];
  requirePositiveDrawCount?: boolean;
}

interface SequenceSupportState {
  hasPendingDecisionSegment: boolean;
  savedResults: StaticSavedResultState;
}

const emptySequenceSupportState = (
  options: SequenceSupportOptions = {},
): SequenceSupportState => {
  const initial: Record<string, readonly SavedReferenceCapability[]> = {
    "trigger:cardPlayed": [{ kind: "producedObjects" }],
  };
  for (const selection of options.initialSavedSelectedTargets ?? []) {
    initial[selection] = [{ kind: "selectedTargets" }];
  }

  return {
    hasPendingDecisionSegment: false,
    savedResults: emptyStaticSavedResultState(initial),
  };
};

const cloneSequenceSupportState = (
  state: SequenceSupportState,
): SequenceSupportState => ({
  hasPendingDecisionSegment: state.hasPendingDecisionSegment,
  savedResults: cloneStaticSavedResultState(state.savedResults),
});

const selectedCardKinds: readonly SavedSelectedCardsKind[] = [
  "hand",
  "deck",
  "trash",
  "life",
  "don",
  "set",
];

const recordSupportedProducer = (
  state: SequenceSupportState,
  segment: SequenceEffect["effects"][number],
): boolean => {
  const savedResults = recordProducer(state.savedResults, segment);
  if (savedResults === null) {
    return false;
  }
  state.savedResults = savedResults;
  return true;
};

const hasSavedSelectedCardSet = (
  state: SequenceSupportState,
  selectionSet: unknown,
): boolean =>
  canConsumeTransientSet(state.savedResults, selectionSet) ||
  canConsumeSelectedCards(state.savedResults, selectionSet, selectedCardKinds);

const hasSavedNumber = (
  state: SequenceSupportState,
  selection: unknown,
): boolean => canConsumeNumber(state.savedResults, selection);

const canResolveMoveCardsCount = (
  state: SequenceSupportState,
  effect: MoveCardsEffect,
): boolean =>
  typeof effect.count === "number" ||
  effect.count.type === "countMatchingZoneCards" ||
  (effect.count.type === "selectedCardCount" &&
    canConsumeSelectedCards(
      state.savedResults,
      effect.count.selection,
      selectedCardKinds,
    ));

const hasSavedSelectedTargets = (
  state: SequenceSupportState,
  selection: unknown,
): boolean =>
  canConsumeSavedFieldObject(
    state.savedResults,
    "selectedTargets",
    String(selection),
  );

const hasSavedOwnerConstraintReference = (
  state: SequenceSupportState,
  effect: SelectTargetsEffect,
): boolean =>
  effect.ownerConstraint === undefined ||
  canConstrainByOwner(state.savedResults, effect.ownerConstraint.selection);

const canConsumeSavedFieldObjectTarget = (
  state: SequenceSupportState,
  target: Target,
): boolean =>
  target.type !== "savedFieldObject" ||
  canConsumeSavedFieldObjectBinding(state, target.binding);

const canConsumeSavedFieldObjectBinding = (
  state: SequenceSupportState,
  binding: SavedFieldObjectTargetBinding,
): boolean =>
  canConsumeSavedFieldObject(
    state.savedResults,
    binding.family,
    binding.saveResultAs,
  );

const isSupportedMoveSelectedWithSavedResults = (
  state: SequenceSupportState,
  effect: MoveSelectedEffect,
): boolean =>
  (isSupportedMoveSelectedSegment(effect, "trash") &&
    canConsumeSelectedCards(state.savedResults, effect.selection, ["trash"])) ||
  (isSupportedMoveSelectedSegment(effect, "life") &&
    canConsumeSelectedCards(state.savedResults, effect.selection, ["life"])) ||
  (isSupportedMoveSelectedSegment(
    effect,
    "hand",
    effect.to === "life" ? 1 : undefined,
  ) &&
    canConsumeSelectedCards(
      state.savedResults,
      effect.selection,
      ["hand"],
      effect.to === "life" ? { max: 1 } : {},
    )) ||
  (isSupportedMoveSelectedSegment(effect, "set", undefined, true) &&
    canConsumeTransientSet(state.savedResults, effect.from) &&
    canConsumeSelectedCards(state.savedResults, effect.selection, ["set"]));

const isSupportedSelectAllTargetsRequest = (
  request: SelectAllTargetsEffect["request"],
): boolean =>
  isSupportedSequenceTargetRequest({
    ...request,
    min: 0,
    max: 0,
    allowFewerIfUnavailable: false,
  });

const isSupportedSequenceContinuousSegment = (
  effect: SequenceSegmentEffect,
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"],
): effect is DirectContinuousEffect =>
  effect.type !== "payCost" &&
  isSupportedContinuousQueueEffect(effect) &&
  (sourcePresencePolicy === "mustRemainInSameZone" ||
    !isSourceDependentContinuousSegment(effect));

const isSupportedConditionalSegment = (
  effect: SequenceSegmentEffect,
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"],
  options: SequenceSupportOptions,
  supportState: SequenceSupportState,
): effect is ConditionalEffect => {
  if (
    effect.type !== "conditional" ||
    !isSupportedQueuedEffectConditionShape(effect.if)
  ) {
    return false;
  }
  return [effect.then, effect.else]
    .filter((branch): branch is Effect => branch !== undefined)
    .every((branch) => {
      const sequence =
        branch.type === "sequence" ? branch : toSingleEffectSequence(branch);
      const flattened = flattenSequenceEffect(sequence);
      if (flattened === null) {
        return false;
      }
      return isSupportedSequenceBlockWithState(
        toSyntheticQueueEntry(sourcePresencePolicy),
        {
          id: "effect:conditional-child" as EffectDefinition["effects"][number]["id"],
          category: "auto",
          trigger: { type: "onPlay" },
          sourcePresencePolicy,
          effect: flattened,
        },
        {
          ...options,
          allowInitialTrashFromHand: true,
          requirePositiveDrawCount: false,
        },
        cloneSequenceSupportState(supportState),
      );
    });
};

const isSupportedDelayedSegment = (
  effect: DelayedEffect,
  options: SequenceSupportOptions,
  supportState: SequenceSupportState,
): boolean =>
  isSupportedSequenceBlockWithState(
    toSyntheticQueueEntry("noSourceRequired"),
    {
      id: "effect:delayed-child" as EffectDefinition["effects"][number]["id"],
      category: "auto",
      trigger:
        effect.timing.type === "event"
          ? effect.timing.trigger
          : effect.timing.type === "startOfMainPhase"
            ? { type: "startOfMainPhase" }
            : { type: "endOfYourTurn" },
      sourcePresencePolicy: "noSourceRequired",
      effect: effect.effect,
    },
    options,
    cloneSequenceSupportState(supportState),
  );

const isSupportedForEachSavedTargetSegment = (
  effect: ForEachSavedTargetEffect,
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"],
  options: SequenceSupportOptions,
): boolean => {
  const childSequence =
    effect.effect.type === "sequence"
      ? effect.effect
      : toSingleEffectSequence(effect.effect);
  const flattenedChild = flattenSequenceEffect(childSequence);
  if (flattenedChild === null) {
    return false;
  }
  return isSupportedSequenceBlock(
    toSyntheticQueueEntry(sourcePresencePolicy),
    {
      id: "effect:for-each-saved-target-child" as EffectDefinition["effects"][number]["id"],
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy,
      effect: flattenedChild,
    },
    {
      ...options,
      allowInitialTrashFromHand: true,
      initialSavedSelectedTargets: [
        ...(options.initialSavedSelectedTargets ?? []),
        effect.saveCurrentAs,
      ],
      requirePositiveDrawCount: false,
    },
  );
};

const isSupportedSequenceBlockWithState = (
  entry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number] | undefined,
  options: SequenceSupportOptions,
  supportState: SequenceSupportState,
): effectBlock is SupportedSequenceBlock => {
  const flattenedBlock = toFlattenedSequenceBlock(effectBlock);
  const allowSavedReferences = options.allowSavedReferences ?? true;
  const allowInitialTrashFromHand = options.allowInitialTrashFromHand ?? false;
  const requirePositiveDrawCount = options.requirePositiveDrawCount ?? false;
  const isSupportedCategoryForEntry =
    flattenedBlock?.category === "auto" ||
    (flattenedBlock?.category === "activate" &&
      flattenedBlock.trigger.type === "activateMain" &&
      isScopedActivateMainQueueEntry(entry)) ||
    (flattenedBlock?.category === "activate" &&
      flattenedBlock.trigger.type === "startOfYourTurn" &&
      isScopedStartOfTurnQueueEntry(entry)) ||
    (flattenedBlock?.category === "activate" &&
      isScopedActivatedReactionQueueEntry(entry));

  if (
    flattenedBlock === undefined ||
    !isSupportedCategoryForEntry ||
    flattenedBlock.optional === true ||
    flattenedBlock.cost !== undefined ||
    !isSupportedQueuedEffectConditionShape(flattenedBlock.condition) ||
    flattenedBlock.conditionTiming !== undefined ||
    flattenedBlock.failurePolicy !== undefined ||
    flattenedBlock.sourcePresencePolicy !== entry.sourcePresencePolicy ||
    flattenedBlock.effect.type !== "sequence" ||
    flattenedBlock.effect.effects.length === 0
  ) {
    return false;
  }

  const allSegmentsSupported = flattenedBlock.effect.effects.every(
    (segment, index) => {
      if (index === 0 && segment.connector !== "always") {
        return false;
      }
      if (!allowSavedReferences && segment.saveResultAs !== undefined) {
        return false;
      }
      if (isSupportedDrawSegment(segment.effect)) {
        if (
          requirePositiveDrawCount &&
          typeof segment.effect.count === "number" &&
          Number.isInteger(segment.effect.count) &&
          segment.effect.count <= 0
        ) {
          return false;
        }
        if (segment.optional === true) {
          supportState.hasPendingDecisionSegment = true;
        }
        return recordSupportedProducer(supportState, segment);
      }
      if (isSupportedDrawUpToSegment(segment.effect)) {
        if (segment.optional === true) {
          return false;
        }
        supportState.hasPendingDecisionSegment = true;
        return recordSupportedProducer(supportState, segment);
      }
      if (isSupportedTrashFromHandSegment(segment.effect)) {
        if (index === 0 && !allowInitialTrashFromHand) {
          return false;
        }
        supportState.hasPendingDecisionSegment = true;
        return recordSupportedProducer(supportState, segment);
      }
      if (isSupportedTrashFromHandUntilCountSegment(segment.effect)) {
        supportState.hasPendingDecisionSegment = true;
        return recordSupportedProducer(supportState, segment);
      }
      if (isSupportedMoveCardsSegment(segment.effect)) {
        return (
          canResolveMoveCardsCount(supportState, segment.effect) &&
          recordSupportedProducer(supportState, segment)
        );
      }
      if (isSupportedDamageSegment(segment.effect)) {
        return recordSupportedProducer(supportState, segment);
      }
      if (isSupportedReturnDonSegment(segment.effect)) {
        return recordSupportedProducer(supportState, segment);
      }
      if (isSupportedShuffleDeckSegment(segment.effect)) {
        return recordSupportedProducer(supportState, segment);
      }
      if (isSupportedReorderLifeSegment(segment.effect)) {
        supportState.hasPendingDecisionSegment = true;
        return recordSupportedProducer(supportState, segment);
      }
      if (isSupportedPlaceTopLifeCardSegment(segment.effect)) {
        supportState.hasPendingDecisionSegment = true;
        return recordSupportedProducer(supportState, segment);
      }
      if (isSupportedSetLifeFaceUpSegment(segment.effect)) {
        return recordSupportedProducer(supportState, segment);
      }
      if (isSupportedPlaceTopDeckCardsSegment(segment.effect)) {
        supportState.hasPendingDecisionSegment = true;
        return recordSupportedProducer(supportState, segment);
      }
      if (segment.effect.type === "sequence") {
        if (segment.saveResultAs !== undefined) {
          return false;
        }
        const nestedState = cloneSequenceSupportState(supportState);
        const supported = isSupportedSequenceBlockWithState(
          entry,
          { ...flattenedBlock, effect: segment.effect },
          { ...options, allowInitialTrashFromHand: true },
          nestedState,
        );
        if (!supported) {
          return false;
        }
        supportState.hasPendingDecisionSegment =
          supportState.hasPendingDecisionSegment ||
          nestedState.hasPendingDecisionSegment;
        supportState.savedResults = nestedState.savedResults;
        return recordSupportedProducer(supportState, segment);
      }
      if (isSupportedPayCostSegment(segment.effect)) {
        if (segment.optional === true) {
          return false;
        }
        supportState.hasPendingDecisionSegment = true;
        return recordSupportedProducer(supportState, segment);
      }
      if (isSupportedChooseNumberSegment(segment.effect)) {
        supportState.hasPendingDecisionSegment = true;
        return recordSupportedProducer(supportState, segment);
      }
      if (isSupportedRevealTopSegment(segment.effect)) {
        return recordSupportedProducer(supportState, segment);
      }
      if (
        isSupportedSelectFromSetSegment(segment.effect, (selection) =>
          hasSavedNumber(supportState, selection),
        )
      ) {
        if (!hasSavedSelectedCardSet(supportState, segment.effect.set)) {
          return false;
        }
        supportState.hasPendingDecisionSegment = true;
        return recordSupportedProducer(supportState, segment);
      }
      if (isSupportedRevealSelectedSegment(segment.effect)) {
        return canConsumeSelectedCards(
          supportState.savedResults,
          segment.effect.selection,
          selectedCardKinds,
        );
      }
      if (isSupportedPlaceSetRemainderSegment(segment.effect)) {
        if (
          !canConsumeTransientSet(supportState.savedResults, segment.effect.set)
        ) {
          return false;
        }
        if (
          segment.effect.order === "chooser" &&
          segment.effect.position !== "bottom" &&
          segment.effect.position !== "topOrBottom"
        ) {
          return false;
        }
        supportState.hasPendingDecisionSegment = true;
        return recordSupportedProducer(supportState, segment);
      }
      if (segment.effect.type === "delayed") {
        return isSupportedDelayedSegment(segment.effect, options, supportState);
      }
      if (
        isSupportedSequenceSelectCardsSegment(segment.effect, (binding) =>
          canConsumeSavedFieldObjectBinding(supportState, binding),
        )
      ) {
        supportState.hasPendingDecisionSegment = true;
        return recordSupportedProducer(supportState, segment);
      }
      if (segment.effect.type === "moveSelected") {
        return (
          isSupportedMoveSelectedWithSavedResults(
            supportState,
            segment.effect,
          ) && recordSupportedProducer(supportState, segment)
        );
      }
      if (segment.effect.type === "attachSelectedDon") {
        return (
          isSupportedAttachSelectedDonSegment(segment.effect, "don") &&
          canConsumeSelectedCards(
            supportState.savedResults,
            segment.effect.selection,
            ["don"],
          ) &&
          canConsumeSavedFieldObjectTarget(
            supportState,
            segment.effect.target,
          ) &&
          recordSupportedProducer(supportState, segment)
        );
      }
      if (isSupportedTrashSegment(segment.effect)) {
        return (
          canConsumeSavedFieldObjectTarget(
            supportState,
            segment.effect.target,
          ) && recordSupportedProducer(supportState, segment)
        );
      }
      if (isSupportedSavedTargetContinuousSegment(segment.effect)) {
        return (
          canConsumeSavedFieldObjectTarget(
            supportState,
            segment.effect.target,
          ) && recordSupportedProducer(supportState, segment)
        );
      }
      if (
        isSupportedSequenceContinuousSegment(
          segment.effect,
          entry.sourcePresencePolicy,
        )
      ) {
        if (
          "target" in segment.effect &&
          segment.effect.target.type === "choose"
        ) {
          supportState.hasPendingDecisionSegment = true;
        }
        return recordSupportedProducer(supportState, segment);
      }
      if (segment.effect.type === "selectTargets") {
        const request = segment.effect.request;
        if (
          !isSupportedSequenceTargetRequest(request) ||
          !hasSavedOwnerConstraintReference(supportState, segment.effect)
        ) {
          return false;
        }
        supportState.hasPendingDecisionSegment = true;
        return recordSupportedProducer(supportState, segment);
      }
      if (segment.effect.type === "selectAllTargets") {
        if (!isSupportedSelectAllTargetsRequest(segment.effect.request)) {
          return false;
        }
        return recordSupportedProducer(supportState, segment);
      }
      if (isSupportedRestSegment(segment.effect)) {
        if (
          segment.effect.target.type === "choose" ||
          segment.effect.target.type === "chooseFromZones"
        ) {
          supportState.hasPendingDecisionSegment = true;
        }
        return (
          canConsumeSavedFieldObjectTarget(
            supportState,
            segment.effect.target,
          ) && recordSupportedProducer(supportState, segment)
        );
      }
      if (isSupportedActivateSegment(segment.effect)) {
        return (
          canConsumeSavedFieldObjectTarget(
            supportState,
            segment.effect.target,
          ) && recordSupportedProducer(supportState, segment)
        );
      }
      if (isSupportedChangeAttackTargetSegment(segment.effect)) {
        return (
          canConsumeSavedFieldObjectTarget(
            supportState,
            segment.effect.target,
          ) && recordSupportedProducer(supportState, segment)
        );
      }
      if (isSupportedSwapBasePowerSegment(segment.effect)) {
        return (
          canConsumeSavedFieldObjectTarget(supportState, segment.effect.left) &&
          canConsumeSavedFieldObjectTarget(
            supportState,
            segment.effect.right,
          ) &&
          recordSupportedProducer(supportState, segment)
        );
      }
      if (isSupportedConditionalContinuousSegment(segment.effect)) {
        return recordSupportedProducer(supportState, segment);
      }
      if (
        isSupportedConditionalSegment(
          segment.effect,
          entry.sourcePresencePolicy,
          options,
          supportState,
        )
      ) {
        supportState.hasPendingDecisionSegment = true;
        return recordSupportedProducer(supportState, segment);
      }
      if (segment.effect.type === "forEachSavedTarget") {
        if (!hasSavedSelectedTargets(supportState, segment.effect.selection)) {
          return false;
        }
        return (
          isSupportedForEachSavedTargetSegment(
            segment.effect,
            entry.sourcePresencePolicy,
            options,
          ) && recordSupportedProducer(supportState, segment)
        );
      }
      if (segment.effect.type === "choice") {
        supportState.hasPendingDecisionSegment = true;
        return (
          isSupportedChoiceEffect(segment.effect, (effect) =>
            isSupportedSequenceBlockWithState(
              entry,
              { ...flattenedBlock, effect },
              { ...options, allowInitialTrashFromHand: true },
              cloneSequenceSupportState(supportState),
            ),
          ) && recordSupportedProducer(supportState, segment)
        );
      }
      if (segment.effect.type === "playSelected") {
        return (
          segment.effect.ignoreCost === true &&
          (segment.effect.enterRested === undefined ||
            typeof segment.effect.enterRested === "boolean") &&
          canConsumeSelectedCards(
            supportState.savedResults,
            segment.effect.selection,
            ["hand", "deck", "trash", "set"],
          ) &&
          recordSupportedProducer(supportState, segment)
        );
      }
      if (segment.effect.type === "activateSelectedEvent") {
        const sourceZone = segment.effect.sourceZone ?? "hand";
        return (
          segment.effect.ignoreCost &&
          segment.effect.trigger.type === "main" &&
          canConsumeSelectedCards(
            supportState.savedResults,
            segment.effect.selection,
            [sourceZone],
          ) &&
          recordSupportedProducer(supportState, segment)
        );
      }
      if (isSupportedPlaySourceSegment(segment.effect)) {
        return recordSupportedProducer(supportState, segment);
      }
      if (isSupportedKoSegment(segment.effect)) {
        return (
          canConsumeSavedFieldObjectTarget(
            supportState,
            segment.effect.target,
          ) && recordSupportedProducer(supportState, segment)
        );
      }
      if (isSupportedBounceSegment(segment.effect)) {
        return (
          canConsumeSavedFieldObjectTarget(
            supportState,
            segment.effect.target,
          ) && recordSupportedProducer(supportState, segment)
        );
      }
      return false;
    },
  );
  return allSegmentsSupported;
};

export const toSupportedSequenceBlock = (
  entry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number] | undefined,
  options: SequenceSupportOptions = {},
): SupportedSequenceBlock | undefined => {
  const flattenedBlock = toFlattenedSequenceBlock(effectBlock);
  if (flattenedBlock === undefined) {
    return undefined;
  }
  return isSupportedSequenceBlockWithState(
    entry,
    flattenedBlock,
    options,
    emptySequenceSupportState(options),
  )
    ? flattenedBlock
    : undefined;
};

export const isSupportedSequenceBlock = (
  entry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number] | undefined,
  options: SequenceSupportOptions = {},
): effectBlock is SupportedSequenceBlock =>
  toSupportedSequenceBlock(entry, effectBlock, options) !== undefined;

const sequenceTriggerContainsType = (
  trigger: Trigger,
  triggerType: AutoRuntimeTriggerType,
): boolean =>
  trigger.type === "anyOf"
    ? trigger.triggers.some((child) =>
        sequenceTriggerContainsType(child, triggerType),
      )
    : trigger.type === "eventCount"
      ? sequenceTriggerContainsType(trigger.trigger, triggerType)
      : trigger.type === triggerType;

export const isSupportedQueuedAutoSequenceForEntryPoint = (
  effect: EffectDefinition["effects"][number],
  triggerType: AutoRuntimeTriggerType,
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"],
  options: SequenceSupportOptions = {},
): effect is SupportedSequenceBlock =>
  effect.category === "auto" &&
  sequenceTriggerContainsType(effect.trigger, triggerType) &&
  effect.sourcePresencePolicy === sourcePresencePolicy &&
  isSupportedSequenceBlock(
    toSyntheticQueueEntry(sourcePresencePolicy),
    effect,
    {
      allowSavedReferences: options.allowSavedReferences ?? true,
      requirePositiveDrawCount: options.requirePositiveDrawCount ?? true,
    },
  );
