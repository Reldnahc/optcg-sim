import type {
  Cost,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  ActivateSelectedEventEffect,
  PlaySelectedEffect,
  SelectTargetsEffect,
  SelectCardsEffect,
  MultiZoneTargetRequest,
  Target,
  CardFilter,
  Duration,
  TargetRequest,
} from "@optcg/types";

import { isSupportedHandSelectionCardFilter } from "../actions/state.js";
import { isSupportedContinuousQueueEffect } from "../runtime/continuous/continuous.js";
import { isSupportedQueuedEffectConditionShape } from "../effect-runtime-conditions.js";
import { isSupportedMoveCardsEffect } from "../effect-runtime-move-cards.js";
import { isSupportedSearchRequestShape } from "../effect-runtime-search-reveal.js";
import { isSupportedPlaceTopDeckCardsEffect } from "../effect-runtime-top-deck-placement.js";
import {
  isSupportedAttachDonTargetFilter,
  isSupportedPublicFieldTargetFilter,
} from "./support-filters.js";
import { isSupportedChoiceEffect } from "./choice-support.js";
import {
  flattenSequenceEffect,
  toFlattenedSequenceBlock,
  toSingleEffectSequence,
  toSyntheticQueueEntry,
} from "./support-normalization.js";
import { isScopedActivatedReactionQueueEntry } from "../runtime/optional-activation/event-reaction-support.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegmentEffect = SequenceEffect["effects"][number]["effect"];
type DrawEffect = Extract<Effect, { type: "draw" }>;
type DrawUpToEffect = Extract<Effect, { type: "drawUpTo" }>;
type MoveCardsEffect = Extract<Effect, { type: "moveCards" }>;
type ReturnDonEffect = Extract<Effect, { type: "returnDon" }>;
type TrashFromHandEffect = Extract<Effect, { type: "trashFromHand" }>;
type SearchEffect = Extract<Effect, { type: "search" }>;
type PlaceTopDeckCardsEffect = Extract<Effect, { type: "placeTopDeckCards" }>;
type PayCostEffect = Extract<SequenceSegmentEffect, { type: "payCost" }>;
type MoveSelectedEffect = Extract<Effect, { type: "moveSelected" }>;
type AttachSelectedDonEffect = Extract<Effect, { type: "attachSelectedDon" }>;
type PlaySourceEffect = Extract<Effect, { type: "playSource" }>;
type RevealTopEffect = Extract<Effect, { type: "revealTop" }>;
type SelectFromSetEffect = Extract<Effect, { type: "selectFromSet" }>;
type BounceEffect = Extract<Effect, { type: "bounce" }> & {
  target: Extract<Target, { type: "savedFieldObject" }>;
  destination: "deckBottom" | "hand";
};
type DirectContinuousEffect = Extract<
  Effect,
  {
    type:
      | "modifyPower"
      | "giveKeyword"
      | "setBasePower"
      | "modifyCost"
      | "modifyCounter"
      | "preventDraw"
      | "preventDonActivation"
      | "preventPlay"
      | "invalidateEffects"
      | "cannotBecomeActive"
      | "cannotAttack"
      | "cannotBlock"
      | "preventBlockerActivation";
  }
>;
type SavedFieldObjectTrashEffect = Extract<Effect, { type: "trash" }> & {
  target: Extract<Target, { type: "savedFieldObject" }>;
};
type AllTargetTrashEffect = Extract<Effect, { type: "trash" }> & {
  target: Extract<Target, { type: "all" }>;
};
type TrashEffect = SavedFieldObjectTrashEffect | AllTargetTrashEffect;
type RestEffect = Extract<Effect, { type: "rest" }> & {
  target: Extract<
    Target,
    { type: "choose" | "chooseFromZones" | "savedFieldObject" }
  >;
};
type ActivateEffect = Extract<Effect, { type: "activate" }> & {
  target: Extract<Target, { type: "savedFieldObject" }>;
};
type ConditionalContinuousEffect = Extract<Effect, { type: "conditional" }> & {
  then:
    | Extract<Effect, { type: "modifyPower" }>
    | Extract<Effect, { type: "preventDonActivation" }>
    | Extract<Effect, { type: "preventPlay" }>
    | Extract<Effect, { type: "invalidateEffects" }>
    | Extract<Effect, { type: "cannotBecomeActive" }>
    | Extract<Effect, { type: "cannotAttack" }>
    | Extract<Effect, { type: "cannotBlock" }>
    | Extract<Effect, { type: "preventBlockerActivation" }>;
};
type ConditionalSequenceEffect = Extract<Effect, { type: "conditional" }> & {
  then: SequenceEffect;
};
type ConditionalEffect = Extract<Effect, { type: "conditional" }>;
type SavedTargetContinuousEffect = (
  | Extract<Effect, { type: "modifyPower" }>
  | Extract<Effect, { type: "cannotBecomeActive" }>
  | Extract<Effect, { type: "cannotAttack" }>
  | Extract<Effect, { type: "cannotBlock" }>
  | Extract<Effect, { type: "preventBlockerActivation" }>
  | Extract<Effect, { type: "invalidateEffects" }>
) & {
  target: Extract<Target, { type: "savedFieldObject" }>;
};
type SavedFieldObjectKoEffect = Extract<Effect, { type: "ko" }> & {
  target: Extract<Target, { type: "savedFieldObject" }>;
};
type AllTargetKoEffect = Extract<Effect, { type: "ko" }> & {
  target: Extract<Target, { type: "all" }>;
};
type KoEffect = SavedFieldObjectKoEffect | AllTargetKoEffect;

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

