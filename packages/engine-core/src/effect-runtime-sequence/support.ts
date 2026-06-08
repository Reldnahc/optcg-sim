import type {
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  ActivateSelectedEventEffect,
  PlaySelectedEffect,
  SelectTargetsEffect,
  SelectCardsEffect,
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
import { isScopedActivatedReactionQueueEntry } from "../runtime/optional-activation/event-reaction-support.js";
import {
  isSupportedDrawSegment,
  isSupportedDrawUpToSegment,
  isSupportedMoveCardsSegment,
  isSupportedPlaceTopDeckCardsSegment,
  isSupportedReturnDonSegment,
  isSupportedSearchSegment,
  isSupportedTrashFromHandSegment,
  type DrawEffect,
  type DrawUpToEffect,
  type MoveCardsEffect,
  type PlaceTopDeckCardsEffect,
  type ReturnDonEffect,
  type SearchEffect,
  type TrashFromHandEffect,
} from "./support/basic.js";
import {
  isSupportedAttachSelectedDonSegment,
  isSupportedPlaceSetRemainderSegment,
  isSupportedPlaySourceSegment,
  isSupportedRevealTopSegment,
  isSupportedSelectFromSetSegment,
  isSupportedSequenceSelectCardsSegment,
  isSupportedMoveSelectedSegment,
  type AttachSelectedDonEffect,
  type MoveSelectedEffect,
  type PlaceSetRemainderEffect,
  type PlaySourceEffect,
  type RevealTopEffect,
  type SelectFromSetEffect,
} from "./support/selection.js";
import {
  isSupportedActivateSegment,
  isSupportedBounceSegment,
  isSupportedKoSegment,
  isSupportedRestSegment,
  isSupportedSequenceTargetRequest,
  isSupportedTrashSegment,
  type ActivateEffect,
  type BounceEffect,
  type KoEffect,
  type RestEffect,
  type TrashEffect,
} from "./support/field.js";
import {
  isSourceDependentContinuousSegment,
  isSupportedConditionalContinuousSegment,
  isSupportedSavedTargetContinuousSegment,
  type ConditionalContinuousEffect,
  type DirectContinuousEffect,
  type SavedTargetContinuousEffect,
} from "./support/continuous.js";
import {
  isSupportedPayCostSegment,
  type PayCostEffect,
} from "./support/costs.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegmentEffect = SequenceEffect["effects"][number]["effect"];
type ConditionalSequenceEffect = Extract<Effect, { type: "conditional" }> & {
  then: SequenceEffect;
};
type ConditionalEffect = Extract<Effect, { type: "conditional" }>;

export type SupportedSequenceSegment = SequenceEffect["effects"][number] & {
  effect:
    | DrawEffect
    | DrawUpToEffect
    | MoveCardsEffect
    | ReturnDonEffect
    | TrashFromHandEffect
    | SearchEffect
    | PlaceTopDeckCardsEffect
    | PayCostEffect
    | SelectCardsEffect
    | MoveSelectedEffect
    | AttachSelectedDonEffect
    | PlaySourceEffect
    | RevealTopEffect
    | SelectFromSetEffect
    | PlaceSetRemainderEffect
    | BounceEffect
    | DirectContinuousEffect
    | TrashEffect
    | SelectTargetsEffect
    | PlaySelectedEffect
    | ActivateSelectedEventEffect
    | RestEffect
    | ActivateEffect
    | SavedTargetContinuousEffect
    | ConditionalContinuousEffect
    | ConditionalSequenceEffect
    | ConditionalEffect
    | Extract<Effect, { type: "choice" }>
    | KoEffect;
};

export type SupportedSequenceBlock = EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: SequenceEffect & { effects: SupportedSequenceSegment[] };
};
export interface SequenceSupportOptions {
  allowSavedReferences?: boolean;
  requirePositiveDrawCount?: boolean;
}

const isSupportedConditionalSegment = (
  effect: SequenceSegmentEffect,
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
  return flattenedThen.effects.every((segment, index) => {
    if (index === 0 && segment.connector !== "always") {
      return false;
    }
    if (segment.optional === true) {
      return false;
    }
    if (segment.effect.type === "selectTargets") {
      return isSupportedSequenceTargetRequest(segment.effect.request);
    }
    if (isSupportedKoSegment(segment.effect)) {
      return true;
    }
    if (isSupportedBounceSegment(segment.effect)) {
      return true;
    }
    if (isSupportedTrashSegment(segment.effect)) {
      return true;
    }
    if (isSupportedSearchSegment(segment.effect)) {
      return true;
    }
    if (isSupportedDrawSegment(segment.effect)) {
      return true;
    }
    if (isSupportedTrashFromHandSegment(segment.effect)) {
      return true;
    }
    if (isSupportedMoveCardsSegment(segment.effect)) {
      return true;
    }
    if (isSupportedReturnDonSegment(segment.effect)) {
      return true;
    }
    if (isSupportedSequenceSelectCardsSegment(segment.effect)) {
      return true;
    }
    if (isSupportedMoveSelectedSegment(segment.effect)) {
      return true;
    }
    if (isSupportedActivateSegment(segment.effect)) {
      return true;
    }
    return false;
  });
};

const isActivateMainAreaZone = (
  zone: EffectQueueEntry["source"]["zone"],
): zone is NonNullable<EffectQueueEntry["source"]["zone"]> =>
  zone?.zone === "leaderArea" ||
  zone?.zone === "characterArea" ||
  zone?.zone === "stageArea";

