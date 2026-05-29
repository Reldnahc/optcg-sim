import type {
  Cost,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  OptionalCost,
  PlaySelectedEffect,
  SelectTargetsEffect,
  SelectCardsEffect,
  Target,
  CardFilter,
  Duration,
} from "@optcg/types";

import { isSupportedHandSelectionCardFilter } from "./action-state.js";
import { isSupportedContinuousQueueEffect } from "./effect-runtime-continuous.js";
import { isSupportedQueuedEffectConditionShape } from "./effect-runtime-conditions.js";
import { isSupportedMoveCardsEffect } from "./effect-runtime-move-cards.js";
import { isSupportedSearchRequestShape } from "./effect-runtime-search-reveal.js";
import { isSupportedPlaceTopDeckCardsEffect } from "./effect-runtime-top-deck-placement.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegmentEffect = SequenceEffect["effects"][number]["effect"];
type DrawEffect = Extract<Effect, { type: "draw" }>;
type DrawUpToEffect = Extract<Effect, { type: "drawUpTo" }>;
type MoveCardsEffect = Extract<Effect, { type: "moveCards" }>;
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
  destination: "hand";
};
type DirectContinuousEffect = Extract<
  Effect,
  {
    type:
      | "modifyPower"
      | "giveKeyword"
      | "modifyCost"
      | "preventDraw"
      | "invalidateEffects"
      | "cannotBecomeActive"
      | "cannotAttack"
      | "cannotBlock";
  }