const isSupportedDrawSegment = (
  effect: SequenceSegmentEffect,
): effect is DrawEffect =>
  effect.type === "draw" &&
  effect.player === "self" &&
  Number.isInteger(effect.count) &&
  effect.count >= 0;

const isSupportedDrawUpToSegment = (
  effect: SequenceSegmentEffect,
): effect is DrawUpToEffect =>
  effect.type === "drawUpTo" &&
  effect.player === "self" &&
  Number.isInteger(effect.count) &&
  effect.count >= 0;

const isSupportedTrashFromHandSegment = (
  effect: SequenceSegmentEffect,
): effect is TrashFromHandEffect =>
  effect.type === "trashFromHand" &&
  (effect.player === "self" || effect.player === "opponent") &&
  effect.chooser === effect.player &&
  effect.filter === undefined &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

const isSupportedMoveCardsSegment = (
  effect: SequenceSegmentEffect,
): effect is MoveCardsEffect =>
  effect.type === "moveCards" && isSupportedMoveCardsEffect(effect);

const isSupportedReturnDonSegment = (
  effect: SequenceSegmentEffect,
): effect is ReturnDonEffect =>
  effect.type === "returnDon" &&
  effect.player === "opponent" &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

const isSupportedSearchSegment = (
  effect: SequenceSegmentEffect,
): effect is SearchEffect =>
  effect.type === "search" && isSupportedSearchRequestShape(effect.request);

const isSupportedPlaceTopDeckCardsSegment = (
  effect: SequenceSegmentEffect,
): effect is PlaceTopDeckCardsEffect =>
  effect.type === "placeTopDeckCards" &&
  isSupportedPlaceTopDeckCardsEffect(effect);

const isSupportedPayCostSegment = (
  effect: SequenceSegmentEffect,
): effect is PayCostEffect => {
  if (effect.type !== "payCost") {
    return false;
  }
  const cost = effect.cost;
  if (cost.type === "chooseOne") {
    const hasSupportedSelfOptionalPositiveCount = (option: unknown): boolean =>
      typeof option === "object" &&
      option !== null &&
      (option as Record<string, unknown>)["chooser"] === "self" &&
      (option as Record<string, unknown>)["optional"] === true &&
      Number.isInteger((option as Record<string, unknown>)["count"]) &&
      ((option as Record<string, unknown>)["count"] as number) > 0;
    const hasSupportedSelfOptionalHand = (option: unknown): boolean => {
      if (!hasSupportedSelfOptionalPositiveCount(option)) {
        return false;
      }
      return (
        typeof option === "object" &&
        option !== null &&
        isSupportedHandSelectionCardFilter(
          (option as { filter?: CardFilter }).filter,
        )
      );
    };
    return cost.options.every((option) => {
      if (option.type === "trashFromHand") {
        return hasSupportedSelfOptionalHand(option);
      }
      return (
        hasSupportedSelfOptionalPositiveCount(option) &&
        isSupportedHandSelectionCardFilter(option.filter)
      );
    });
  }
  if (cost.type === "restSelf") {
    return true;
  }
  if (cost.type === "attachDon") {
    return (
      Number.isInteger(cost.count) &&
      cost.count > 0 &&
      cost.target.type === "chooseFromZones" &&
      isSupportedAttachDonCostTarget(cost.target)
    );
  }
  if (cost.type === "trashSelf") {
    return true;
  }
  if (cost.type === "turnLifeFaceUp") {
    return (
      cost.player === "self" && Number.isInteger(cost.count) && cost.count > 0
    );
  }
  if (cost.type === "modifyPower") {
    return (
      cost.target.type === "myLeader" &&
      Number.isSafeInteger(cost.value) &&
      cost.value !== 0 &&
      isSupportedSequenceContinuousDuration(cost.duration)
    );
  }
  return (
    (cost.type === "restDon" ||
      cost.type === "returnDon" ||
      cost.type === "trashFromHand" ||
      cost.type === "revealFromHand" ||
      cost.type === "moveCards") &&
    (cost.chooser === undefined || cost.chooser === "self") &&
    (cost.type !== "trashFromHand" ||
      isSupportedHandSelectionCardFilter(cost.filter)) &&
    (cost.type !== "revealFromHand" ||
      isSupportedHandSelectionCardFilter(cost.filter)) &&
    (cost.type !== "moveCards" ||
      (isSupportedMoveCardsCostRoute(cost) &&
        isSupportedHandSelectionCardFilter(cost.filter))) &&
    Number.isInteger(cost.count) &&
    cost.count > 0
  );
};

