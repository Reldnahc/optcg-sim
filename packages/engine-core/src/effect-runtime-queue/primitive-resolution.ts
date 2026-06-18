import type { Effect, EffectDefinition, EffectQueueEntry } from "@optcg/types";

import {
  isSupportedDrawUpToBody,
  isSupportedTrashFromHandBody,
} from "../effect-runtime-reusable-body-support.js";
import { resolveSupportedQueuedMoveCardsEffect } from "../effect-runtime-move-cards.js";
import { isSupportedPlaceTopDeckCardsEffect } from "../effect-runtime-top-deck-placement.js";
import {
  isSupportedDamageEffect,
  isSupportedDrawBody,
  isSupportedQueuedWinGameEffectForEntry,
  isSupportedTakeExtraTurnBody,
  isSupportedWinGameBody,
} from "../runtime/primitives/execute.js";
import { isSupportedTrashFromHandUntilCountBody } from "../runtime/primitives/trash-from-hand-until.js";

export type QueuedPrimitiveBody =
  | { kind: "draw"; effect: Extract<Effect, { type: "draw" }> }
  | { kind: "drawUpTo"; effect: Extract<Effect, { type: "drawUpTo" }> }
  | { kind: "moveCards"; effect: Extract<Effect, { type: "moveCards" }> }
  | {
      kind: "trashFromHand";
      effect: Extract<Effect, { type: "trashFromHand" }>;
    }
  | {
      kind: "trashFromHandUntilCount";
      effect: Extract<Effect, { type: "trashFromHandUntilCount" }>;
    }
  | {
      kind: "placeTopDeckCards";
      effect: Extract<Effect, { type: "placeTopDeckCards" }>;
    }
  | { kind: "damage"; effect: Extract<Effect, { type: "damage" }> }
  | {
      kind: "takeExtraTurn";
      effect: Extract<Effect, { type: "takeExtraTurn" }>;
    }
  | { kind: "winGame"; effect: Extract<Effect, { type: "winGame" }> };

export const resolveQueuedPrimitiveBody = (
  block: EffectDefinition["effects"][number] | undefined,
  entry: EffectQueueEntry,
): QueuedPrimitiveBody | undefined => {
  if (
    block === undefined ||
    block.sourcePresencePolicy !== entry.sourcePresencePolicy
  ) {
    return undefined;
  }

  const effect = block.effect;
  if (isSupportedDrawBody(effect)) {
    return { kind: "draw", effect };
  }
  if (isSupportedDrawUpToBody(effect)) {
    return { kind: "drawUpTo", effect };
  }
  const moveCards = resolveSupportedQueuedMoveCardsEffect(block, entry);
  if (moveCards !== undefined) {
    return { kind: "moveCards", effect: moveCards };
  }
  if (isSupportedTrashFromHandBody(effect)) {
    return { kind: "trashFromHand", effect };
  }
  if (isSupportedTrashFromHandUntilCountBody(effect)) {
    return { kind: "trashFromHandUntilCount", effect };
  }
  if (isSupportedPlaceTopDeckCardsEffect(effect)) {
    return { kind: "placeTopDeckCards", effect };
  }
  if (isSupportedDamageEffect(effect)) {
    return { kind: "damage", effect };
  }
  if (isSupportedTakeExtraTurnBody(effect)) {
    return { kind: "takeExtraTurn", effect };
  }
  if (
    isSupportedWinGameBody(effect) &&
    isSupportedQueuedWinGameEffectForEntry(block, entry)
  ) {
    return { kind: "winGame", effect };
  }
  return undefined;
};

export const canResolvePrimitiveBodyForEntry = (
  block: EffectDefinition["effects"][number],
  entry: EffectQueueEntry,
): boolean => resolveQueuedPrimitiveBody(block, entry) !== undefined;