>;
type TrashEffect = Extract<Effect, { type: "trash" }>;
type RestEffect = Extract<Effect, { type: "rest" }> & {
  target: Extract<Target, { type: "savedFieldObject" }>;
};
type ActivateEffect = Extract<Effect, { type: "activate" }> & {
  target: Extract<Target, { type: "savedFieldObject" }>;
};
type ConditionalContinuousEffect = Extract<Effect, { type: "conditional" }> & {
  then:
    | Extract<Effect, { type: "modifyPower" }>
    | Extract<Effect, { type: "invalidateEffects" }>
    | Extract<Effect, { type: "cannotBecomeActive" }>
    | Extract<Effect, { type: "cannotAttack" }>
    | Extract<Effect, { type: "cannotBlock" }>;
};
type ConditionalSequenceEffect = Extract<Effect, { type: "conditional" }> & {
  then: SequenceEffect;
};
type ConditionalEffect = Extract<Effect, { type: "conditional" }>;
type SavedTargetContinuousEffect = (
  | Extract<Effect, { type: "cannotBecomeActive" }>
  | Extract<Effect, { type: "cannotAttack" }>
  | Extract<Effect, { type: "cannotBlock" }>
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
    | RestEffect
    | ActivateEffect
    | SavedTargetContinuousEffect
    | ConditionalContinuousEffect
    | ConditionalSequenceEffect
    | ConditionalEffect
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

const flattenNestedSequenceSegments = (
  segment: SequenceEffect["effects"][number],
): SequenceEffect["effects"] | null => {
  if (segment.effect.type === "payCost") {
    return flattenPayCostSequenceSegment(segment);
  }
  if (segment.effect.type !== "sequence") {
    return [segment];
  }
  if (segment.optional === true || segment.saveResultAs !== undefined) {
    return null;
  }
  const flattened = flattenSequenceEffect(segment.effect);
  if (flattened === null) {
    return null;
  }
  return flattened.effects.map((child, index) =>
    index === 0 ? { ...child, connector: segment.connector } : child,
  );
};

const toOptionalCost = (cost: Cost): OptionalCost | undefined => {
  switch (cost.type) {
    case "restSelf":
      return { type: "restSelf", optional: true };
    case "restDon":
      return { ...cost, optional: true };
    case "returnDon":
      return { ...cost, optional: true };
    case "trashFromHand":
      return { ...cost, optional: true };
    case "moveCards":
      return { ...cost, optional: true };
    case "turnLifeFaceUp":
      return { ...cost, optional: true };
    case "sequence":
    case "trashSelf":
    case "discard":
    case "custom":
      return undefined;
  }
};

const flattenPayCostSequenceSegment = (
  segment: SequenceEffect["effects"][number],
): SequenceEffect["effects"] | null => {
  if (
    segment.effect.type !== "payCost" ||
    segment.effect.cost.type !== "sequence"
  ) {
    return [segment];
  }
  if (segment.optional === true) {
    return null;
  }
  const costs = segment.effect.cost.costs
    .map(toOptionalCost)
    .filter((cost): cost is OptionalCost => cost !== undefined);
  if (costs.length !== segment.effect.cost.costs.length || costs.length === 0) {
    return null;
  }
  return costs.map((cost, index) => ({
    id: `${segment.id ?? "pay-cost"}:${String(index)}`,
    connector: index === 0 ? segment.connector : "ifYouDo",
    ...(index === costs.length - 1 && segment.saveResultAs !== undefined
      ? { saveResultAs: segment.saveResultAs }
      : {}),
    effect: { type: "payCost", cost },
  }));
};

export const flattenSequenceEffect = (
  effect: SequenceEffect,
): SequenceEffect | null => {
  const effects: SequenceEffect["effects"] = [];
  for (const segment of effect.effects) {
    const flattened = flattenNestedSequenceSegments(segment);
    if (flattened === null) {
      return null;
    }
    effects.push(...flattened);
  }
  return { ...effect, effects };
};

const toSingleEffectSequence = (effect: Effect): SequenceEffect => ({
  type: "sequence",
  effects: [{ connector: "always", effect }],
});

const toFlattenedSequenceBlock = (
  effectBlock: EffectDefinition["effects"][number] | undefined,
): EffectDefinition["effects"][number] | undefined => {
  if (effectBlock?.effect.type !== "sequence") {
    return effectBlock;
  }
  const flattened = flattenSequenceEffect(effectBlock.effect);
  if (flattened === null) {
    return undefined;
  }
  return { ...effectBlock, effect: flattened };
};

const toSyntheticQueueEntry = (
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"],
): EffectQueueEntry => ({
  id: "queue-entry:sequence-support:synthetic" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "timing-window:sequence-support:synthetic" as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: "player-1" as EffectQueueEntry["controllerId"],
  source: {
    instanceId:
      "instance:synthetic" as EffectQueueEntry["source"]["instanceId"],
    cardId: "card:synthetic" as EffectQueueEntry["source"]["cardId"],
    playerId: "player-1" as EffectQueueEntry["source"]["playerId"],
    zone: {
      zone: "characterArea",
      playerId: "player-1" as EffectQueueEntry["source"]["playerId"],
      slot: "character",
      index: 0,
    },
  },
  sourceSnapshot: {
    instanceId:
      "instance:synthetic" as EffectQueueEntry["sourceSnapshot"]["instanceId"],
    cardId: "card:synthetic" as EffectQueueEntry["sourceSnapshot"]["cardId"],
    ownerId: "player-1" as EffectQueueEntry["sourceSnapshot"]["ownerId"],
    controllerId:
      "player-1" as EffectQueueEntry["sourceSnapshot"]["controllerId"],
    zone: {
      zone: "characterArea",
      playerId: "player-1" as EffectQueueEntry["source"]["playerId"],
      slot: "character",
      index: 0,
    },
    category: "character",
    colors: [],
    keywords: [],
  },
  effectBlockId: "effect:synthetic" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy,
  causedBy: {
    type: "ruleProcess",
    name: "effectRuntime:sequenceSupportPreflight",
  },
});

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
    const hasSupportedSelfOptionalUnfilteredHand = (
      option: unknown,
    ): boolean => {
      if (!hasSupportedSelfOptionalPositiveCount(option)) {
        return false;
      }
      return (
        typeof option === "object" && option !== null && !("filter" in option)
      );
    };
    const hasSupportedFieldFilter = (
      filter: unknown,
    ): filter is {
      categories: ["character"];
      typesAny: [string, ...string[]];
    } =>
      typeof filter === "object" &&
      filter !== null &&
      Array.isArray((filter as { categories?: unknown }).categories) &&
      (filter as { categories: unknown[] }).categories.length === 1 &&
      (filter as { categories: unknown[] }).categories[0] === "character" &&
      Array.isArray((filter as { typesAny?: unknown }).typesAny) &&
      (filter as { typesAny: unknown[] }).typesAny.length > 0 &&
      (filter as { typesAny: unknown[] }).typesAny.every(
        (typeName) => typeof typeName === "string",
      );
    return cost.options.every((option) => {
      if (option.type === "trashFromHand") {
        return hasSupportedSelfOptionalUnfilteredHand(option);
      }
      return (
        hasSupportedSelfOptionalPositiveCount(option) &&
        hasSupportedFieldFilter(option.filter)
      );
    });
  }
  if (cost.type === "restSelf") {
    return true;
  }
  if (cost.type === "turnLifeFaceUp") {
    return (
      cost.player === "self" && Number.isInteger(cost.count) && cost.count > 0
    );
  }
  return (
    (cost.type === "restDon" ||
      cost.type === "returnDon" ||
      cost.type === "trashFromHand" ||
      cost.type === "moveCards") &&
    (cost.chooser === undefined || cost.chooser === "self") &&
    (cost.type !== "trashFromHand" || cost.filter === undefined) &&
    (cost.type !== "moveCards" || isSupportedMoveCardsCostRoute(cost)) &&
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
  return (
    cost.from.zone === "life" &&
    (cost.from.position === "top" ||
      cost.from.position === "bottom" ||
      cost.from.position === "topOrBottom") &&
    cost.to.zone === "hand" &&
    cost.to.position === undefined
  );
};