const isSupportedMoveCardsCostRoute = (
  cost: Extract<Cost, { type: "moveCards" }>,
): boolean => {
  if (cost.from.player !== "self" || cost.to.player !== "self") {
    return false;
  }
  if (
    cost.from.zone === "trash" &&
    cost.from.position === undefined &&
    cost.to.zone === "deck" &&
    cost.to.position === "bottom"
  ) {
    return true;
  }
  if (
    cost.from.zone === "hand" &&
    cost.from.position === undefined &&
    cost.to.zone === "deck" &&
    cost.to.position === "top"
  ) {
    return cost.count === 1;
  }
  if (
    cost.from.zone === "deck" &&
    cost.from.position === "top" &&
    cost.to.zone === "trash" &&
    cost.to.position === undefined
  ) {
    return true;
  }
  if (
    cost.from.zone === "life" &&
    cost.from.position === "top" &&
    cost.to.zone === "trash" &&
    cost.to.position === undefined
  ) {
    return true;
  }
  return (
    cost.from.zone === "life" &&
    (cost.from.position === "top" ||
      cost.from.position === "bottom" ||
      cost.from.position === "topOrBottom") &&
    cost.to.zone === "hand" &&
    cost.to.position === undefined
  );
};

const isSupportedAttachDonCostTarget = (
  target: Extract<Target, { type: "chooseFromZones" }>,
): boolean => {
  const request = target.request;
  return (
    request.timing === "onResolution" &&
    request.chooser === "self" &&
    request.player === "self" &&
    request.zones.length === 2 &&
    request.zones[0] === "leaderArea" &&
    request.zones[1] === "characterArea" &&
    request.min === 1 &&
    request.max === 1 &&
    !request.allowFewerIfUnavailable &&
    request.visibility === "public" &&
    isSupportedAttachDonTargetFilter(request.filter)
  );
};

const isSupportedSequenceSelectCardsSegment = (
  effect: SequenceSegmentEffect,
): effect is SelectCardsEffect =>
  effect.type === "selectCards" &&
  isSupportedHandSelectionCardFilter(effect.filter) &&
  Number.isInteger(effect.min) &&
  Number.isInteger(effect.max) &&
  effect.min >= 0 &&
  effect.max >= effect.min &&
  ((effect.zone === "hand" &&
    effect.player === effect.chooser &&
    (effect.player === "self" || effect.player === "opponent") &&
    effect.visibility === "chooserOnly" &&
    String(effect.saveAs).startsWith("handSelection:")) ||
    (effect.zone === "trash" &&
      effect.player === "self" &&
      effect.chooser === "self" &&
      effect.visibility === "bothPlayers" &&
      String(effect.saveAs).startsWith("trashSelection:")) ||
    (effect.zone === "costArea" &&
      effect.player === "self" &&
      effect.chooser === "self" &&
      effect.visibility === "bothPlayers" &&
      String(effect.saveAs).startsWith("donSelection:")));

const isSupportedTrashToHandMoveSelectedSegment = (
  effect: SequenceSegmentEffect,
): effect is MoveSelectedEffect =>
  effect.type === "moveSelected" &&
  ((effect.from === "trash" &&
    effect.to === "hand" &&
    effect.position === undefined &&
    effect.destinationFaceUp === undefined &&
    String(effect.selection).startsWith("trashSelection:")) ||
    (effect.from === "trash" &&
      effect.to === "life" &&
      effect.position === "top" &&
      String(effect.selection).startsWith("trashSelection:")) ||
    (effect.from === "hand" &&
      effect.to === "deck" &&
      (effect.position === "top" ||
        effect.position === "bottom" ||
        effect.position === "topOrBottom") &&
      effect.destinationFaceUp === undefined &&
      String(effect.selection).startsWith("handSelection:")));

