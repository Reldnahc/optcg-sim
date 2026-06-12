import type {
  Effect,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
} from "@optcg/types";

import {
  appendEvent,
  toEngineResult,
  toStateSeq,
} from "../../action-results.js";
import { getOpponentId } from "../../actions/state.js";
import { getLifeDamageDecision } from "../../life-trigger/actions.js";

type DamageEffect = Extract<Effect, { type: "damage" }>;

const damageExecutionError = (
  effectId: string,
  reason: string,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason },
});

export const isSupportedDamageEffect = (
  effect: Effect,
): effect is DamageEffect =>
  effect.type === "damage" &&
  (effect.player === "self" || effect.player === "opponent") &&
  effect.count === 1;

const resolveDamagePlayerId = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: DamageEffect,
) =>
  effect.player === "self"
    ? entry.controllerId
    : getOpponentId(state, entry.controllerId);

export const executeDamagePrimitive = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Effect,
): EngineResult => {
  if (!isSupportedDamageEffect(effect)) {
    return toEngineResult(
      state,
      [],
      [damageExecutionError(entry.effectBlockId, "unsupported-effect-shape")],
    );
  }

  const damagedPlayerId = resolveDamagePlayerId(state, entry, effect);
  const damaged =
    damagedPlayerId === null ? undefined : state.players[damagedPlayerId];
  if (damagedPlayerId === null || damaged === undefined) {
    return toEngineResult(
      state,
      [],
      [damageExecutionError(entry.effectBlockId, "unsupported-player-ref")],
    );
  }

  const topLife = damaged.life[0];
  if (topLife === undefined) {
    return toEngineResult(
      state,
      [],
      [damageExecutionError(entry.effectBlockId, "unsupported-zero-life")],
    );
  }

  const decision = getLifeDamageDecision(state, damagedPlayerId, topLife.card);
  if (decision === undefined) {
    return toEngineResult(
      state,
      [],
      [damageExecutionError(entry.effectBlockId, "unsupported-life-decision")],
    );
  }

  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "damageDealt",
    {
      source: entry.source,
      damagedPlayerId,
      amount: 1,
      reason: "effect",
    },
    { type: "public" },
  );
  appendEvent(
    state,
    events,
    "lifeTaken",
    {
      damagedPlayerId,
      amount: 1,
    },
    { type: "public" },
  );
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
    },
    { type: "private", playerId: damagedPlayerId },
  );
  for (const event of events) {
    event.causedBy = {
      type: "effect",
      queueEntryId: entry.id,
      effectId: entry.effectBlockId,
    };
  }

  const nextLife = damaged.life.slice(1).map((lifeCard, index) => ({
    ...lifeCard,
    card: {
      ...lifeCard.card,
      zone: {
        zone: "life" as const,
        playerId: damagedPlayerId,
        slot: "life" as const,
        index,
      },
    },
  }));

  return toEngineResult(
    {
      ...state,
      seq: toStateSeq(state.seq + 1),
      players: {
        ...state.players,
        [damagedPlayerId]: {
          ...damaged,
          life: nextLife,
        },
      },
      pendingDecision: decision,
      eventJournal: [...state.eventJournal, ...events],
    },
    events,
  );
};
