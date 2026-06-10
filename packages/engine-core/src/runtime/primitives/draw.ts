import type {
  CardInstance,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
  PlayerRef,
  SourcePresencePolicy,
} from "@optcg/types";

import {
  appendEvent,
  toEngineResult,
  toStateSeq,
} from "../../action-results.js";
import {
  addCardsToHand,
  getOpponentId,
  reindexZoneCards,
} from "../../actions/state.js";
import { autoRuntimeEntryAdaptersForBlock } from "../../effect-runtime-entry-adapters.js";

export type DrawExecutionFailureReason =
  | "unsupported-effect-shape"
  | "unsupported-player-ref"
  | "invalid-draw-count";

interface EffectExecutionErrorDetails {
  reason: DrawExecutionFailureReason;
}

const drawExecutionError = (
  effectId: string,
  reason: DrawExecutionFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies EffectExecutionErrorDetails,
});

export const resolvePlayerId = (
  state: GameState,
  entry: EffectQueueEntry,
  ref: PlayerRef,
): PlayerId | undefined => {
  switch (ref) {
    case "self":
    case "controller":
      return entry.controllerId;
    case "owner":
      return entry.source.playerId;
    case "turnPlayer":
      return state.turn.turnPlayerId;
    case "opponent":
      return getOpponentId(state, entry.controllerId) ?? undefined;
    case "nonTurnPlayer":
      return getOpponentId(state, state.turn.turnPlayerId) ?? undefined;
    default:
      return undefined;
  }
};

const executeDrawEffect = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Extract<Effect, { type: "draw" }>,
  options: { incrementStateSeq?: boolean } = {},
): EngineResult => {
  if (!Number.isInteger(effect.count) || effect.count < 0) {
    return toEngineResult(
      state,
      [],
      [drawExecutionError(entry.effectBlockId, "invalid-draw-count")],
    );
  }

  const playerId = resolvePlayerId(state, entry, effect.player);
  if (playerId === undefined || state.players[playerId] === undefined) {
    return toEngineResult(
      state,
      [],
      [drawExecutionError(entry.effectBlockId, "unsupported-player-ref")],
    );
  }

  if (effect.count === 0) {
    return toEngineResult(state, []);
  }
  if (isDrawPreventedByOwnEffects(state, entry, playerId)) {
    return toEngineResult(state, []);
  }

  const player = state.players[playerId];
  const events: EngineEvent[] = [];
  let nextDeck = player.deck;
  let nextHand = player.hand;
  const maxDraw = Math.min(effect.count, nextDeck.length);
  for (let index = 0; index < maxDraw; index += 1) {
    const drawn = nextDeck[0];
    if (drawn === undefined) {
      break;
    }
    const remaining = nextDeck.slice(1).map((card, deckIndex) => ({
      ...card,
      zone: {
        zone: "deck" as const,
        playerId,
        slot: "deck" as const,
        index: deckIndex,
      },
    }));
    const moved: CardInstance = {
      ...drawn,
      zone: {
        zone: "hand" as const,
        playerId,
        slot: "hand" as const,
        index: nextHand.length,
      },
    };
    nextDeck = remaining;
    nextHand = addCardsToHand(nextHand, [moved], playerId);

    appendEvent(state, events, "cardDrawn", { playerId });
    appendEvent(
      state,
      events,
      "cardMoved",
      { from: "deck", to: "hand", playerId, reason: "draw" },
      { type: "public" },
    );
    appendEvent(
      state,
      events,
      "cardMoved",
      {
        from: { zone: "deck", playerId, slot: "deck", index: 0 },
        to: moved.zone,
        playerId,
        reason: "draw",
        instanceId: moved.instanceId,
        cardId: moved.cardId,
      },
      { type: "private", playerId },
    );
  }

  const shouldIncrementStateSeq = options.incrementStateSeq ?? true;
  const nextState: GameState = {
    ...state,
    ...(shouldIncrementStateSeq ? { seq: toStateSeq(state.seq + 1) } : {}),
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        deck: reindexZoneCards(nextDeck, "deck", playerId, "deck"),
        hand: nextHand,
      },
    },
    eventJournal: [...state.eventJournal, ...events],
  };

  return toEngineResult(nextState, events);
};

export const isSupportedDrawBody = (
  effect: Effect,
): effect is Extract<Effect, { type: "draw" }> =>
  effect.type === "draw" &&
  Number.isInteger(effect.count) &&
  effect.count >= 0 &&
  effect.player === "self";

const targetPlayerForDrawRestriction = (
  state: GameState,
  effect: GameState["continuousEffects"][number],
): PlayerId | undefined => {
  const target = effect.modifier.target;
  if (target.type !== "player") {
    return undefined;
  }
  switch (target.player) {
    case "self":
    case "controller":
      return effect.controller;
    case "owner":
      return effect.source.playerId;
    case "opponent":
      return getOpponentId(state, effect.controller) ?? undefined;
    case "turnPlayer":
      return state.turn.turnPlayerId;
    case "nonTurnPlayer":
      return getOpponentId(state, state.turn.turnPlayerId) ?? undefined;
    default:
      return undefined;
  }
};

