import type {
  CardInstance,
  CardRef,
  CardSnapshot,
  EffectDefinition,
  EffectQueueEntry,
  GameState,
  PlayerId,
  ResolvedCard,
  Target,
} from "@optcg/types";

import { reifyCardRef } from "./action-state.js";
import { evaluateQueuedEffectCondition } from "./effect-runtime-conditions.js";

export interface SupportedCounterEventPower {
  value: number;
  printedCost: number;
  target: CardRef;
  usesBattleCounterPower: boolean;
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

const targetZone = (
  target: CardRef,
): CardInstance["zone"]["zone"] | undefined => target.zone?.zone;

const targetFilterMatchesCard = (
  metadata: ResolvedCard,
  filter: Extract<Target, { type: "chooseFromZones" }>["request"]["filter"],
): boolean => {
  if (filter === undefined) {
    return true;
  }
  const keys = Object.keys(filter);
  if (!keys.every((key) => key === "categories")) {
    return false;
  }
  return (
    filter.categories === undefined ||
    filter.categories.includes(metadata.category)
  );
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
  const request = target.request;
  const zone = targetZone(selectedTarget);
  return (
    request.timing === "onResolution" &&
    request.chooser === "self" &&
    request.player === "self" &&
    request.visibility === "public" &&
    request.min >= 0 &&
    request.min <= 1 &&
    request.max >= 1 &&
    zone !== undefined &&
    request.zones.includes(zone) &&
    targetFilterMatchesCard(metadata, request.filter)
  );
};

const supportedCounterEventPowerValue = (
  state: GameState,
  card: CardInstance,
  metadata: ResolvedCard,
  effect: EffectDefinition["effects"][number],
  target: CardRef,
  battleTarget: CardRef | undefined,
): number | null => {
  const controllerId = target.playerId;
  if (
    effect.category !== "auto" ||
    effect.optional === true ||
    effect.oncePerTurn === true ||
    effect.conditionTiming !== undefined ||
    effect.cost !== undefined ||
    effect.failurePolicy !== undefined ||
    effect.sourcePresencePolicy !== "resolveFromDestinationZone" ||
    effect.effect.type !== "modifyPower" ||
    effect.effect.duration.type !== "thisBattle" ||
    !Number.isInteger(effect.effect.value) ||
    effect.effect.value <= 0 ||
    !counterEventConditionPasses(state, card, metadata, effect, controllerId) ||
    !counterPowerTargetCanApplyToSelectedTarget(
      state,
      controllerId,
      effect.effect.target,
      target,
      battleTarget,
    )
  ) {
    return null;
  }
  return effect.effect.value;
};

export const getSupportedCounterEventPower = (
  state: GameState,
  card: CardInstance,
  target: CardRef | undefined,
  battleTarget = target,
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
  for (const counterEffect of counterEffects) {
    const counterValue = supportedCounterEventPowerValue(
      state,
      card,
      metadata,
      counterEffect,
      target,
      battleTarget,
    );
    if (counterValue === null) {
      return null;
    }
    value += counterValue;
  }
  const printedCost = metadata.cost ?? 0;
  if (!Number.isInteger(printedCost) || printedCost < 0) {
    return null;
  }
  return {
    value,
    printedCost,
    target,
    usesBattleCounterPower:
      battleTarget !== undefined && sameCardRef(target, battleTarget),
  };
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
): SupportedCounterEventPower[] =>
  counterEventPowerCandidateTargets(state, defenderId).flatMap((target) => {
    const supported = getSupportedCounterEventPower(
      state,
      card,
      target,
      battleTarget,
    );
    return supported === null ? [] : [supported];
  });
