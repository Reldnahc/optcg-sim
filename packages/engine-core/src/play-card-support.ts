import type {
  CardInstance,
  EffectDefinition,
  GameState,
  PlayerId,
} from "@optcg/types";

import { evaluateEffectBlockRuntimeSupport } from "./effect-runtime-admission.js";
import { resolveImplementedDslEffectDefinition } from "./effect-runtime.js";
import { hasUnsupportedSupportGateText } from "./battle-support.js";

export type SupportedPlayMetadata = {
  category: "character" | "stage" | "event";
  printedCost: number;
};

const hasOnlySupportedRelevantEffects = (
  effects: readonly EffectDefinition["effects"][number][],
  predicate: (effect: EffectDefinition["effects"][number]) => boolean,
  options: { requireAtLeastOne: boolean },
): boolean =>
  (!options.requireAtLeastOne || effects.length > 0) &&
  effects.every(predicate);

const isRuntimeAdmittedEffect = (
  effect: EffectDefinition["effects"][number],
): boolean => evaluateEffectBlockRuntimeSupport(effect).supported;

export const canResolveDestinationConflict = (
  player: GameState["players"][PlayerId],
  category: SupportedPlayMetadata["category"],
): boolean => {
  if (category === "character") {
    return player.characters.length <= 5;
  }
  if (category === "stage") {
    return player.stage === undefined || player.stage.attachedDon.length === 0;
  }
  return true;
};

export const getSupportedPlayMetadata = (
  state: GameState,
  card: CardInstance,
): SupportedPlayMetadata | null => {
  const resolved = state.cardManifest.cards[card.cardId];
  if (resolved === undefined) {
    return null;
  }
  if (resolved.support.status === "implemented-dsl") {
    if (
      resolved.cost === undefined ||
      hasUnsupportedSupportGateText(resolved.triggerText, resolved)
    ) {
      return null;
    }
    const lookup = resolveImplementedDslEffectDefinition(
      resolved,
      state.cardManifest,
    );
    if (!lookup.ok) {
      return null;
    }
    if (resolved.category === "character") {
      const onPlayEffects = lookup.definition.effects.filter(
        (effect) => effect.trigger.type === "onPlay",
      );
      if (
        !hasOnlySupportedRelevantEffects(
          onPlayEffects,
          isRuntimeAdmittedEffect,
          { requireAtLeastOne: false },
        ) ||
        !lookup.definition.effects
          .filter((effect) => effect.trigger.type !== "onPlay")
          .every(isRuntimeAdmittedEffect)
      ) {
        return null;
      }
      return {
        category: "character",
        printedCost: Math.max(0, resolved.cost),
      };
    }
    if (resolved.category === "event") {
      const mainEffects = lookup.definition.effects.filter(
        (effect) => effect.trigger.type === "main",
      );
      if (
        !hasOnlySupportedRelevantEffects(mainEffects, isRuntimeAdmittedEffect, {
          requireAtLeastOne: true,
        })
      ) {
        return null;
      }
      return {
        category: "event",
        printedCost: Math.max(0, resolved.cost),
      };
    }
    if (resolved.category === "stage") {
      if (!lookup.definition.effects.every(isRuntimeAdmittedEffect)) {
        return null;
      }
      return {
        category: "stage",
        printedCost: Math.max(0, resolved.cost),
      };
    }
    return null;
  }
  if (resolved.support.status !== "vanilla-confirmed") {
    return null;
  }
  if (resolved.category === "character" || resolved.category === "stage") {
    if (
      hasUnsupportedSupportGateText(resolved.effectText, resolved) ||
      hasUnsupportedSupportGateText(resolved.triggerText, resolved) ||
      resolved.cost === undefined
    ) {
      return null;
    }
    return {
      category: resolved.category,
      printedCost: Math.max(0, resolved.cost),
    };
  }
  if (resolved.category !== "event") {
    return null;
  }
  if (resolved.cost === undefined) {
    return null;
  }
  if ((resolved.effectText ?? "").trim() !== "[Main]") {
    return null;
  }
  if (hasUnsupportedSupportGateText(resolved.triggerText, resolved)) {
    return null;
  }
  return {
    category: "event",
    printedCost: Math.max(0, resolved.cost),
  };
};

export const getPlayableHandCards = (
  state: GameState,
  playerId: PlayerId,
): CardInstance[] => {
  const player = state.players[playerId];
  if (player === undefined) {
    return [];
  }
  const activeDonCount = getActiveDonCount(player.costArea);
  return player.hand.filter((card) => {
    const supported = getSupportedPlayMetadata(state, card);
    if (supported === null) {
      return false;
    }
    if (activeDonCount < supported.printedCost) {
      return false;
    }
    return canResolveDestinationConflict(player, supported.category);
  });
};

export const getActiveDonCount = (costArea: readonly CardInstance[]): number =>
  costArea.filter((card) => card.state === "active").length;