const isDrawPreventedByOwnEffects = (
  state: GameState,
  entry: EffectQueueEntry,
  playerId: PlayerId,
): boolean =>
  entry.controllerId === playerId &&
  state.continuousEffects.some((effect) => {
    if (
      effect.modifier.layer !== "restriction" ||
      effect.modifier.operation.type !== "restriction" ||
      effect.modifier.operation.restriction !== "cannotDrawByOwnEffects" ||
      effect.modifier.target.type !== "player"
    ) {
      return false;
    }
    return targetPlayerForDrawRestriction(state, effect) === playerId;
  });

export const executeDrawPrimitiveForResolvedQuantity = (
  state: GameState,
  entry: EffectQueueEntry,
  player: PlayerRef,
  count: number,
): EngineResult =>
  executeDrawEffect(
    state,
    entry,
    { type: "draw", count, player },
    { incrementStateSeq: false },
  );

export const executeNoChoiceEffectPrimitive = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Effect,
  options: { incrementStateSeq?: boolean } = {},
): EngineResult => {
  if (effect.type !== "draw") {
    return toEngineResult(
      state,
      [],
      [drawExecutionError(entry.effectBlockId, "unsupported-effect-shape")],
    );
  }
  return executeDrawEffect(state, entry, effect, options);
};

type DrawEffectBlock = EffectDefinition["effects"][number] & {
  effect: Extract<Effect, { type: "draw" }>;
  sourcePresencePolicy: SourcePresencePolicy;
};

const hasSupportedDrawEffectEnvelope = (
  effect: EffectDefinition["effects"][number],
  options: {
    readonly optional: "required" | "optional" | "any";
    readonly allowOncePerTurn?: boolean;
  },
): effect is DrawEffectBlock => {
  if (effect.sourcePresencePolicy === undefined) {
    return false;
  }
  if (effect.category !== "auto") {
    return false;
  }
  if (
    (options.optional === "required" && effect.optional === true) ||
    (options.optional === "optional" && effect.optional !== true) ||
    (effect.oncePerTurn === true && !options.allowOncePerTurn)
  ) {
    return false;
  }
  if (
    effect.cost !== undefined ||
    effect.condition !== undefined ||
    effect.conditionTiming !== undefined ||
    effect.failurePolicy !== undefined
  ) {
    return false;
  }
  return isSupportedDrawBody(effect.effect);
};

const isSupportedAutoRuntimeDrawEntryPoint = (
  effect: DrawEffectBlock,
): boolean => {
  const adapters = autoRuntimeEntryAdaptersForBlock(effect);
  return (
    adapters.length > 0 &&
    adapters.every((adapter) =>
      adapter.sourcePresencePolicies.includes(effect.sourcePresencePolicy),
    )
  );
};

const isSupportedEffectResolvedCustomDrawEntryPoint = (
  effect: DrawEffectBlock,
  eventName: string,
): boolean =>
  effect.trigger.type === "custom" &&
  effect.trigger.event === eventName &&
  effect.sourcePresencePolicy === "mustRemainInSameZone";

const isSupportedQueuedCustomDrawEntryPoint = (
  effect: DrawEffectBlock,
): boolean =>
  effect.trigger.type === "custom" &&
  (effect.sourcePresencePolicy === "mustRemainInSameZone" ||
    effect.sourcePresencePolicy === "noSourceRequired");

export const isSupportedEffectResolvedCustomDrawEffect = (
  effect: EffectDefinition["effects"][number],
  eventName: string,
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} =>
  effect.sourcePresencePolicy === "mustRemainInSameZone" &&
  effect.trigger.type === "custom" &&
  effect.trigger.event === eventName &&
  hasSupportedDrawEffectEnvelope(effect, {
    optional: "required",
    allowOncePerTurn: true,
  }) &&
  isSupportedEffectResolvedCustomDrawEntryPoint(effect, eventName);

export const isSupportedQueuedDrawEffectBlock = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} =>
  hasSupportedDrawEffectEnvelope(effect, {
    optional: "required",
    allowOncePerTurn: true,
  }) &&
  (isSupportedAutoRuntimeDrawEntryPoint(effect) ||
    isSupportedQueuedCustomDrawEntryPoint(effect));

export const isSupportedQueuedOptionalDrawEffectBlock = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} =>
  hasSupportedDrawEffectEnvelope(effect, {
    optional: "optional",
    allowOncePerTurn: true,
  }) && isSupportedAutoRuntimeDrawEntryPoint(effect);
