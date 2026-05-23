import type {
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  PlaySelectedEffect,
  SelectTargetsEffect,
  SelectCardsEffect,
  Target,
} from "@optcg/types";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegmentEffect = SequenceEffect["effects"][number]["effect"];
type DrawEffect = Extract<Effect, { type: "draw" }>;
type DrawUpToEffect = Extract<Effect, { type: "drawUpTo" }>;
type TrashFromHandEffect = Extract<Effect, { type: "trashFromHand" }>;
type PayCostEffect = Extract<SequenceSegmentEffect, { type: "payCost" }>;
type KoEffect = Extract<Effect, { type: "ko" }> & {
  target: Extract<Target, { type: "savedFieldObject" }>;
};

export type SupportedSequenceSegment = SequenceEffect["effects"][number] & {
  effect:
    | DrawEffect
    | DrawUpToEffect
    | TrashFromHandEffect
    | PayCostEffect
    | SelectCardsEffect
    | SelectTargetsEffect
    | PlaySelectedEffect
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

const isSupportedConnector = (
  connector: SequenceEffect["effects"][number]["connector"],
): connector is "always" | "then" | "ifPreviousSucceeded" | "ifYouDo" =>
  connector === "always" ||
  connector === "then" ||
  connector === "ifPreviousSucceeded" ||
  connector === "ifYouDo";

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
  effect.player === "self" &&
  effect.chooser === "self" &&
  effect.filter === undefined &&
  Number.isInteger(effect.count) &&
  effect.count > 0;

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
  return (
    (cost.type === "restDon" ||
      cost.type === "returnDon" ||
      cost.type === "trashFromHand") &&
    (cost.chooser === undefined || cost.chooser === "self") &&
    (cost.type !== "trashFromHand" || cost.filter === undefined) &&
    Number.isInteger(cost.count) &&
    cost.count > 0
  );
};

const isExactCharacterCategoryFilter = (
  filter: SelectCardsEffect["filter"] | undefined,
): boolean => {
  if (filter === undefined) {
    return false;
  }
  const keys = Object.keys(filter).sort();
  return (
    keys.length === 1 &&
    keys[0] === "categories" &&
    filter.categories !== undefined &&
    filter.categories.length === 1 &&
    filter.categories[0] === "character"
  );
};

const isSupportedSequenceHandSelectCardsSegment = (
  effect: SequenceSegmentEffect,
): effect is SelectCardsEffect =>
  effect.type === "selectCards" &&
  effect.zone === "hand" &&
  effect.player === "self" &&
  effect.chooser === "self" &&
  effect.visibility === "chooserOnly" &&
  String(effect.saveAs).startsWith("handSelection:") &&
  isExactCharacterCategoryFilter(effect.filter) &&
  Number.isInteger(effect.min) &&
  Number.isInteger(effect.max) &&
  effect.min >= 0 &&
  effect.max >= effect.min;

const isSupportedSavedFieldObjectKoTarget = (
  target: Target,
): target is Extract<Target, { type: "savedFieldObject" }> =>
  target.type === "savedFieldObject" &&
  target.zone === "characterArea" &&
  (target.player === "self" || target.player === "opponent") &&
  target.controller === undefined &&
  target.filter === undefined;

const isSupportedKoSegment = (
  effect: SequenceSegmentEffect,
): effect is KoEffect =>
  effect.type === "ko" && isSupportedSavedFieldObjectKoTarget(effect.target);

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

export const isSupportedSequenceBlock = (
  entry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number] | undefined,
  options: SequenceSupportOptions = {},
): effectBlock is SupportedSequenceBlock => {
  const allowSavedReferences = options.allowSavedReferences ?? true;
  const requirePositiveDrawCount = options.requirePositiveDrawCount ?? false;
  const isSupportedCategoryForEntry =
    effectBlock?.category === "auto" ||
    (effectBlock?.category === "activate" &&
      effectBlock.trigger.type === "activateMain" &&
      isScopedActivateMainSequenceEntry(entry));

  if (
    effectBlock === undefined ||
    !isSupportedCategoryForEntry ||
    effectBlock.optional === true ||
    effectBlock.cost !== undefined ||
    effectBlock.conditionTiming !== undefined ||
    effectBlock.failurePolicy !== undefined ||
    effectBlock.sourcePresencePolicy !== entry.sourcePresencePolicy ||
    effectBlock.effect.type !== "sequence" ||
    effectBlock.effect.effects.length === 0
  ) {
    return false;
  }

  let hasPendingDecisionSegment = false;
  const allSegmentsSupported = effectBlock.effect.effects.every(
    (segment, index) => {
      if (
        !isSupportedConnector(segment.connector) ||
        (index === 0 && segment.connector !== "always")
      ) {
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
          hasPendingDecisionSegment = true;
        }
        return true;
      }
      if (isSupportedDrawUpToSegment(segment.effect)) {
        if (segment.optional === true) {
          return false;
        }
        hasPendingDecisionSegment = true;
        return true;
      }
      if (isSupportedTrashFromHandSegment(segment.effect)) {
        if (index === 0) {
          return false;
        }
        hasPendingDecisionSegment = true;
        return true;
      }
      if (isSupportedPayCostSegment(segment.effect)) {
        if (segment.optional === true) {
          return false;
        }
        hasPendingDecisionSegment = true;
        return true;
      }
      if (isSupportedSequenceHandSelectCardsSegment(segment.effect)) {
        if (index === 0) {
          return false;
        }
        hasPendingDecisionSegment = true;
        return true;
      }
      if (segment.effect.type === "selectTargets") {
        const request = segment.effect.request;
        if (
          request.timing !== "onResolution" ||
          request.chooser !== "self" ||
          request.zone !== "characterArea" ||
          request.player !== "opponent" ||
          !Number.isInteger(request.min) ||
          !Number.isInteger(request.max) ||
          request.min < 0 ||
          request.min > request.max ||
          request.max > 1 ||
          request.allowFewerIfUnavailable ||
          (request.filter !== undefined &&
            (request.filter.categories === undefined ||
              request.filter.categories.length !== 1 ||
              request.filter.categories[0] !== "character" ||
              request.filter.cost === undefined ||
              "op" in request.filter.cost ||
              request.filter.cost.min !== undefined ||
              request.filter.cost.max === undefined ||
              !Number.isFinite(request.filter.cost.max) ||
              Object.keys(request.filter).some(
                (key) => key !== "categories" && key !== "cost",
              )))
        ) {
          return false;
        }
        hasPendingDecisionSegment = true;
        return true;
      }
      if (segment.effect.type === "playSelected") {
        return (
          segment.effect.enterRested === true &&
          segment.effect.ignoreCost === true &&
          String(segment.effect.selection).startsWith("handSelection:")
        );
      }
      if (isSupportedKoSegment(segment.effect)) {
        return true;
      }
      return false;
    },
  );
  return allSegmentsSupported && hasPendingDecisionSegment;
};

export const isSupportedQueuedAutoSequenceForEntryPoint = (
  effect: EffectDefinition["effects"][number],
  triggerType: "onPlay" | "whenAttacking" | "onKO" | "main" | "trigger",
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