const isSupportedSequenceSelectCardsSegment = (
  effect: SequenceSegmentEffect,
): effect is SelectCardsEffect =>
  effect.type === "selectCards" &&
  effect.player === "self" &&
  effect.chooser === "self" &&
  isSupportedHandSelectionCardFilter(effect.filter) &&
  Number.isInteger(effect.min) &&
  Number.isInteger(effect.max) &&
  effect.min >= 0 &&
  effect.max >= effect.min &&
  ((effect.zone === "hand" &&
    effect.visibility === "chooserOnly" &&
    String(effect.saveAs).startsWith("handSelection:")) ||
    (effect.zone === "trash" &&
      effect.visibility === "bothPlayers" &&
      String(effect.saveAs).startsWith("trashSelection:")) ||
    (effect.zone === "costArea" &&
      effect.visibility === "bothPlayers" &&
      String(effect.saveAs).startsWith("donSelection:")));

const isSupportedTrashToHandMoveSelectedSegment = (
  effect: SequenceSegmentEffect,
): effect is MoveSelectedEffect =>
  effect.type === "moveSelected" &&
  effect.from === "trash" &&
  effect.to === "hand" &&
  effect.position === undefined &&
  String(effect.selection).startsWith("trashSelection:");

const isSupportedAttachSelectedDonSegment = (
  effect: SequenceSegmentEffect,
): effect is AttachSelectedDonEffect =>
  effect.type === "attachSelectedDon" &&
  String(effect.selection).startsWith("donSelection:") &&
  effect.target.type === "savedFieldObject" &&
  effect.target.player === "self" &&
  effect.target.zone === "characterArea" &&
  effect.target.controller === undefined &&
  effect.target.binding.family === "selectedTargets" &&
  isSupportedAttachDonTargetFilter(effect.target.filter);

const isSupportedPlaySourceSegment = (
  effect: SequenceSegmentEffect,
): effect is PlaySourceEffect =>
  effect.type === "playSource" &&
  effect.source.type === "triggerCard" &&
  effect.ignoreCost === true;

