import type {
  Cost,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  OptionalCost,
} from "@optcg/types";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;

const toOptionalCost = (cost: Cost): OptionalCost | undefined => {
  switch (cost.type) {
    case "restSelf":
      return { type: "restSelf", optional: true };
    case "restFromField":
      return { ...cost, optional: true };
    case "trashSelf":
      return { ...cost, optional: true };
    case "trashFromField":
      return { ...cost, optional: true };
    case "restDon":
      return { ...cost, optional: true };
    case "attachDon":
      return { ...cost, optional: true };
    case "returnDon":
      return { ...cost, optional: true };
    case "revealFromHand":
    case "trashFromHand":
      return { ...cost, optional: true };
    case "moveCards":
      return { ...cost, optional: true };
    case "turnLifeFaceUp":
      return { ...cost, optional: true };
    case "modifyPower":
      return { ...cost, optional: true };
    case "sequence":
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
  if (segment.connector !== "always") {
    return flattened.effects.map((child, index) => {
      if (index === 0) {
        return { ...child, connector: segment.connector };
      }
      return child.connector === "always"
        ? { ...child, connector: "then" }
        : child;
    });
  }
  return flattened.effects.map((child, index) =>
    index === 0 ? { ...child, connector: segment.connector } : child,
  );
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

export const toSingleEffectSequence = (effect: Effect): SequenceEffect => ({
  type: "sequence",
  effects: [{ connector: "always", effect }],
});

export const toFlattenedSequenceBlock = (
  effectBlock: EffectDefinition["effects"][number] | undefined,
): EffectDefinition["effects"][number] | undefined => {
  if (effectBlock === undefined) {
    return effectBlock;
  }
  if (effectBlock.effect.type !== "sequence") {
    return {
      ...effectBlock,
      effect: toSingleEffectSequence(effectBlock.effect),
    };
  }
  const flattened = flattenSequenceEffect(effectBlock.effect);
  if (flattened === null) {
    return undefined;
  }
  return { ...effectBlock, effect: flattened };
};

export const toSyntheticQueueEntry = (
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
