import type {
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  GameState,
} from "@optcg/types";

import { isSupportedContinuousQueueEffect } from "../runtime/continuous/continuous.js";
import {
  isScopedActivateMainQueueEntry,
  isSupportedActivateMainRuntimeEffectBlock,
} from "../runtime/optional-activation/activate-main.js";
import {
  isSupportedQueuedDrawEffectBlock,
  isSupportedQueuedOptionalDrawEffectBlock,
} from "../runtime/primitives/execute.js";
import type { QueuedEffectDefinitionResolverDependencies } from "./results-types.js";

type ContinuousQueueEffect = Extract<
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
      | "giveProtection"
      | "protectFromKO"
      | "cannotBecomeActive"
      | "cannotAttack"
      | "attackCost"
      | "preventBlockerActivation"
      | "cannotBlock";
  }
>;

type QueuedDrawEffectBlock = EffectDefinition["effects"][number] & {
  readonly effect: Extract<Effect, { type: "draw" }>;
  readonly sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
};

export interface QueuedEffectResolvers {
  readonly resolveQueuedEffectDefinition: (
    state: GameState,
    entry: EffectQueueEntry,
  ) => EffectDefinition["effects"][number] | undefined;
  readonly resolveQueuedDrawEffect: (
    state: GameState,
    entry: EffectQueueEntry,
  ) => Extract<Effect, { type: "draw" }> | undefined;
  readonly resolveQueuedDrawUpToEffect: (
    state: GameState,
    entry: EffectQueueEntry,
  ) => Extract<Effect, { type: "drawUpTo" }> | undefined;
  readonly resolveQueuedContinuousEffect: (
    state: GameState,
    entry: EffectQueueEntry,
  ) => ContinuousQueueEffect | undefined;
  readonly resolveQueuedPlaySourceEffect: (
    state: GameState,
    entry: EffectQueueEntry,
  ) => Extract<Effect, { type: "playSource" }> | undefined;
  readonly withoutConditionFields: (
    effect: EffectDefinition["effects"][number],
  ) => EffectDefinition["effects"][number];
  readonly canResolveQueuedDrawFromActivateMainEntry: (
    effect: EffectDefinition["effects"][number],
    entry: EffectQueueEntry,
  ) => effect is QueuedDrawEffectBlock;
  readonly isSupportedQueuedOptionalDrawEffectBlock: (
    effect: EffectDefinition["effects"][number],
  ) => effect is QueuedDrawEffectBlock;
}

export const createQueuedEffectResolvers = (
  dependencies: QueuedEffectDefinitionResolverDependencies,
): QueuedEffectResolvers => {
  const resolveQueuedEffectDefinition = (
    state: GameState,
    entry: EffectQueueEntry,
  ): EffectDefinition["effects"][number] | undefined => {
    if (entry.effectBlockOverride !== undefined) {
      return entry.effectBlockOverride;
    }
    const resolved = state.cardManifest.cards[entry.source.cardId];
    if (resolved === undefined) {
      return undefined;
    }
    const lookup = dependencies.resolveImplementedDslEffectDefinition(
      resolved,
      state.cardManifest,
    );
    if (!lookup.ok) {
      return undefined;
    }
    const match = lookup.definition.effects.find(
      (effect) => effect.id === entry.effectBlockId,
    );
    if (match === undefined) {
      return undefined;
    }
    return match;
  };

  const canResolveQueuedDrawFromActivateMainEntry = (
    effect: EffectDefinition["effects"][number],
    entry: EffectQueueEntry,
  ): effect is QueuedDrawEffectBlock =>
    isScopedActivateMainQueueEntry(entry) &&
    isSupportedActivateMainRuntimeEffectBlock(effect) &&
    effect.effect.type === "draw";

  const resolveQueuedDrawEffect = (
    state: GameState,
    entry: EffectQueueEntry,
  ): Extract<Effect, { type: "draw" }> | undefined => {
    const match = resolveQueuedEffectDefinition(state, entry);
    if (
      match === undefined ||
      match.sourcePresencePolicy !== entry.sourcePresencePolicy
    ) {
      return undefined;
    }
    const supportShape = { ...match };
    delete (supportShape as { condition?: unknown }).condition;
    delete (supportShape as { conditionTiming?: unknown }).conditionTiming;
    if (
      !isSupportedQueuedDrawEffectBlock(supportShape) &&
      !canResolveQueuedDrawFromActivateMainEntry(supportShape, entry)
    ) {
      return undefined;
    }
    return supportShape.effect;
  };

  const resolveQueuedDrawUpToEffect = (
    state: GameState,
    entry: EffectQueueEntry,
  ): Extract<Effect, { type: "drawUpTo" }> | undefined => {
    const match = resolveQueuedEffectDefinition(state, entry);
    if (
      match === undefined ||
      match.sourcePresencePolicy !== entry.sourcePresencePolicy
    ) {
      return undefined;
    }
    const supportShape = { ...match };
    delete (supportShape as { condition?: unknown }).condition;
    delete (supportShape as { conditionTiming?: unknown }).conditionTiming;
    if (
      supportShape.category !== "auto" ||
      supportShape.optional === true ||
      supportShape.oncePerTurn === true ||
      supportShape.cost !== undefined ||
      supportShape.failurePolicy !== undefined ||
      supportShape.effect.type !== "drawUpTo" ||
      !Number.isInteger(supportShape.effect.count) ||
      supportShape.effect.count < 0
    ) {
      return undefined;
    }
    return supportShape.effect;
  };

  const withoutConditionFields = (
    effect: EffectDefinition["effects"][number],
  ): EffectDefinition["effects"][number] => {
    const supportShape = { ...effect };
    delete (supportShape as { condition?: unknown }).condition;
    delete (supportShape as { conditionTiming?: unknown }).conditionTiming;
    return supportShape;
  };

  const resolveQueuedContinuousEffect = (
    state: GameState,
    entry: EffectQueueEntry,
  ): ContinuousQueueEffect | undefined => {
    const match = resolveQueuedEffectDefinition(state, entry);
    if (
      match === undefined ||
      match.sourcePresencePolicy !== entry.sourcePresencePolicy
    ) {
      return undefined;
    }
    const supportShape = withoutConditionFields(match);
    if (!isSupportedContinuousQueueEffect(supportShape.effect)) {
      return undefined;
    }
    if (
      "target" in supportShape.effect &&
      supportShape.effect.target.type === "choose"
    ) {
      return undefined;
    }
    return supportShape.effect;
  };

  const resolveQueuedPlaySourceEffect = (
    state: GameState,
    entry: EffectQueueEntry,
  ): Extract<Effect, { type: "playSource" }> | undefined => {
    const match = resolveQueuedEffectDefinition(state, entry);
    if (
      match === undefined ||
      match.sourcePresencePolicy !== entry.sourcePresencePolicy ||
      match.category !== "auto" ||
      match.optional === true ||
      match.oncePerTurn === true ||
      match.cost !== undefined ||
      match.conditionTiming !== undefined ||
      match.failurePolicy !== undefined ||
      match.effect.type !== "playSource" ||
      match.effect.source.type !== "triggerCard" ||
      match.effect.ignoreCost !== true
    ) {
      return undefined;
    }
    return match.effect;
  };

  return {
    resolveQueuedEffectDefinition,
    resolveQueuedDrawEffect,
    resolveQueuedDrawUpToEffect,
    resolveQueuedContinuousEffect,
    resolveQueuedPlaySourceEffect,
    withoutConditionFields,
    canResolveQueuedDrawFromActivateMainEntry,
    isSupportedQueuedOptionalDrawEffectBlock,
  };
};
