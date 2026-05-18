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
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "./action-results.js";
import { getOpponentId, reindexZoneCards } from "./action-state.js";

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
    nextHand = [...nextHand, moved];

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
        hand: reindexZoneCards(nextHand, "hand", playerId, "hand"),
      },
    },
    eventJournal: [...state.eventJournal, ...events],
  };

  return toEngineResult(nextState, events);
};

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

const isNoChoiceDrawTriggerEffect = (
  effect: EffectDefinition["effects"][number],
  triggerType: "onPlay" | "whenAttacking" | "onOpponentAttack",
  options: { allowOptional?: boolean; allowOncePerTurn?: boolean } = {},
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} => {
  if (effect.trigger.type !== triggerType) {
    return false;
  }
  if (effect.category !== "auto") {
    return false;
  }
  if (
    (effect.optional === true && !options.allowOptional) ||
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
  return (
    effect.effect.type === "draw" &&
    Number.isInteger(effect.effect.count) &&
    effect.effect.count >= 0 &&
    effect.effect.player === "self"
  );
};

const isNoChoiceDrawEffectShape = (
  effect: EffectDefinition["effects"][number],
  options: { allowOptional?: boolean; allowOncePerTurn?: boolean } = {},
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} => {
  if (effect.category !== "auto") {
    return false;
  }
  if (
    (effect.optional === true && !options.allowOptional) ||
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
  return (
    effect.effect.type === "draw" &&
    Number.isInteger(effect.effect.count) &&
    effect.effect.count >= 0 &&
    effect.effect.player === "self"
  );
};

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
  isNoChoiceDrawEffectShape(effect, { allowOncePerTurn: true });

const isSupportedNoChoiceDrawTriggerEffect = (
  effect: EffectDefinition["effects"][number],
  triggerType: "onPlay" | "whenAttacking" | "onOpponentAttack",
  options: { allowOncePerTurn?: boolean } = {},
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} =>
  effect.sourcePresencePolicy === "mustRemainInSameZone" &&
  isNoChoiceDrawTriggerEffect(
    effect,
    triggerType,
    options.allowOncePerTurn === true ? { allowOncePerTurn: true } : {},
  );

export const isSupportedNoChoiceOnPlayDrawEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} =>
  isSupportedNoChoiceDrawTriggerEffect(effect, "onPlay", {
    allowOncePerTurn: true,
  });

export const isSupportedOptionalNoChoiceOnPlayDrawEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} =>
  effect.optional === true &&
  effect.sourcePresencePolicy === "mustRemainInSameZone" &&
  isNoChoiceDrawTriggerEffect(effect, "onPlay", {
    allowOptional: true,
    allowOncePerTurn: true,
  });

export const isSupportedNoChoiceWhenAttackingDrawEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} =>
  isSupportedNoChoiceDrawTriggerEffect(effect, "whenAttacking", {
    allowOncePerTurn: true,
  });

export const isSupportedOptionalNoChoiceWhenAttackingDrawEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} =>
  effect.optional === true &&
  effect.sourcePresencePolicy === "mustRemainInSameZone" &&
  isNoChoiceDrawTriggerEffect(effect, "whenAttacking", {
    allowOptional: true,
    allowOncePerTurn: true,
  });

export const isSupportedNoChoiceOnOpponentAttackDrawEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} =>
  isSupportedNoChoiceDrawTriggerEffect(effect, "onOpponentAttack", {
    allowOncePerTurn: true,
  });

export const isSupportedOptionalNoChoiceOnOpponentAttackDrawEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} =>
  effect.optional === true &&
  effect.sourcePresencePolicy === "mustRemainInSameZone" &&
  isNoChoiceDrawTriggerEffect(effect, "onOpponentAttack", {
    allowOptional: true,
    allowOncePerTurn: true,
  });

