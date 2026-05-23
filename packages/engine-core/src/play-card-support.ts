import type {
  CardInstance,
  EffectDefinition,
  GameState,
  PlayerId,
} from "@optcg/types";

import {
  isSupportedMainEventTargetKoEffect,
  isSupportedNoChoiceMainEventDrawEffect,
  isSupportedNoChoiceOnPlayDrawEffect,
  resolveImplementedDslEffectDefinition,
} from "./effect-runtime.js";
import {
  isSupportedOptionalNoChoiceMainEventDrawEffect,
  isSupportedOptionalNoChoiceOnPlayDrawEffect,
} from "./effect-runtime-primitives.js";
import { hasUnsupportedSupportGateText } from "./battle-support.js";

export type SupportedPlayMetadata = {
  category: "character" | "stage" | "event";
  printedCost: number;
};

const isSupportedMainEventTargetKoEffectAllowingOncePerTurn = (
  effect: EffectDefinition["effects"][number],
): boolean => {
  if (isSupportedMainEventTargetKoEffect(effect)) {
    return true;
  }
  if (effect.oncePerTurn !== true) {
    return false;
  }
  const effectWithoutOncePerTurn: EffectDefinition["effects"][number] = {
    ...effect,
  };
  delete effectWithoutOncePerTurn.oncePerTurn;
  return isSupportedMainEventTargetKoEffect(effectWithoutOncePerTurn);
};

const isSupportedOnPlayDrawUpToEffect = (
  effect: EffectDefinition["effects"][number],
): boolean =>
  effect.sourcePresencePolicy === "mustRemainInSameZone" &&
  effect.trigger.type === "onPlay" &&
  effect.category === "auto" &&
  effect.optional !== true &&
  effect.oncePerTurn !== true &&
  effect.cost === undefined &&
  effect.condition === undefined &&
  effect.conditionTiming === undefined &&
  effect.failurePolicy === undefined &&
  effect.effect.type === "drawUpTo" &&
  Number.isInteger(effect.effect.count) &&
  effect.effect.count >= 0 &&
  effect.effect.player === "self";

const isSupportedMainEventDrawUpToEffect = (
  effect: EffectDefinition["effects"][number],
): boolean =>
  effect.sourcePresencePolicy === "resolveFromDestinationZone" &&
  effect.trigger.type === "main" &&
  effect.category === "auto" &&
  effect.optional !== true &&
  effect.oncePerTurn !== true &&
  effect.cost === undefined &&
  effect.condition === undefined &&
  effect.conditionTiming === undefined &&
  effect.failurePolicy === undefined &&
  effect.effect.type === "drawUpTo" &&
  Number.isInteger(effect.effect.count) &&
  effect.effect.count >= 0 &&
  effect.effect.player === "self";

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
      const matching = onPlayEffects.filter(
        (effect) =>
          isSupportedNoChoiceOnPlayDrawEffect(effect) ||
          isSupportedOptionalNoChoiceOnPlayDrawEffect(effect) ||
          isSupportedOnPlayDrawUpToEffect(effect),
      );
      if (matching.length !== onPlayEffects.length || matching.length !== 1) {
        return null;
      }
      const effect = matching[0];
      if (effect === undefined || effect.trigger.type !== "onPlay") {
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
      const matching = mainEffects.filter(
        (effect) =>
          isSupportedNoChoiceMainEventDrawEffect(effect) ||
          isSupportedOptionalNoChoiceMainEventDrawEffect(effect) ||
          isSupportedMainEventDrawUpToEffect(effect) ||
          isSupportedMainEventTargetKoEffectAllowingOncePerTurn(effect),
      );
      if (matching.length !== mainEffects.length || matching.length !== 1) {
        return null;
      }
      const effect = matching[0];
      if (effect === undefined || effect.trigger.type !== "main") {
        return null;
      }
      return {
        category: "event",
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
