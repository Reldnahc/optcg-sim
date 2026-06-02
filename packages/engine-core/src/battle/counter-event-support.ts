import type {
  CardInstance,
  CardRef,
  CardSnapshot,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  GameState,
  OptionalCost,
  PlayerId,
  ResolvedCard,
  Target,
} from "@optcg/types";

import { reifyCardRef } from "../actions/state.js";
import { evaluateQueuedEffectCondition } from "../effect-runtime-conditions.js";
import { resolvePublicTargetCandidatesForRequest } from "../selection/candidates.js";

export interface SupportedCounterEventPower {
  effectCost?: Extract<OptionalCost, { type: "trashFromHand" }>;
  value: number;
  printedCost: number;
  target: CardRef;
  usesBattleCounterPower: boolean;
  trailingSequence?: {
    effectBlockId: EffectDefinition["effects"][number]["id"];
    startIndex: number;
  };
}

const sameCardRef = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId;

const toCardRef = (card: CardInstance, playerId: PlayerId): CardRef => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: card.zone,
});

const counterEventSourceSnapshot = (
  card: CardInstance,
  metadata: ResolvedCard,
  controllerId: PlayerId,
): CardSnapshot => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  ownerId: card.owner,
  controllerId,
  zone: card.zone,
  category: metadata.category,
  colors: metadata.colors,
  ...(metadata.cost === undefined ? {} : { cost: metadata.cost }),
  ...(metadata.power === undefined ? {} : { power: metadata.power }),
  ...(metadata.counter === undefined ? {} : { counter: metadata.counter }),
  ...(metadata.life === undefined ? {} : { life: metadata.life }),
  keywords: metadata.printedKeywords,
});

const counterEventConditionPasses = (
  state: GameState,
  card: CardInstance,
  metadata: ResolvedCard,
  effect: EffectDefinition["effects"][number],
  controllerId: PlayerId,
): boolean => {
  if (effect.condition === undefined) {
    return true;
  }
  if (effect.sourcePresencePolicy === undefined) {
    return false;
  }
  const entry: EffectQueueEntry = {
    id: `queue-entry:counter-event:${String(card.instanceId)}` as EffectQueueEntry["id"],
    state: "resolving",
    timingWindowId:
      `timing-window:counter-event:${String(card.instanceId)}` as EffectQueueEntry["timingWindowId"],
    generation: 0,
    controllerId,
    source: {
      instanceId: card.instanceId,
      cardId: card.cardId,
      playerId: controllerId,
      zone: card.zone,
    },
    sourceSnapshot: counterEventSourceSnapshot(card, metadata, controllerId),
    effectBlockId: effect.id,
    orderingGroup: "nonTurnPlayer",
    createdAtEventSeq: state.eventJournal.length,
    queuedAtStateSeq: state.seq,
    sourcePresencePolicy: effect.sourcePresencePolicy,
    causedBy: { type: "ruleProcess", name: "counterStep" },
  };
  const evaluated = evaluateQueuedEffectCondition(
    state,
    entry,
    effect.condition,
  );
  return evaluated.supported && evaluated.passed;
};

const counterPowerTargetCanApplyToSelectedTarget = (
  state: GameState,
  controllerId: PlayerId,
  target: Target,
  selectedTarget: CardRef,
  battleTarget: CardRef | undefined,
): boolean => {
  if (target.type === "attackTarget") {
    return (
      battleTarget !== undefined && sameCardRef(selectedTarget, battleTarget)
    );
  }

  const locatedTarget = reifyCardRef(state, selectedTarget);
  if (locatedTarget === null || locatedTarget.playerId !== controllerId) {
    return false;
  }
  const metadata = state.cardManifest.cards[locatedTarget.card.cardId];
  if (metadata === undefined) {
    return false;
  }

  if (target.type === "myLeader") {
    return locatedTarget.isLeader;
  }

  if (target.type !== "chooseFromZones") {
    return false;
  }
  const resolved = resolvePublicTargetCandidatesForRequest(
    state,
    target.request,
    { sourceControllerId: controllerId },
  );
  return (
    resolved.ok &&
    resolved.candidates.some((candidate) =>
      sameCardRef(candidate.card, selectedTarget),
    )
  );
};

