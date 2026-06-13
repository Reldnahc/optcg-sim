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
import {
  isSupportedDrawSegment,
  isSupportedDrawUpToSegment,
  isSupportedDamageSegment,
  isSupportedMoveCardsSegment,
  isSupportedPlaceTopDeckCardsSegment,
  isSupportedReorderLifeSegment,
  isSupportedReturnDonSegment,
  isSupportedSetLifeFaceUpSegment,
  isSupportedTrashFromHandSegment,
  isSupportedTrashFromHandUntilCountSegment,
  type DamageEffect,
  type DrawEffect,
  type DrawUpToEffect,
  type MoveCardsEffect,
  type PlaceTopDeckCardsEffect,
  type ReorderLifeEffect,
  type ReturnDonEffect,
  type SetLifeFaceUpEffect,
  type TrashFromHandEffect,
  type TrashFromHandUntilCountEffect,
} from "./support/basic.js";
import {
  isSupportedAttachSelectedDonSegment,
  isSupportedPlaceSetRemainderSegment,
  isSupportedPlaySourceSegment,
  isSupportedRevealSelectedSegment,
  isSupportedRevealTopSegment,
  isSupportedSelectFromSetSegment,
  isSupportedSequenceSelectCardsSegment,
  isSupportedMoveSelectedSegment,
  savedSelectedCardsKindForSelectCardsSegment,
  type AttachSelectedDonEffect,
  type MoveSelectedEffect,
  type PlaceSetRemainderEffect,
  type PlaySourceEffect,
  type RevealSelectedEffect,
  type RevealTopEffect,
  type SavedSelectedCardsKind,
  type SelectFromSetEffect,
} from "./support/selection.js";
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
    | ReorderLifeEffect
    | SetLifeFaceUpEffect
    | TrashFromHandEffect
    | TrashFromHandUntilCountEffect
    | PlaceTopDeckCardsEffect
    | PayCostEffect
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
  savedSelectedCards: Map<string, SavedSelectedCardsKind>;
  savedSelectedCardMaxCounts: Map<string, number>;
  savedSelectionSets: Set<string>;
  savedSelectedTargets: Set<string>;
}

const emptySequenceSupportState = (
  options: SequenceSupportOptions = {},
): SequenceSupportState => ({
  hasPendingDecisionSegment: false,
  savedSelectedCards: new Map(),
  savedSelectedCardMaxCounts: new Map(),
  savedSelectionSets: new Set(),
  savedSelectedTargets: new Set(options.initialSavedSelectedTargets ?? []),
});

const cloneSequenceSupportState = (
  state: SequenceSupportState,
): SequenceSupportState => ({
  hasPendingDecisionSegment: state.hasPendingDecisionSegment,
  savedSelectedCards: new Map(state.savedSelectedCards),
  savedSelectedCardMaxCounts: new Map(state.savedSelectedCardMaxCounts),
  savedSelectionSets: new Set(state.savedSelectionSets),
  savedSelectedTargets: new Set(state.savedSelectedTargets),
});

const savedSelectedCardsKind = (
  state: SequenceSupportState,
  selection: unknown,
): SavedSelectedCardsKind | undefined =>
  state.savedSelectedCards.get(String(selection));

const savedSelectedCardsMaxCount = (
  state: SequenceSupportState,
  selection: unknown,
): number | undefined =>
  state.savedSelectedCardMaxCounts.get(String(selection));

const hasSavedSelectionSet = (
  state: SequenceSupportState,
  selectionSet: unknown,
): boolean => state.savedSelectionSets.has(String(selectionSet));

const hasSavedSelectedTargets = (
  state: SequenceSupportState,
  selection: unknown,
): boolean => state.savedSelectedTargets.has(String(selection));