const isSupportedAttachSelectedDonSegment = (
  effect: SequenceSegmentEffect,
): effect is AttachSelectedDonEffect =>
  effect.type === "attachSelectedDon" &&
  String(effect.selection).startsWith("donSelection:") &&
  effect.target.type === "savedFieldObject" &&
  effect.target.player === "self" &&
  ((effect.target.zone === "characterArea" &&
    effect.target.zones === undefined) ||
    (effect.target.zone === undefined &&
      effect.target.zones?.every(
        (zone) => zone === "leaderArea" || zone === "characterArea",
      ) === true)) &&
  effect.target.controller === undefined &&
  effect.target.binding.family === "selectedTargets" &&
  isSupportedAttachDonTargetFilter(effect.target.filter);

const isSupportedPlaySourceSegment = (
  effect: SequenceSegmentEffect,
): effect is PlaySourceEffect =>
  effect.type === "playSource" &&
  effect.source.type === "triggerCard" &&
  effect.ignoreCost === true;

const isSupportedRevealTopSegment = (
  effect: SequenceSegmentEffect,
): effect is RevealTopEffect =>
  effect.type === "revealTop" &&
  effect.player === "self" &&
  (effect.zone === undefined ||
    effect.zone === "deck" ||
    effect.zone === "life") &&
  effect.visibility === "bothPlayers" &&
  Number.isInteger(effect.count) &&
  effect.count > 0 &&
  (effect.min === undefined ||
    (Number.isInteger(effect.min) &&
      effect.min >= 0 &&
      effect.min <= effect.count));

const isSupportedSelectFromSetSegment = (
  effect: SequenceSegmentEffect,
): effect is SelectFromSetEffect =>
  effect.type === "selectFromSet" &&
  effect.chooser === "self" &&
  Number.isInteger(effect.min) &&
  Number.isInteger(effect.max) &&
  effect.min >= 0 &&
  effect.max >= effect.min &&
  isSupportedHandSelectionCardFilter(effect.filter);

const isSupportedSavedFieldObjectKoTarget = (
  target: Target,
): target is Extract<Target, { type: "savedFieldObject" }> =>
  target.type === "savedFieldObject" &&
  (target.zone === "characterArea" || target.zone === "stageArea") &&
  target.zones === undefined &&
  (target.player === "self" ||
    target.player === "opponent" ||
    target.player === "anyPlayer") &&
  target.controller === undefined &&
  target.filter === undefined;

const isSupportedSavedLeaderOrCharacterTarget = (
  target: Target,
): target is Extract<Target, { type: "savedFieldObject" }> =>
  target.type === "savedFieldObject" &&
  (target.zone === "leaderArea" ||
    target.zone === "characterArea" ||
    target.zones?.every(
      (zone) => zone === "leaderArea" || zone === "characterArea",
    ) === true) &&
  (target.player === "self" ||
    target.player === "opponent" ||
    target.player === "anyPlayer") &&
  target.controller === undefined &&
  target.filter === undefined;

const isSupportedKoSegment = (
  effect: SequenceSegmentEffect,
): effect is KoEffect =>
  effect.type === "ko" &&
  (isSupportedSavedFieldObjectKoTarget(effect.target) ||
    (effect.target.type === "all" &&
      effect.target.zone === "characterArea" &&
      (effect.target.player === "self" ||
        effect.target.player === "opponent") &&
      isSupportedPublicFieldTargetFilter(effect.target.filter)));

const isSupportedBounceSegment = (
  effect: SequenceSegmentEffect,
): effect is BounceEffect =>
  effect.type === "bounce" &&
  (effect.destination === "hand" || effect.destination === "deckBottom") &&
  isSupportedSavedFieldObjectKoTarget(effect.target);

const isSupportedSequenceTargetRequest = (
  request:
    | SelectTargetsEffect["request"]
    | TargetRequest
    | MultiZoneTargetRequest,
): boolean => {
  const zones: readonly string[] =
    "zones" in request ? request.zones : [request.zone];
  const maxSupportedTargetCount = zones.includes("costArea") ? 10 : 5;
  return (
    request.timing === "onResolution" &&
    request.chooser === "self" &&
    zones.every(
      (zone) =>
        zone === "leaderArea" ||
        zone === "characterArea" ||
        zone === "stageArea" ||
        zone === "costArea",
    ) &&
    (request.player === "self" ||
      request.player === "opponent" ||
      request.player === "anyPlayer") &&
    Number.isInteger(request.min) &&
    Number.isInteger(request.max) &&
    request.min >= 0 &&
    request.min <= request.max &&
    request.max <= maxSupportedTargetCount &&
    isSupportedPublicFieldTargetFilter(request.filter)
  );
};