const counterPowerEffect = (
  effect: EffectDefinition["effects"][number],
): {
  effectCost?: Extract<OptionalCost, { type: "trashFromHand" }>;
  power: Extract<Effect, { type: "modifyPower" }>;
  trailingStartIndex?: number;
} | null => {
  if (effect.effect.type === "modifyPower") {
    return { power: effect.effect };
  }
  if (effect.effect.type !== "sequence") {
    return null;
  }
  const [first, second, ...rest] = effect.effect.effects;
  if (
    first !== undefined &&
    first.connector === "always" &&
    first.optional !== true &&
    first.effect.type === "payCost" &&
    first.effect.cost.type === "trashFromHand" &&
    second !== undefined &&
    second.connector === "ifYouDo" &&
    second.optional !== true &&
    second.effect.type === "modifyPower"
  ) {
    return {
      effectCost: first.effect.cost,
      power: second.effect,
      ...(rest.length === 0 ? {} : { trailingStartIndex: 2 }),
    };
  }

  if (
    first === undefined ||
    first.connector !== "always" ||
    first.optional === true ||
    first.effect.type !== "modifyPower"
  ) {
    return null;
  }
  const trailing = second === undefined ? rest : [second, ...rest];
  if (trailing.length === 0) {
    return { power: first.effect };
  }
  return {
    power: first.effect,
    trailingStartIndex: 1,
  };
};

const supportedCounterEventPower = (
  state: GameState,
  card: CardInstance,
  metadata: ResolvedCard,
  effect: EffectDefinition["effects"][number],
  target: CardRef,
  battleTarget: CardRef | undefined,
  options: { evaluateCondition: boolean },
): {
  effectCost?: SupportedCounterEventPower["effectCost"];
  value: number;
  trailingSequence?: SupportedCounterEventPower["trailingSequence"];
} | null => {
  const controllerId = target.playerId;
  const parsed = counterPowerEffect(effect);
  if (
    parsed === null ||
    effect.category !== "auto" ||
    effect.optional === true ||
    effect.oncePerTurn === true ||
    effect.conditionTiming !== undefined ||
    effect.cost !== undefined ||
    effect.failurePolicy !== undefined ||
    effect.sourcePresencePolicy !== "resolveFromDestinationZone" ||
    parsed.power.duration.type !== "thisBattle" ||
    typeof parsed.power.value !== "number" ||
    !Number.isInteger(parsed.power.value) ||
    parsed.power.value <= 0 ||
    (parsed.effectCost !== undefined &&
      (parsed.effectCost.chooser !== "self" ||
        parsed.effectCost.filter !== undefined ||
        !Number.isInteger(parsed.effectCost.count) ||
        parsed.effectCost.count <= 0)) ||
    (options.evaluateCondition &&
      !counterEventConditionPasses(
        state,
        card,
        metadata,
        effect,
        controllerId,
      )) ||
    !counterPowerTargetCanApplyToSelectedTarget(
      state,
      controllerId,
      parsed.power.target,
      target,
      battleTarget,
    )
  ) {
    return null;
  }
  return {
    ...(parsed.effectCost === undefined
      ? {}
      : { effectCost: parsed.effectCost }),
    value: parsed.power.value,
    ...(parsed.trailingStartIndex === undefined
      ? {}
      : {
          trailingSequence: {
            effectBlockId: effect.id,
            startIndex: parsed.trailingStartIndex,
          },
        }),
  };
};