const requestSelectsDonFromCostArea = (
  request: SelectTargetsEffect["request"],
): boolean => {
  const zones = "zones" in request ? request.zones : [request.zone];
  return (
    request.chooser === "self" &&
    (request.player === "self" ||
      request.player === "opponent" ||
      request.player === "anyPlayer") &&
    zones.length > 0 &&
    zones.every((zone) => zone === "costArea") &&
    request.visibility === "public" &&
    request.filter?.categories?.length === 1 &&
    request.filter.categories[0] === "don"
  );
};

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
): effect is ConditionalEffect => {
  if (
    effect.type !== "conditional" ||
    effect.else !== undefined ||
    !isSupportedQueuedEffectConditionShape(effect.if)
  ) {
    return false;
  }
  const thenSequence =
    effect.then.type === "sequence"
      ? effect.then
      : toSingleEffectSequence(effect.then);
  const flattenedThen = flattenSequenceEffect(thenSequence);
  if (flattenedThen === null) {
    return false;
  }
  return isSupportedSequenceBlock(
    toSyntheticQueueEntry(sourcePresencePolicy),
    {
      id: "effect:conditional-child" as EffectDefinition["effects"][number]["id"],
      category: "auto",
      trigger: { type: "onPlay" },
      sourcePresencePolicy,
      effect: flattenedThen,
    },
    {
      ...options,
      allowInitialTrashFromHand: true,
      requirePositiveDrawCount: false,
    },
  );
};

