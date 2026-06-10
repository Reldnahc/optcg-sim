import type {
  EffectDefinition,
  EffectQueueEntry,
  GameState,
} from "@optcg/types";

import { isSupportedEffectResolvedCustomDrawEffect } from "./runtime/primitives/execute.js";
import { isLifeTriggerQueueEntry } from "./life-trigger/queue-origin.js";

type EngineInternalBattleState = NonNullable<GameState["battle"]> & {
  damageProcess?: {
    type?: string;
    remainingDamagePoints: number;
  };
};

export type ResolveQueuedEffectDefinition = (
  state: GameState,
  entry: EffectQueueEntry,
) => EffectDefinition["effects"][number] | undefined;

export const isActiveDoubleAttackDamageProcess = (state: GameState): boolean =>
  (() => {
    const battle = state.battle as EngineInternalBattleState | undefined;
    return (
      battle?.damageProcess?.type === "multipleDamage" &&
      battle.damageProcess.remainingDamagePoints > 0
    );
  })();

const isPublicFieldZone = (zone: EffectQueueEntry["source"]["zone"]): boolean =>
  zone?.zone === "leaderArea" ||
  zone?.zone === "characterArea" ||
  zone?.zone === "stageArea";

const isSupportedDamageDeferredEffectQueueEntry = (
  state: GameState,
  entry: EffectQueueEntry,
  resolveQueuedEffectDefinition: ResolveQueuedEffectDefinition,
): boolean => {
  if (
    entry.causedBy.type !== "effect" ||
    !isLifeTriggerQueueEntry(entry) ||
    entry.triggerEventId === undefined ||
    entry.generation <= 0 ||
    !isPublicFieldZone(entry.source.zone) ||
    !isPublicFieldZone(entry.sourceSnapshot.zone)
  ) {
    return false;
  }
  const effect = resolveQueuedEffectDefinition(state, entry);
  return (
    effect !== undefined &&
    effect.sourcePresencePolicy === entry.sourcePresencePolicy &&
    isSupportedEffectResolvedCustomDrawEffect(
      effect,
      `effectResolved:${String(entry.causedBy.effectId)}`,
    )
  );
};

export const hasExactDamageDeferredQueue = (
  state: GameState,
  resolveQueuedEffectDefinition: ResolveQueuedEffectDefinition,
): boolean => {
  if (state.deferredTriggers.length !== 1 || state.effectQueue.length !== 1) {
    return false;
  }
  const bucket = state.deferredTriggers[0];
  const entry = state.effectQueue[0];
  if (bucket === undefined || entry === undefined) {
    return false;
  }
  return (
    bucket.releasePolicy === "afterCurrentProcess" &&
    bucket.triggerIds.length === 1 &&
    bucket.triggerIds[0] === String(entry.id) &&
    bucket.timingWindowId === entry.timingWindowId &&
    bucket.generation === entry.generation &&
    entry.state === "pending" &&
    isSupportedDamageDeferredEffectQueueEntry(
      state,
      entry,
      resolveQueuedEffectDefinition,
    )
  );
};
