import type {
  CardRef,
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
  ReplacementProcess,
  SelectedTargetKoReplacementPayload,
  Target,
} from "@optcg/types";

import { appendEvent, toEngineResult, toStateSeq } from "./action-results.js";
import { getOpponentId, reindexZoneCards } from "./action-state.js";

export type DrawExecutionFailureReason =
  | "unsupported-effect-shape"
  | "unsupported-player-ref"
  | "invalid-draw-count";

export type SelectedTargetKoExecutionFailureReason =
  | "unsupported-effect-shape"
  | "unsupported-target-shape"
  | "selected-target-count-below-minimum"
  | "duplicate-targets"
  | "missing-card"
  | "stale-target"
  | "private-target"
  | "non-character-target";

interface EffectExecutionErrorDetails {
  reason: DrawExecutionFailureReason;
}

interface SelectedTargetKoExecutionErrorDetails {
  reason: SelectedTargetKoExecutionFailureReason;
}

const drawExecutionError = (
  effectId: string,
  reason: DrawExecutionFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies EffectExecutionErrorDetails,
});

const selectedTargetKoExecutionError = (
  effectId: string,
  reason: SelectedTargetKoExecutionFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies SelectedTargetKoExecutionErrorDetails,
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

  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
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

const cardRefsEqual = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId &&
  left.zone?.zone === right.zone?.zone &&
  left.zone?.playerId === right.zone?.playerId &&
  left.zone?.slot === right.zone?.slot &&
  left.zone?.index === right.zone?.index;

const hasDuplicateTargets = (targets: readonly CardRef[]): boolean =>
  targets.some((target, index) =>
    targets
      .slice(index + 1)
      .some((candidate) => cardRefsEqual(target, candidate)),
  );

type LocatedCard = {
  playerId: PlayerId;
  zone:
    | "leaderArea"
    | "characterArea"
    | "stageArea"
    | "hand"
    | "deck"
    | "trash"
    | "costArea"
    | "donDeck"
    | "life";
  card: CardInstance;
  index?: number;
};

export const buildSelectedTargetKoReplacementProcess = (
  entry: EffectQueueEntry,
  target: CardRef,
  targetIndex: number,
): ReplacementProcess => {
  const payload: SelectedTargetKoReplacementPayload = {
    effectId: entry.effectBlockId,
    queueEntryId: entry.id,
    source: entry.source,
    target,
  };
  return {
    id: `${entry.id}:ko:${target.instanceId}:${String(targetIndex)}`,
    type: "ko",
    source: entry.source,
    target,
    payload,
    causedBy: entry.causedBy,
    usedReplacementIds: [],
  };
};

const findCardByInstanceId = (
  state: GameState,
  instanceId: CardInstance["instanceId"],
): LocatedCard | null => {
  for (const [playerId, player] of Object.entries(state.players) as [
    PlayerId,
    GameState["players"][PlayerId],
  ][]) {
    if (player.leader.instanceId === instanceId) {
      return { playerId, zone: "leaderArea", card: player.leader };
    }

    const collections = [
      ["characterArea", player.characters],
      ["stageArea", player.stage === undefined ? [] : [player.stage]],
      ["hand", player.hand],
      ["deck", player.deck],
      ["trash", player.trash],
      ["costArea", player.costArea],
      ["donDeck", player.donDeck],
      ["life", player.life.map((lifeCard) => lifeCard.card)],
    ] as const;

    for (const [zone, cards] of collections) {
      const index = cards.findIndex((card) => card.instanceId === instanceId);
      const card = cards[index];
      if (index >= 0 && card !== undefined) {
        return { playerId, zone, card, index };
      }
    }
  }
  return null;
};

const executeUnreplacedSelectedTargetKoProcess = (
  state: GameState,
  events: EngineEvent[],
  effectId: string,
  process: ReplacementProcess,
): { state: GameState } | { error: EngineError } => {
  const target = process.target;
  if (process.type !== "ko" || target === undefined) {
    return {
      error: selectedTargetKoExecutionError(
        effectId,
        "unsupported-effect-shape",
      ),
    };
  }

  const located = findCardByInstanceId(state, target.instanceId);
  if (located === null || located.zone !== "characterArea") {
    return {
      error: selectedTargetKoExecutionError(effectId, "stale-target"),
    };
  }

  const player = state.players[located.playerId];
  if (player === undefined) {
    return {
      error: selectedTargetKoExecutionError(effectId, "missing-card"),
    };
  }

  const targetIndex = player.characters.findIndex(
    (candidate) => candidate.instanceId === located.card.instanceId,
  );
  const koCard = player.characters[targetIndex];
  if (targetIndex < 0 || koCard === undefined) {
    return {
      error: selectedTargetKoExecutionError(effectId, "stale-target"),
    };
  }

  const trashedCard: CardInstance = {
    ...koCard,
    attachedDon: [],
    zone: {
      zone: "trash",
      playerId: located.playerId,
      slot: "trash",
      index: 0,
    },
  };
  const nextCharacters = reindexZoneCards(
    player.characters.filter((_, index) => index !== targetIndex),
    "characterArea",
    located.playerId,
    "character",
  );
  const nextTrash = reindexZoneCards(
    [trashedCard, ...player.trash],
    "trash",
    located.playerId,
    "trash",
  );
  const attachedDonIds = new Set(koCard.attachedDon);
  const nextCostArea = player.costArea.map((card) =>
    attachedDonIds.has(card.instanceId)
      ? { ...card, state: "rested" as const }
      : card,
  );

  const nextState = {
    ...state,
    players: {
      ...state.players,
      [located.playerId]: {
        ...player,
        characters: nextCharacters,
        trash: nextTrash,
        costArea: nextCostArea,
      },
    },
  };

  appendEvent(nextState, events, "cardKOd", {
    playerId: located.playerId,
    instanceId: koCard.instanceId,
  });
  appendEvent(nextState, events, "cardMoved", {
    instanceId: koCard.instanceId,
    cardId: koCard.cardId,
    from: koCard.zone,
    to: trashedCard.zone,
    reason: "ko",
  });
  for (const donId of koCard.attachedDon) {
    appendEvent(
      nextState,
      events,
      "donReturned",
      { playerId: located.playerId, donInstanceId: donId, state: "rested" },
      { type: "replayOnly" },
    );
  }

  return { state: nextState };
};

const executeSelectedTargetKoReplacementProcess = (
  state: GameState,
  events: EngineEvent[],
  effectId: string,
  process: ReplacementProcess,
): { state: GameState } | { error: EngineError } =>
  executeUnreplacedSelectedTargetKoProcess(state, events, effectId, process);

const executeSelectedTargetKoEffect = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Extract<Effect, { type: "ko" }>,
  selectedTargets: readonly CardRef[],
): EngineResult => {
  if (
    effect.target.type !== "choose" ||
    effect.target.request.visibility !== "public"
  ) {
    return toEngineResult(
      state,
      [],
      [
        selectedTargetKoExecutionError(
          entry.effectBlockId,
          "unsupported-target-shape",
        ),
      ],
    );
  }

  if (selectedTargets.length < effect.target.request.min) {
    return toEngineResult(
      state,
      [],
      [
        selectedTargetKoExecutionError(
          entry.effectBlockId,
          "selected-target-count-below-minimum",
        ),
      ],
    );
  }

  if (hasDuplicateTargets(selectedTargets)) {
    return toEngineResult(
      state,
      [],
      [
        selectedTargetKoExecutionError(
          entry.effectBlockId,
          "duplicate-targets",
        ),
      ],
    );
  }

  for (const target of selectedTargets) {
    const located = findCardByInstanceId(state, target.instanceId);
    if (located === null) {
      return toEngineResult(
        state,
        [],
        [selectedTargetKoExecutionError(entry.effectBlockId, "missing-card")],
      );
    }

    if (
      located.zone === "hand" ||
      located.zone === "deck" ||
      located.zone === "donDeck" ||
      located.zone === "life"
    ) {
      return toEngineResult(
        state,
        [],
        [selectedTargetKoExecutionError(entry.effectBlockId, "private-target")],
      );
    }

    if (located.zone === "leaderArea") {
      return toEngineResult(
        state,
        [],
        [
          selectedTargetKoExecutionError(
            entry.effectBlockId,
            "non-character-target",
          ),
        ],
      );
    }

    if (located.zone !== "characterArea") {
      return toEngineResult(
        state,
        [],
        [selectedTargetKoExecutionError(entry.effectBlockId, "stale-target")],
      );
    }

    if (
      !cardRefsEqual(target, {
        instanceId: located.card.instanceId,
        cardId: located.card.cardId,
        playerId: located.playerId,
        zone: located.card.zone,
      })
    ) {
      return toEngineResult(
        state,
        [],
        [selectedTargetKoExecutionError(entry.effectBlockId, "stale-target")],
      );
    }

    const resolved = state.cardManifest.cards[located.card.cardId];
    if (resolved === undefined) {
      return toEngineResult(
        state,
        [],
        [selectedTargetKoExecutionError(entry.effectBlockId, "missing-card")],
      );
    }
    if (resolved.category !== "character") {
      return toEngineResult(
        state,
        [],
        [
          selectedTargetKoExecutionError(
            entry.effectBlockId,
            "non-character-target",
          ),
        ],
      );
    }
  }

  const events: EngineEvent[] = [];
  let nextState = state;

  for (const [targetIndex, target] of selectedTargets.entries()) {
    const process = buildSelectedTargetKoReplacementProcess(
      entry,
      target,
      targetIndex,
    );
    const resolvedProcess = executeSelectedTargetKoReplacementProcess(
      nextState,
      events,
      entry.effectBlockId,
      process,
    );
    if ("error" in resolvedProcess) {
      return toEngineResult(state, [], [resolvedProcess.error]);
    }
    nextState = resolvedProcess.state;
  }

  const finalState: GameState = {
    ...nextState,
    seq: toStateSeq(state.seq + 1),
    eventJournal: [...state.eventJournal, ...events],
  };
  return toEngineResult(finalState, events);
};

