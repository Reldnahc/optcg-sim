import type {
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  GameState,
} from "@optcg/types";

import {
  isSupportedActivateMainTrashFromHandEffect,
  isSupportedQueuedTrashFromHandEffect,
} from "../runtime/primitives/trash-from-hand.js";
import {
  isSupportedActivateMainTrashFromHandUntilCountEffect,
  isSupportedQueuedTrashFromHandUntilCountEffect,
  resolveTrashFromHandUntilCount,
} from "../runtime/primitives/trash-from-hand-until.js";

type TrashFromHandEffect = Extract<Effect, { type: "trashFromHand" }>;

export type QueuedTrashFromHandDecisionResolution =
  | { kind: "decision"; effect: TrashFromHandEffect }
  | { kind: "noop" }
  | { kind: "unsupported" };

export type ResolveQueuedEffectDefinition = (
  state: GameState,
  entry: EffectQueueEntry,
) => EffectDefinition["effects"][number] | undefined;

export const resolveQueuedTrashFromHandDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  resolveQueuedEffectDefinition: ResolveQueuedEffectDefinition,
  resolvedEffectBlock?: EffectDefinition["effects"][number],
): QueuedTrashFromHandDecisionResolution | undefined => {
  const match =
    resolvedEffectBlock ?? resolveQueuedEffectDefinition(state, entry);
  if (
    match === undefined ||
    match.sourcePresencePolicy !== entry.sourcePresencePolicy
  ) {
    return undefined;
  }
  if (
    isSupportedQueuedTrashFromHandEffect(match) ||
    isSupportedActivateMainTrashFromHandEffect(match, entry)
  ) {
    return { kind: "decision", effect: match.effect };
  }
  if (
    isSupportedQueuedTrashFromHandUntilCountEffect(match) ||
    isSupportedActivateMainTrashFromHandUntilCountEffect(match, entry)
  ) {
    const resolved = resolveTrashFromHandUntilCount(state, entry, match.effect);
    if (resolved.kind === "effect") {
      return { kind: "decision", effect: resolved.effect };
    }
    return resolved;
  }
  return match.effect.type === "trashFromHandUntilCount"
    ? { kind: "unsupported" }
    : undefined;
};
