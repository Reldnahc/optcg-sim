import type {
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  GameState,
} from "@optcg/types";

import { isScopedActivateMainQueueEntry } from "../optional-activation/activate-main-support.js";
import { resolvePlayerId } from "./draw.js";

type TrashFromHandEffect = Extract<Effect, { type: "trashFromHand" }>;
type TrashFromHandUntilCountEffect = Extract<
  Effect,
  { type: "trashFromHandUntilCount" }
>;

export type ResolvedTrashFromHandUntilCount =
  | { kind: "effect"; effect: TrashFromHandEffect }
  | { kind: "noop" }
  | { kind: "unsupported" };

const isSupportedTrashFromHandUntilCountShape = (
  effect: Effect,
): effect is TrashFromHandUntilCountEffect =>
  effect.type === "trashFromHandUntilCount" &&
  effect.player === "self" &&
  effect.chooser === "self" &&
  Number.isInteger(effect.handCount) &&
  effect.handCount >= 0;

const hasSupportedTrashFromHandUntilCountEffectEnvelope = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: TrashFromHandUntilCountEffect;
} =>
  effect.optional !== true &&
  effect.oncePerTurn !== true &&
  effect.cost === undefined &&
  effect.conditionTiming === undefined &&
  effect.failurePolicy === undefined &&
  isSupportedTrashFromHandUntilCountShape(effect.effect);

export const isSupportedQueuedTrashFromHandUntilCountEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: TrashFromHandUntilCountEffect;
} =>
  effect.category === "auto" &&
  hasSupportedTrashFromHandUntilCountEffectEnvelope(effect);

export const isSupportedActivateMainTrashFromHandUntilCountEffect = (
  effect: EffectDefinition["effects"][number],
  entry: EffectQueueEntry,
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: TrashFromHandUntilCountEffect;
} =>
  isScopedActivateMainQueueEntry(entry) &&
  effect.category === "activate" &&
  effect.trigger.type === "activateMain" &&
  effect.sourcePresencePolicy === "mustRemainInSameZone" &&
  hasSupportedTrashFromHandUntilCountEffectEnvelope(effect);

export const isSupportedTrashFromHandUntilCountBody = (
  effect: Effect,
): effect is TrashFromHandUntilCountEffect =>
  isSupportedTrashFromHandUntilCountShape(effect);

export const resolveTrashFromHandUntilCount = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: TrashFromHandUntilCountEffect,
): ResolvedTrashFromHandUntilCount => {
  if (!isSupportedTrashFromHandUntilCountShape(effect)) {
    return { kind: "unsupported" };
  }
  const playerId = resolvePlayerId(state, entry, effect.player);
  const chooserId = resolvePlayerId(state, entry, effect.chooser);
  if (playerId === undefined || chooserId !== playerId) {
    return { kind: "unsupported" };
  }
  const player = state.players[playerId];
  if (player === undefined) {
    return { kind: "unsupported" };
  }
  const count = player.hand.length - effect.handCount;
  if (count <= 0) {
    return { kind: "noop" };
  }
  return {
    kind: "effect",
    effect: {
      type: "trashFromHand",
      player: effect.player,
      chooser: effect.chooser,
      count,
    },
  };
};
