import type {
  CardInstance,
  CardRef,
  CardSnapshot,
  Duration,
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
import { flattenSequenceEffect } from "../effect-runtime-sequence/support-normalization.js";
import { isSupportedSequenceBlock } from "../effect-runtime-sequence/support.js";
import { isSupportedContinuousQueueEffect } from "../runtime/continuous/continuous.js";
import {
  continuousChooseTargetRequest,
  type ContinuousQueueEffect,
} from "../runtime/continuous/targeting.js";
import { resolvePublicTargetCandidatesForRequest } from "../selection/candidates.js";
import { toCounterEventRuntimeQueueEntry } from "./counter-event-runtime-queue-entry.js";

export interface SupportedCounterEventPower {
  effectCost?: Extract<OptionalCost, { type: "trashFromHand" }>;
  value: number;
  printedCost: number;
  target: CardRef;
  duration: Duration;
  usesBattleCounterPower: boolean;
  trailingSequence?: {
    effectBlockId: EffectDefinition["effects"][number]["id"];
    startIndex: number;
  };
}

export interface SupportedCounterEventRuntime {
  printedCost: number;
  target: CardRef;
  effects: readonly (EffectDefinition["effects"][number] & {
    effect: ContinuousQueueEffect;
  })[];
}

export interface SupportedCounterEventSequence {
  printedCost: number;
  target: CardRef;
  effects: readonly (EffectDefinition["effects"][number] & {
    effect: Extract<Effect, { type: "sequence" }>;
  })[];
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

  if (target.type === "myLeader") {
    const locatedTarget = reifyCardRef(state, selectedTarget);
    if (locatedTarget === null || locatedTarget.playerId !== controllerId) {
      return false;
    }
    const metadata = state.cardManifest.cards[locatedTarget.card.cardId];
    if (metadata === undefined) {
      return false;
    }
    return locatedTarget.isLeader;
  }

  if (target.type !== "choose" && target.type !== "chooseFromZones") {
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
  const flattened = flattenSequenceEffect(effect.effect);
  if (flattened === null) {
    return null;
  }
  const [first, second, ...rest] = flattened.effects;
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
  duration: Duration;
  trailingSequence?: SupportedCounterEventPower["trailingSequence"];
} | null => {
  const controllerId = card.controller;
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
    !(
      parsed.power.duration.type === "thisBattle" ||
      parsed.power.duration.type === "thisTurn" ||
      parsed.power.duration.type === "untilEndOfNextTurn"
    ) ||
    typeof parsed.power.value !== "number" ||
    !Number.isInteger(parsed.power.value) ||
    parsed.power.value === 0 ||
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
    duration: parsed.power.duration,
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

const supportedCounterEventRuntimeEffect = (
  state: GameState,
  card: CardInstance,
  metadata: ResolvedCard,
  effect: EffectDefinition["effects"][number],
  controllerId: PlayerId,
  options: { evaluateCondition: boolean },
):
  | (EffectDefinition["effects"][number] & { effect: ContinuousQueueEffect })
  | null => {
  if (
    effect.category !== "auto" ||
    effect.trigger.type !== "counter" ||
    effect.optional === true ||
    effect.oncePerTurn === true ||
    effect.conditionTiming !== undefined ||
    effect.cost !== undefined ||
    effect.failurePolicy !== undefined ||
    effect.sourcePresencePolicy !== "resolveFromDestinationZone" ||
    counterPowerEffect(effect) !== null ||
    !isSupportedContinuousQueueEffect(effect.effect) ||
    continuousChooseTargetRequest(effect.effect) !== undefined ||
    (options.evaluateCondition &&
      !counterEventConditionPasses(state, card, metadata, effect, controllerId))
  ) {
    return null;
  }
  return { ...effect, effect: effect.effect };
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
  let duration: Duration | undefined;
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
    if (
      duration !== undefined &&
      duration.type !== counterValue.duration.type
    ) {
      return null;
    }
    duration = counterValue.duration;
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
    duration: duration ?? { type: "thisBattle" },
    usesBattleCounterPower:
      duration?.type === "thisBattle" &&
      value > 0 &&
      battleTarget !== undefined &&
      sameCardRef(target, battleTarget),
    ...(trailingSequence === undefined ? {} : { trailingSequence }),
  };
};

export const getSupportedCounterEventRuntime = (
  state: GameState,
  card: CardInstance,
  target: CardRef | undefined,
  options: { evaluateCondition?: boolean } = {},
): SupportedCounterEventRuntime | null => {
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

  const effects: (EffectDefinition["effects"][number] & {
    effect: ContinuousQueueEffect;
  })[] = [];
  for (const counterEffect of counterEffects) {
    const supported = supportedCounterEventRuntimeEffect(
      state,
      card,
      metadata,
      counterEffect,
      target.playerId,
      { evaluateCondition: options.evaluateCondition ?? true },
    );
    if (supported === null) {
      return null;
    }
    effects.push(supported);
  }
  const printedCost = metadata.cost ?? 0;
  if (!Number.isInteger(printedCost) || printedCost < 0) {
    return null;
  }
  return { printedCost, target, effects };
};

export const getSupportedCounterEventSequence = (
  state: GameState,
  card: CardInstance,
  target: CardRef | undefined,
  options: { evaluateCondition?: boolean } = {},
): SupportedCounterEventSequence | null => {
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
  const printedCost = metadata.cost ?? 0;
  if (!Number.isInteger(printedCost) || printedCost < 0) {
    return null;
  }
  const effects: (EffectDefinition["effects"][number] & {
    effect: Extract<Effect, { type: "sequence" }>;
  })[] = [];
  for (const counterEffect of counterEffects) {
    if (
      counterEffect.category !== "auto" ||
      counterEffect.trigger.type !== "counter" ||
      counterEffect.optional === true ||
      counterEffect.oncePerTurn === true ||
      counterEffect.conditionTiming !== undefined ||
      counterEffect.cost !== undefined ||
      counterEffect.failurePolicy !== undefined ||
      counterEffect.sourcePresencePolicy !== "resolveFromDestinationZone" ||
      counterEffect.effect.type !== "sequence" ||
      counterPowerEffect(counterEffect) !== null ||
      (options.evaluateCondition !== false &&
        !counterEventConditionPasses(
          state,
          card,
          metadata,
          counterEffect,
          target.playerId,
        ))
    ) {
      return null;
    }
    const entry = toCounterEventRuntimeQueueEntry(
      state,
      target.playerId,
      card,
      counterEffect,
    );
    if (!isSupportedSequenceBlock(entry, counterEffect)) {
      return null;
    }
    effects.push({ ...counterEffect, effect: counterEffect.effect });
  }
  return { printedCost, target, effects };
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
  card: CardInstance,
  defenderId: PlayerId,
): CardRef[] => {
  const defender = state.players[defenderId];
  const targets =
    defender === undefined
      ? []
      : [
          toCardRef(defender.leader, defenderId),
          ...defender.characters.map((candidate) =>
            toCardRef(candidate, defenderId),
          ),
        ];
  const metadata = state.cardManifest.cards[card.cardId];
  const definition =
    metadata?.support.effectDefinitionId === undefined
      ? undefined
      : state.cardManifest.effectDefinitions?.[
          metadata.support.effectDefinitionId
        ];
  for (const effect of definition?.effects ?? []) {
    if (effect.trigger.type !== "counter") {
      continue;
    }
    const parsed = counterPowerEffect(effect);
    const target = parsed?.power.target;
    if (target?.type !== "choose" && target?.type !== "chooseFromZones") {
      continue;
    }
    const resolved = resolvePublicTargetCandidatesForRequest(
      state,
      target.request,
      { sourceControllerId: card.controller },
    );
    if (!resolved.ok) {
      continue;
    }
    targets.push(...resolved.candidates.map((candidate) => candidate.card));
  }
  return uniqueCardRefs(targets);
};

const uniqueCardRefs = (targets: readonly CardRef[]): CardRef[] => {
  const seen = new Set<string>();
  const unique: CardRef[] = [];
  for (const target of targets) {
    const key = `${String(target.playerId)}:${String(target.instanceId)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(target);
  }
  return unique;
};

export const getSupportedCounterEventPowerTargets = (
  state: GameState,
  card: CardInstance,
  defenderId: PlayerId,
  battleTarget: CardRef | undefined,
  options: { evaluateCondition?: boolean; effectCostPaid?: boolean } = {},
): SupportedCounterEventPower[] =>
  counterEventPowerCandidateTargets(state, card, defenderId).flatMap(
    (target) => {
      const supported = getSupportedCounterEventPower(
        state,
        card,
        target,
        battleTarget,
        options,
      );
      return supported === null ? [] : [supported];
    },
  );

export const getSupportedCounterEventPowerShapeTargets = (
  state: GameState,
  card: CardInstance,
  defenderId: PlayerId,
  battleTarget: CardRef | undefined,
): SupportedCounterEventPower[] =>
  getSupportedCounterEventPowerTargets(state, card, defenderId, battleTarget, {
    evaluateCondition: false,
  });