const isSupportedDelayedSegment = (
  effect: DelayedEffect,
  options: SequenceSupportOptions,
): boolean =>
  isSupportedSequenceBlock(
    toSyntheticQueueEntry("noSourceRequired"),
    {
      id: "effect:delayed-child" as EffectDefinition["effects"][number]["id"],
      category: "auto",
      trigger: { type: "endOfYourTurn" },
      sourcePresencePolicy: "noSourceRequired",
      effect: effect.effect,
    },
    options,
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
      isScopedActivatedReactionQueueEntry(entry));

  if (
    flattenedBlock === undefined ||
    !isSupportedCategoryForEntry ||
    flattenedBlock.optional === true ||
    flattenedBlock.cost !== undefined ||
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
          Number.isInteger(segment.effect.count) &&
          segment.effect.count <= 0
        ) {
          return false;
        }
        if (segment.optional === true) {
          supportState.hasPendingDecisionSegment = true;
        }
        return true;
      }
      if (isSupportedDrawUpToSegment(segment.effect)) {
        if (segment.optional === true) {
          return false;
        }
        supportState.hasPendingDecisionSegment = true;
        return true;
      }
      if (isSupportedTrashFromHandSegment(segment.effect)) {
        if (index === 0 && !allowInitialTrashFromHand) {
          return false;
        }
        supportState.hasPendingDecisionSegment = true;
        return true;
      }
      if (isSupportedTrashFromHandUntilCountSegment(segment.effect)) {
        supportState.hasPendingDecisionSegment = true;
        return true;
      }
      if (isSupportedMoveCardsSegment(segment.effect)) {
        return true;
      }
      if (isSupportedDamageSegment(segment.effect)) {
        return true;
      }
      if (isSupportedReturnDonSegment(segment.effect)) {
        return true;
      }
      if (isSupportedReorderLifeSegment(segment.effect)) {
        supportState.hasPendingDecisionSegment = true;
        return true;
      }
      if (isSupportedSetLifeFaceUpSegment(segment.effect)) {
        return true;
      }
      if (isSupportedPlaceTopDeckCardsSegment(segment.effect)) {
        supportState.hasPendingDecisionSegment = true;
        return true;
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
        supportState.hasPendingDecisionSegment = true;
        return true;
      }
      if (isSupportedPayCostSegment(segment.effect)) {
        if (segment.optional === true) {
          return false;
        }
        supportState.hasPendingDecisionSegment = true;
        return true;
      }
      if (isSupportedRevealTopSegment(segment.effect)) {
        supportState.savedSelectionSets.add(String(segment.effect.saveAs));
        return true;
      }
      if (isSupportedSelectFromSetSegment(segment.effect)) {
        if (!hasSavedSelectionSet(supportState, segment.effect.set)) {
          return false;
        }
        supportState.hasPendingDecisionSegment = true;
        supportState.savedSelectedCards.set(
          String(segment.effect.saveAs),
          "set",
        );
        supportState.savedSelectedCardMaxCounts.set(
          String(segment.effect.saveAs),
          segment.effect.max,
        );
        return true;
      }
      if (isSupportedRevealSelectedSegment(segment.effect)) {
        return (
          savedSelectedCardsKind(supportState, segment.effect.selection) !==
          undefined
        );
      }
      if (isSupportedPlaceSetRemainderSegment(segment.effect)) {
        if (!hasSavedSelectionSet(supportState, segment.effect.set)) {
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
        return true;
      }
      if (segment.effect.type === "delayed") {
        return isSupportedDelayedSegment(segment.effect, options);
      }
      if (isSupportedSequenceSelectCardsSegment(segment.effect)) {
        const kind = savedSelectedCardsKindForSelectCardsSegment(
          segment.effect,
        );
        if (kind === undefined) {
          return false;
        }
        supportState.savedSelectedCards.set(
          String(segment.effect.saveAs),
          kind,
        );
        supportState.savedSelectedCardMaxCounts.set(
          String(segment.effect.saveAs),
          segment.effect.max,
        );
        supportState.hasPendingDecisionSegment = true;
        return true;
      }
      if (segment.effect.type === "moveSelected") {
        return isSupportedMoveSelectedSegment(
          segment.effect,
          savedSelectedCardsKind(supportState, segment.effect.selection),
          savedSelectedCardsMaxCount(supportState, segment.effect.selection),
          hasSavedSelectionSet(supportState, segment.effect.from),
        );
      }
      if (segment.effect.type === "attachSelectedDon") {
        return isSupportedAttachSelectedDonSegment(
          segment.effect,
          savedSelectedCardsKind(supportState, segment.effect.selection),
        );
      }
      if (isSupportedTrashSegment(segment.effect)) {
        return true;
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
        return true;
      }
      if (segment.effect.type === "selectTargets") {
        const request = segment.effect.request;
        if (!isSupportedSequenceTargetRequest(request)) {
          return false;
        }
        if (segment.saveResultAs !== undefined) {
          supportState.savedSelectedTargets.add(segment.saveResultAs);
        }
        if (
          segment.saveResultAs !== undefined &&
          requestSelectsDonFromCostArea(request)
        ) {
          supportState.savedSelectedCards.set(segment.saveResultAs, "don");
        }
        supportState.hasPendingDecisionSegment = true;
        return true;
      }
      if (segment.effect.type === "selectAllTargets") {
        if (!isSupportedSelectAllTargetsRequest(segment.effect.request)) {
          return false;
        }
        if (segment.saveResultAs !== undefined) {
          supportState.savedSelectedTargets.add(segment.saveResultAs);
        }
        return true;
      }
      if (isSupportedRestSegment(segment.effect)) {
        if (
          segment.effect.target.type === "choose" ||
          segment.effect.target.type === "chooseFromZones"
        ) {
          supportState.hasPendingDecisionSegment = true;
        }
        return true;
      }
      if (isSupportedActivateSegment(segment.effect)) {
        return true;
      }
      if (isSupportedChangeAttackTargetSegment(segment.effect)) {
        return true;
      }
      if (isSupportedSavedTargetContinuousSegment(segment.effect)) {
        return true;
      }
      if (isSupportedSwapBasePowerSegment(segment.effect)) {
        return true;
      }
      if (isSupportedConditionalContinuousSegment(segment.effect)) {
        return true;
      }
      if (
        isSupportedConditionalSegment(
          segment.effect,
          entry.sourcePresencePolicy,
          options,
        )
      ) {
        supportState.hasPendingDecisionSegment = true;
        return true;
      }
      if (segment.effect.type === "forEachSavedTarget") {
        if (!hasSavedSelectedTargets(supportState, segment.effect.selection)) {
          return false;
        }
        return isSupportedForEachSavedTargetSegment(
          segment.effect,
          entry.sourcePresencePolicy,
          options,
        );
      }
      if (segment.effect.type === "choice") {
        supportState.hasPendingDecisionSegment = true;
        return isSupportedChoiceEffect(segment.effect, (effect) =>
          isSupportedSequenceBlockWithState(
            entry,
            { ...flattenedBlock, effect },
            { ...options, allowInitialTrashFromHand: true },
            cloneSequenceSupportState(supportState),
          ),
        );
      }
      if (segment.effect.type === "playSelected") {
        const kind = savedSelectedCardsKind(
          supportState,
          segment.effect.selection,
        );
        return (
          segment.effect.ignoreCost === true &&
          (segment.effect.enterRested === undefined ||
            typeof segment.effect.enterRested === "boolean") &&
          (kind === "hand" || kind === "trash" || kind === "set")
        );
      }
      if (segment.effect.type === "activateSelectedEvent") {
        return (
          segment.effect.ignoreCost &&
          segment.effect.trigger.type === "main" &&
          savedSelectedCardsKind(supportState, segment.effect.selection) ===
            "hand"
        );
      }
      if (isSupportedPlaySourceSegment(segment.effect)) {
        return true;
      }
      if (isSupportedKoSegment(segment.effect)) {
        return true;
      }
      if (isSupportedBounceSegment(segment.effect)) {
        return true;
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
