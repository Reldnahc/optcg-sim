import type { CardInstance, GameState, PlayerId } from "@optcg/types";

import {
  isSupportedNoChoiceOnPlayDrawEffect,
  resolveImplementedDslEffectDefinition,
} from "./effect-runtime.js";

export type SupportedPlayMetadata = {
  category: "character" | "stage" | "event";
  printedCost: number;
};

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
      resolved.category !== "character" ||
      resolved.cost === undefined ||
      hasUnsupportedPlayText(resolved.triggerText)
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
    if (lookup.definition.effects.length !== 1) {
      return null;
    }
    const effect = lookup.definition.effects[0];
    if (effect === undefined || !isSupportedNoChoiceOnPlayDrawEffect(effect)) {
      return null;
    }
    return {
      category: "character",
      printedCost: Math.max(0, resolved.cost),
    };
  }
  if (resolved.support.status !== "vanilla-confirmed") {
    return null;
  }
  if (resolved.category === "character" || resolved.category === "stage") {
    if (
      hasUnsupportedPlayText(resolved.effectText) ||
      hasUnsupportedPlayText(resolved.triggerText) ||
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
  if (hasUnsupportedPlayText(resolved.triggerText)) {
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

const hasUnsupportedPlayText = (text: string | undefined): boolean =>
  text !== undefined && text.trim().length > 0;