export const isSupportedNoChoiceOnKODrawEffect = (
  effect: EffectDefinition["effects"][number],
  options: { allowOncePerTurn?: boolean } = {},
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} =>
  (effect.sourcePresencePolicy === "resolveFromDestinationZone" ||
    effect.sourcePresencePolicy === "resolveFromLastKnownInformation") &&
  effect.trigger.type === "onKO" &&
  isNoChoiceDrawEffectShape(
    effect,
    options.allowOncePerTurn === true || options.allowOncePerTurn === undefined
      ? { allowOncePerTurn: true }
      : {},
  );

export const isSupportedOptionalNoChoiceOnKODrawEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} =>
  effect.optional === true &&
  (effect.sourcePresencePolicy === "resolveFromDestinationZone" ||
    effect.sourcePresencePolicy === "resolveFromLastKnownInformation") &&
  effect.trigger.type === "onKO" &&
  isNoChoiceDrawEffectShape(effect, {
    allowOptional: true,
    allowOncePerTurn: true,
  });

export const isSupportedNoChoiceMainEventDrawEffect = (
  effect: EffectDefinition["effects"][number],
  options: { allowOncePerTurn?: boolean } = {},
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} =>
  effect.sourcePresencePolicy === "resolveFromDestinationZone" &&
  effect.trigger.type === "main" &&
  isNoChoiceDrawEffectShape(
    effect,
    options.allowOncePerTurn === true ? { allowOncePerTurn: true } : {},
  );

export const isSupportedOptionalNoChoiceMainEventDrawEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} =>
  effect.optional === true &&
  effect.sourcePresencePolicy === "resolveFromDestinationZone" &&
  effect.trigger.type === "main" &&
  isNoChoiceDrawEffectShape(effect, {
    allowOptional: true,
    allowOncePerTurn: true,
  });

const isSupportedQueuedNoChoiceOnKODrawEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} => isSupportedNoChoiceOnKODrawEffect(effect, { allowOncePerTurn: true });

const isSupportedNoChoiceLifeTriggerDrawEffect = (
  effect: EffectDefinition["effects"][number],
  options: { allowOncePerTurn?: boolean } = {},
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} => {
  if (
    effect.sourcePresencePolicy !== "resolveFromLastKnownInformation" &&
    effect.sourcePresencePolicy !== "noSourceRequired"
  ) {
    return false;
  }
  if (effect.trigger.type !== "trigger") {
    return false;
  }
  if (effect.category !== "auto") {
    return false;
  }
  if (
    effect.optional !== undefined ||
    (effect.oncePerTurn === true && !options.allowOncePerTurn) ||
    effect.oncePerTurn === false
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
  return (
    effect.effect.type === "draw" &&
    Number.isInteger(effect.effect.count) &&
    effect.effect.count >= 0 &&
    effect.effect.player === "self"
  );
};

export const isSupportedQueuedNoChoiceDrawEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} =>
  isNoChoiceDrawTriggerEffect(effect, "onPlay", {
    allowOncePerTurn: true,
  }) ||
  isNoChoiceDrawTriggerEffect(effect, "whenAttacking", {
    allowOncePerTurn: true,
  }) ||
  isNoChoiceDrawTriggerEffect(effect, "onOpponentAttack", {
    allowOncePerTurn: true,
  }) ||
  isSupportedQueuedNoChoiceOnKODrawEffect(effect) ||
  isSupportedNoChoiceMainEventDrawEffect(effect, {
    allowOncePerTurn: true,
  }) ||
  isSupportedNoChoiceLifeTriggerDrawEffect(effect, {
    allowOncePerTurn: true,
  }) ||
  (effect.trigger.type === "custom" &&
    isNoChoiceDrawEffectShape(effect, { allowOncePerTurn: true }));

export const isSupportedQueuedOptionalNoChoiceDrawEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "draw" }>;
} =>
  isSupportedOptionalNoChoiceOnPlayDrawEffect(effect) ||
  isSupportedOptionalNoChoiceWhenAttackingDrawEffect(effect) ||
  isSupportedOptionalNoChoiceOnOpponentAttackDrawEffect(effect) ||
  isSupportedOptionalNoChoiceOnKODrawEffect(effect) ||
  isSupportedOptionalNoChoiceMainEventDrawEffect(effect);