export const executeSelectedTargetEffectPrimitive = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Effect,
  selectedTargets: readonly CardRef[],
): EngineResult => {
  if (effect.type !== "ko") {
    return toEngineResult(
      state,
      [],
      [
        selectedTargetKoExecutionError(
          entry.effectBlockId,
          "unsupported-effect-shape",
        ),
      ],
    );
  }

  return executeSelectedTargetKoEffect(state, entry, effect, selectedTargets);
};

export const executeNoChoiceEffectPrimitive = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: Effect,
): EngineResult => {
  if (effect.type !== "draw") {
    return toEngineResult(
      state,
      [],
      [drawExecutionError(entry.effectBlockId, "unsupported-effect-shape")],
    );
  }
  return executeDrawEffect(state, entry, effect);
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

const isReviewedTargetKoRequestShape = (
  request: Extract<Target, { type: "choose" }>["request"],
): boolean =>
  request.timing === "onResolution" &&
  request.chooser === "self" &&
  request.player === "opponent" &&
  request.zone === "characterArea" &&
  request.filter === undefined &&
  request.min === 0 &&
  request.max === 1 &&
  request.allowFewerIfUnavailable &&
  request.visibility === "public";

type EffectWithTarget = Extract<Effect, { target: unknown }>;

const isChooseTarget = (
  target: EffectWithTarget["target"],
): target is Extract<Target, { type: "choose" }> =>
  typeof target === "object" && "type" in target && target.type === "choose";

export const isSupportedMainEventTargetKoEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
  effect: Extract<Effect, { type: "ko" }> & {
    target: Extract<Target, { type: "choose" }>;
  };
} => {
  if (
    effect.sourcePresencePolicy !== "resolveFromDestinationZone" ||
    effect.trigger.type !== "main" ||
    effect.category !== "auto" ||
    effect.optional ||
    effect.oncePerTurn ||
    effect.cost !== undefined ||
    effect.condition !== undefined ||
    effect.conditionTiming !== undefined ||
    effect.failurePolicy !== undefined ||
    effect.effect.type !== "ko" ||
    !isChooseTarget(effect.effect.target)
  ) {
    return false;
  }
  return isReviewedTargetKoRequestShape(effect.effect.target.request);
};

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
    effect.effect.count === 1 &&
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