const isScopedActivateMainSequenceEntry = (entry: EffectQueueEntry): boolean =>
  entry.causedBy.type === "ruleProcess" &&
  entry.causedBy.name === "effectRuntime:activateMain" &&
  String(entry.id).startsWith("queue-entry:activate-main:") &&
  String(entry.timingWindowId).startsWith("timing-window:activate-main:") &&
  entry.generation === 0 &&
  entry.triggerEventId === undefined &&
  entry.sourcePresencePolicy === "mustRemainInSameZone" &&
  isActivateMainAreaZone(entry.source.zone) &&
  isActivateMainAreaZone(entry.sourceSnapshot.zone);

export const toSupportedSequenceBlock = (
  entry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number] | undefined,
  options: SequenceSupportOptions = {},
): SupportedSequenceBlock | undefined => {
  const flattenedBlock = toFlattenedSequenceBlock(effectBlock);
  const allowSavedReferences = options.allowSavedReferences ?? true;
  const requirePositiveDrawCount = options.requirePositiveDrawCount ?? false;
  const isSupportedCategoryForEntry =
    flattenedBlock?.category === "auto" ||
    (flattenedBlock?.category === "activate" &&
      flattenedBlock.trigger.type === "activateMain" &&
      isScopedActivateMainSequenceEntry(entry)) ||
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
    return undefined;
  }

  const supportState = {
    hasPendingDecisionSegment: false,
    selectFromSetSelections: new Set<string>(),
  };
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
        if (index === 0) {
          return false;
        }
        supportState.hasPendingDecisionSegment = true;
        return true;
      }
      if (isSupportedMoveCardsSegment(segment.effect)) {
        return true;
      }
      if (isSupportedReturnDonSegment(segment.effect)) {
        return true;
      }
      if (isSupportedSearchSegment(segment.effect)) {
        supportState.hasPendingDecisionSegment = true;
        return true;
      }
      if (isSupportedPlaceTopDeckCardsSegment(segment.effect)) {
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
        return true;
      }
      if (isSupportedSelectFromSetSegment(segment.effect)) {
        supportState.hasPendingDecisionSegment = true;
        supportState.selectFromSetSelections.add(String(segment.effect.saveAs));
        return true;
      }
      if (isSupportedPlaceSetRemainderSegment(segment.effect)) {
        if (
          segment.effect.order === "chooser" &&
          segment.effect.position !== "bottom"
        ) {
          return false;
        }
        supportState.hasPendingDecisionSegment = true;
        return true;
      }
      if (isSupportedSequenceSelectCardsSegment(segment.effect)) {
        supportState.hasPendingDecisionSegment = true;
        return true;
      }
      if (isSupportedMoveSelectedSegment(segment.effect)) {
        return true;
      }
      if (isSupportedAttachSelectedDonSegment(segment.effect)) {
        return true;
      }
      if (isSupportedTrashSegment(segment.effect)) {
        return true;
      }
      if (isSupportedContinuousQueueEffect(segment.effect)) {
        if (
          flattenedBlock.sourcePresencePolicy !== "mustRemainInSameZone" &&
          isSourceDependentContinuousSegment(segment.effect)
        ) {
          return false;
        }
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
        supportState.hasPendingDecisionSegment = true;
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
      if (isSupportedSavedTargetContinuousSegment(segment.effect)) {
        return true;
      }
      if (isSupportedConditionalContinuousSegment(segment.effect)) {
        return true;
      }
      if (isSupportedConditionalSegment(segment.effect)) {
        supportState.hasPendingDecisionSegment = true;
        return true;
      }
      if (segment.effect.type === "choice") {
        supportState.hasPendingDecisionSegment = true;
        return isSupportedChoiceEffect(segment.effect, (effect) =>
          isSupportedSequenceBlock(
            entry,
            { ...flattenedBlock, effect },
            options,
          ),
        );
      }
      if (segment.effect.type === "playSelected") {
        return (
          segment.effect.ignoreCost === true &&
          (segment.effect.enterRested === undefined ||
            typeof segment.effect.enterRested === "boolean") &&
          (supportState.selectFromSetSelections.has(
            String(segment.effect.selection),
          ) ||
            String(segment.effect.selection).startsWith("handSelection:") ||
            String(segment.effect.selection).startsWith("trashSelection:") ||
            String(segment.effect.selection).startsWith("revealSelection:"))
        );
      }
      if (segment.effect.type === "activateSelectedEvent") {
        return (
          segment.effect.ignoreCost &&
          segment.effect.trigger.type === "main" &&
          String(segment.effect.selection).startsWith("handSelection:")
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
  return allSegmentsSupported
    ? (flattenedBlock as SupportedSequenceBlock)
    : undefined;
};

export const isSupportedSequenceBlock = (
  entry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number] | undefined,
  options: SequenceSupportOptions = {},
): effectBlock is SupportedSequenceBlock =>
  toSupportedSequenceBlock(entry, effectBlock, options) !== undefined;

export const isSupportedQueuedAutoSequenceForEntryPoint = (
  effect: EffectDefinition["effects"][number],
  triggerType:
    | "onPlay"
    | "whenAttacking"
    | "onKO"
    | "onOpponentAttack"
    | "endOfYourTurn"
    | "main"
    | "trigger"
    | "counter"
    | "lifeRemoved"
    | "handTrashedByEffect"
    | "opponentActivated",
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"],
  options: SequenceSupportOptions = {},
): effect is SupportedSequenceBlock =>
  effect.category === "auto" &&
  effect.trigger.type === triggerType &&
  effect.sourcePresencePolicy === sourcePresencePolicy &&
  isSupportedSequenceBlock(
    toSyntheticQueueEntry(sourcePresencePolicy),
    effect,
    {
      allowSavedReferences: options.allowSavedReferences ?? true,
      requirePositiveDrawCount: options.requirePositiveDrawCount ?? true,
    },
  );