const isSupportedAttachDonTargetFilter = (
  filter: CardFilter | undefined,
): boolean => {
  const categories = filter?.categories;
  if (categories === undefined) {
    return false;
  }
  const categoryShape =
    (categories.length === 1 && categories[0] === "character") ||
    (categories.length === 2 &&
      categories[0] === "leader" &&
      categories[1] === "character");
  if (!categoryShape) {
    return false;
  }
  if (filter === undefined) {
    return false;
  }
  return Object.keys(filter).every(
    (key) => key === "categories" || key === "typesAny",
  );
};

const isSupportedRevealTopSegment = (
  effect: SequenceSegmentEffect,
): effect is RevealTopEffect =>
  effect.type === "revealTop" &&
  effect.player === "self" &&
  effect.visibility === "bothPlayers" &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

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
  (target.player === "self" || target.player === "opponent") &&
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
  effect.destination === "hand" &&
  isSupportedSavedFieldObjectKoTarget(effect.target);

const supportedPublicFieldTargetFilterKeys = new Set<keyof CardFilter>([
  "categories",
  "colorsAny",
  "cost",
  "power",
  "state",
  "typesAny",
]);

const isSupportedPublicFieldTargetFilter = (
  filter: CardFilter | undefined,
): boolean =>
  filter === undefined ||
  Object.keys(filter).every((key) =>
    supportedPublicFieldTargetFilterKeys.has(key as keyof CardFilter),
  );

const isSupportedSequenceTargetRequest = (
  request: SelectTargetsEffect["request"],
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
    (request.player === "self" || request.player === "opponent") &&
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
): effect is TrashEffect =>
  effect.type === "trash" &&
  effect.target.type === "all" &&
  (effect.target.zone === "characterArea" ||
    effect.target.zone === "stageArea") &&
  (effect.target.player === "self" || effect.target.player === "opponent") &&
  isSupportedPublicFieldTargetFilter(effect.target.filter);

const isSupportedRestSegment = (
  effect: SequenceSegmentEffect,
): effect is RestEffect =>
  effect.type === "rest" && isSupportedSavedFieldObjectKoTarget(effect.target);

const isSupportedActivateSegment = (
  effect: SequenceSegmentEffect,
): effect is Extract<SequenceSegmentEffect, { type: "activate" }> =>
  effect.type === "activate" &&
  effect.target.type === "savedFieldObject" &&
  effect.target.zone === "costArea" &&
  (effect.target.player === "self" || effect.target.player === "opponent") &&
  effect.target.controller === undefined &&
  effect.target.filter === undefined &&
  effect.target.binding.family === "selectedTargets";

const isSupportedSequenceContinuousDuration = (duration: Duration): boolean =>
  duration.type === "thisBattle" ||
  duration.type === "thisTurn" ||
  duration.type === "whileSourceOnField" ||
  duration.type === "permanent" ||
  duration.type === "untilEndOfNextTurn" ||
  duration.type === "untilStartOfNextTurn" ||
  duration.type === "untilEndOfTurn";

const isSupportedSavedTargetContinuousSegment = (
  effect: SequenceSegmentEffect,
): effect is SavedTargetContinuousEffect =>
  (effect.type === "cannotBecomeActive" ||
    effect.type === "cannotAttack" ||
    effect.type === "cannotBlock" ||
    effect.type === "invalidateEffects") &&
  isSupportedSavedFieldObjectKoTarget(effect.target) &&
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
    if (isSupportedAllFieldTrashSegment(segment.effect)) {
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
      isScopedActivateMainSequenceEntry(entry));

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
      if (isSupportedAllFieldTrashSegment(segment.effect)) {
        return true;
      }
      if (isSupportedContinuousQueueEffect(segment.effect)) {
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
    | "main"
    | "trigger"
    | "counter"
    | "lifeRemoved",
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