export const getSupportedCounterEventPower = (
  state: GameState,
  card: CardInstance,
  target: CardRef | undefined,
  battleTarget = target,
  options: { evaluateCondition?: boolean; effectCostPaid?: boolean } = {},
): SupportedCounterEventPower | null => {
  const metadata = state.cardManifest.cards[card.cardId];
  if (
    target === undefined ||
    metadata?.category !== "event" ||
    metadata.support.status !== "implemented-dsl" ||
    metadata.support.effectDefinitionId === undefined ||
    (metadata.support.customHandlerIds?.length ?? 0) > 0
  ) {
    return null;
  }
  const definition =
    state.cardManifest.effectDefinitions?.[metadata.support.effectDefinitionId];
  const counterEffects =
    definition?.effects.filter((effect) => effect.trigger.type === "counter") ??
    [];
  if (
    definition?.implementationStatus !== "implemented-dsl" ||
    counterEffects.length === 0
  ) {
    return null;
  }
  let value = 0;
  let effectCost: SupportedCounterEventPower["effectCost"];
  let trailingSequence: SupportedCounterEventPower["trailingSequence"];
  for (const counterEffect of counterEffects) {
    const counterValue = supportedCounterEventPower(
      state,
      card,
      metadata,
      counterEffect,
      target,
      battleTarget,
      { evaluateCondition: options.evaluateCondition ?? true },
    );
    if (counterValue === null) {
      return null;
    }
    value += counterValue.value;
    if (counterValue.effectCost !== undefined) {
      if (effectCost !== undefined) {
        return null;
      }
      effectCost = counterValue.effectCost;
    }
    if (counterValue.trailingSequence !== undefined) {
      if (trailingSequence !== undefined) {
        return null;
      }
      trailingSequence = counterValue.trailingSequence;
    }
  }
  const printedCost = metadata.cost ?? 0;
  if (!Number.isInteger(printedCost) || printedCost < 0) {
    return null;
  }
  if (
    effectCost !== undefined &&
    options.effectCostPaid !== true &&
    countEligibleHandCardsForEffectCost(state, card, target.playerId) <
      effectCost.count
  ) {
    return null;
  }
  return {
    ...(effectCost === undefined ? {} : { effectCost }),
    value,
    printedCost,
    target,
    usesBattleCounterPower:
      battleTarget !== undefined && sameCardRef(target, battleTarget),
    ...(trailingSequence === undefined ? {} : { trailingSequence }),
  };
};

const countEligibleHandCardsForEffectCost = (
  state: GameState,
  card: CardInstance,
  controllerId: PlayerId,
): number => {
  const player = state.players[controllerId];
  if (player === undefined) {
    return 0;
  }
  return player.hand.filter(
    (candidate) => candidate.instanceId !== card.instanceId,
  ).length;
};

const counterEventPowerCandidateTargets = (
  state: GameState,
  defenderId: PlayerId,
): CardRef[] => {
  const defender = state.players[defenderId];
  if (defender === undefined) {
    return [];
  }
  return [
    toCardRef(defender.leader, defenderId),
    ...defender.characters.map((card) => toCardRef(card, defenderId)),
  ];
};

export const getSupportedCounterEventPowerTargets = (
  state: GameState,
  card: CardInstance,
  defenderId: PlayerId,
  battleTarget: CardRef | undefined,
  options: { evaluateCondition?: boolean; effectCostPaid?: boolean } = {},
): SupportedCounterEventPower[] =>
  counterEventPowerCandidateTargets(state, defenderId).flatMap((target) => {
    const supported = getSupportedCounterEventPower(
      state,
      card,
      target,
      battleTarget,
      options,
    );
    return supported === null ? [] : [supported];
  });

export const getSupportedCounterEventPowerShapeTargets = (
  state: GameState,
  card: CardInstance,
  defenderId: PlayerId,
  battleTarget: CardRef | undefined,
): SupportedCounterEventPower[] =>
  getSupportedCounterEventPowerTargets(state, card, defenderId, battleTarget, {
    evaluateCondition: false,
  });