const isSupportedAllFieldTrashSegment = (
  effect: SequenceSegmentEffect,
): effect is AllTargetTrashEffect =>
  effect.type === "trash" &&
  effect.target.type === "all" &&
  (effect.target.zone === "characterArea" ||
    effect.target.zone === "stageArea") &&
  (effect.target.player === "self" || effect.target.player === "opponent") &&
  isSupportedPublicFieldTargetFilter(effect.target.filter);

const isSupportedTrashSegment = (
  effect: SequenceSegmentEffect,
): effect is TrashEffect =>
  effect.type === "trash" &&
  (isSupportedAllFieldTrashSegment(effect) ||
    isSupportedSavedFieldObjectKoTarget(effect.target));

const isSupportedRestSegment = (
  effect: SequenceSegmentEffect,
): effect is RestEffect =>
  effect.type === "rest" &&
  (isSupportedSavedFieldObjectKoTarget(effect.target) ||
    ((effect.target.type === "choose" ||
      effect.target.type === "chooseFromZones") &&
      isSupportedSequenceTargetRequest(effect.target.request)));

const isSupportedActivateSegment = (
  effect: SequenceSegmentEffect,
): effect is Extract<SequenceSegmentEffect, { type: "activate" }> =>
  effect.type === "activate" &&
  ((effect.target.type === "savedFieldObject" &&
    (effect.target.zone === "costArea" ||
      effect.target.zone === "characterArea") &&
    (effect.target.player === "self" || effect.target.player === "opponent") &&
    effect.target.controller === undefined &&
    effect.target.filter === undefined &&
    effect.target.binding.family === "selectedTargets") ||
    effect.target.type === "myLeader" ||
    (effect.target.type === "all" &&
      effect.target.player === "self" &&
      effect.target.zone === "characterArea" &&
      isSupportedPublicFieldTargetFilter(effect.target.filter)));

const isSupportedSequenceContinuousDuration = (duration: Duration): boolean =>
  duration.type === "thisBattle" ||
  duration.type === "thisTurn" ||
  duration.type === "whileSourceOnField" ||
  duration.type === "permanent" ||
  duration.type === "untilEndOfNextTurn" ||
  duration.type === "untilStartOfNextTurn" ||
  duration.type === "untilEndOfTurn";

const isSourceDependentContinuousSegment = (
  effect: SequenceSegmentEffect,
): boolean => {
  if (
    effect.type !== "modifyPower" &&
    effect.type !== "cannotAttack" &&
    effect.type !== "setBasePower" &&
    effect.type !== "cannotBlock" &&
    effect.type !== "preventBlockerActivation"
  ) {
    return false;
  }
  return (
    effect.target.type === "self" ||
    effect.duration.type === "whileSourceOnField"
  );
};

const isSupportedSavedTargetContinuousSegment = (
  effect: SequenceSegmentEffect,
): effect is SavedTargetContinuousEffect =>
  (effect.type === "modifyPower" ||
    effect.type === "cannotBecomeActive" ||
    effect.type === "cannotAttack" ||
    effect.type === "cannotBlock" ||
    effect.type === "preventBlockerActivation" ||
    effect.type === "invalidateEffects") &&
  (effect.type === "modifyPower" ||
  effect.type === "preventBlockerActivation" ||
  effect.type === "invalidateEffects"
    ? isSupportedSavedLeaderOrCharacterTarget(effect.target)
    : isSupportedSavedFieldObjectKoTarget(effect.target)) &&
  (effect.type !== "modifyPower" ||
    (typeof effect.value === "number" && Number.isSafeInteger(effect.value))) &&
  isSupportedSequenceContinuousDuration(effect.duration);

const isSupportedConditionalContinuousSegment = (
  effect: SequenceSegmentEffect,
): effect is ConditionalContinuousEffect =>
  effect.type === "conditional" &&
  effect.else === undefined &&
  isSupportedQueuedEffectConditionShape(effect.if) &&
  isSupportedContinuousQueueEffect(effect.then);

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
    if (isSupportedTrashToHandMoveSelectedSegment(segment.effect)) {
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

  const supportState = { hasPendingDecisionSegment: false };
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
        return true;
      }
      if (isSupportedSequenceSelectCardsSegment(segment.effect)) {
        supportState.hasPendingDecisionSegment = true;
        return true;
      }
      if (isSupportedTrashToHandMoveSelectedSegment(segment.effect)) {
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
          (String(segment.effect.selection).startsWith("handSelection:") ||
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
