import type {
  Action,
  CardInstance,
  CardRef,
  EffectDefinition,
  EffectQueueEntry,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
  PlayerRef,
  ResolvedCard,
} from "@optcg/types";

import {
  appendEvent,
  illegalAction,
  toStateSeq,
} from "../../action-results.js";
import {
  getOpponentId,
  isMatchActive,
  zonesEqual,
} from "../../actions/state.js";
import {
  evaluateQueuedEffectCondition,
  isSupportedQueuedEffectConditionShape,
} from "../../effect-runtime-conditions.js";
import { isCardEffectInvalidated } from "../../effect-invalidation.js";
import {
  processEffectRuntime,
  resolveImplementedDslEffectDefinition,
} from "../../effect-runtime.js";
import { isSupportedSequenceBlock } from "../../effect-runtime-sequence/support.js";
import {
  fieldTriggerSources,
  toSnapshot,
  zoneRefFromUnknown,
} from "../../effect-runtime-trigger-source-lookup.js";
import { activeEffectTextPresentationForEffectBlock } from "../effect-presentation.js";
import {
  isOncePerTurnUsed,
  toOncePerTurnKey,
} from "../../rules/once-per-turn.js";
import { activatedReactionQueueingName } from "./event-reaction-support.js";

const isFieldZoneForActivatedReaction = (
  zone: CardRef["zone"],
): zone is NonNullable<CardRef["zone"]> =>
  zone?.zone === "leaderArea" ||
  zone?.zone === "characterArea" ||
  zone?.zone === "stageArea";

export const isSupportedActivatedReactionEffect = (
  effect: EffectDefinition["effects"][number],
): boolean =>
  effect.category === "activate" &&
  effect.trigger.type === "lifeRemoved" &&
  effect.sourcePresencePolicy === "mustRemainInSameZone" &&
  effect.effect.type === "sequence" &&
  effect.optional !== true &&
  effect.cost === undefined &&
  effect.conditionTiming === undefined &&
  effect.failurePolicy === undefined &&
  isSupportedQueuedEffectConditionShape(effect.condition) &&
  isSupportedSequenceBlock(syntheticActivatedReactionQueueEntry, effect);

const movedLifePlayer = (event: EngineEvent): PlayerId | undefined => {
  if (event.type !== "cardMoved" || event.visibility.type !== "public") {
    return undefined;
  }
  const payload = event.payload as {
    from?: unknown;
    playerId?: PlayerId;
  };
  const from = zoneRefFromUnknown(payload.from);
  if (from?.zone === "life" && from.playerId !== undefined) {
    return from.playerId;
  }
  if (payload.from === "life" && payload.playerId !== undefined) {
    return payload.playerId;
  }
  return undefined;
};

const isOpenLifeRemovedEvent = (
  state: GameState,
  event: EngineEvent,
): boolean =>
  event.type === "cardMoved" &&
  movedLifePlayer(event) !== undefined &&
  Number(event.createdAtStateSeq) >= Math.max(0, Number(state.seq) - 1);

const playerRefMatches = (
  state: GameState,
  source: CardInstance,
  ref: PlayerRef,
  movedPlayerId: PlayerId,
): boolean => {
  switch (ref) {
    case "self":
    case "controller":
      return movedPlayerId === source.controller;
    case "owner":
      return movedPlayerId === source.owner;
    case "opponent":
      return movedPlayerId === getOpponentId(state, source.controller);
    case "turnPlayer":
      return movedPlayerId === state.turn.turnPlayerId;
    case "nonTurnPlayer":
      return movedPlayerId === getOpponentId(state, state.turn.turnPlayerId);
  }
};

const findLiveCardBySource = (
  state: GameState,
  source: CardRef,
):
  | {
      card: CardInstance;
      resolved: ResolvedCard;
    }
  | undefined => {
  if (!isFieldZoneForActivatedReaction(source.zone)) {
    return undefined;
  }
  const player = state.players[source.playerId];
  if (player === undefined) {
    return undefined;
  }
  const cards = [
    player.leader,
    ...player.characters,
    ...(player.stage === undefined ? [] : [player.stage]),
  ];
  const card = cards.find(
    (candidate) =>
      candidate.instanceId === source.instanceId &&
      candidate.cardId === source.cardId &&
      zonesEqual(candidate.zone, source.zone),
  );
  if (card === undefined) {
    return undefined;
  }
  const resolved = state.cardManifest.cards[card.cardId];
  if (resolved === undefined) {
    return undefined;
  }
  return { card, resolved };
};

const createActivatedReactionQueueEntry = (params: {
  state: GameState;
  triggerEvent: EngineEvent;
  source: CardInstance;
  effectBlock: EffectDefinition["effects"][number];
  resolvedCard: ResolvedCard;
}): EffectQueueEntry => {
  const entrySource = {
    instanceId: params.source.instanceId,
    cardId: params.source.cardId,
    playerId: params.source.controller,
    zone: params.source.zone,
  };
  const presentation = activeEffectTextPresentationForEffectBlock({
    effectBlock: params.effectBlock,
    resolvedCard: params.resolvedCard,
    source: entrySource,
  });
  return {
    id: `queue-entry:activated-reaction:${String(params.triggerEvent.id)}:${String(params.source.instanceId)}:${String(params.effectBlock.id)}` as EffectQueueEntry["id"],
    state: "pending",
    timingWindowId:
      `timing-window:activated-reaction:${String(params.triggerEvent.id)}:lifeRemoved` as EffectQueueEntry["timingWindowId"],
    generation: 0,
    controllerId: params.source.controller,
    source: entrySource,
    sourceSnapshot: toSnapshot(params.source, params.resolvedCard),
    triggerEventId: params.triggerEvent.id,
    effectBlockId: params.effectBlock.id,
    orderingGroup:
      params.source.controller === params.state.turn.turnPlayerId
        ? "turnPlayer"
        : "nonTurnPlayer",
    createdAtEventSeq: params.triggerEvent.seq,
    queuedAtStateSeq: toStateSeq(params.state.seq + 1),
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: activatedReactionQueueingName },
    ...(presentation === undefined ? {} : { presentation }),
  };
};

const activatedReactionEventsForSource = (
  state: GameState,
  source: CardInstance,
  effect: EffectDefinition["effects"][number],
): EngineEvent[] => {
  if (effect.trigger.type !== "lifeRemoved") {
    return [];
  }
  return state.eventJournal.filter((event) => {
    if (!isOpenLifeRemovedEvent(state, event)) {
      return false;
    }
    const movedPlayerId = movedLifePlayer(event);
    return (
      movedPlayerId !== undefined &&
      effect.trigger.type === "lifeRemoved" &&
      effect.trigger.players.some((ref) =>
        playerRefMatches(state, source, ref, movedPlayerId),
      )
    );
  });
};

const findSupportedActivatedReactionEffects = (
  state: GameState,
  source: CardInstance,
  resolvedCard: ResolvedCard,
): Array<{
  readonly effect: EffectDefinition["effects"][number];
  readonly triggerEvent: EngineEvent;
}> => {
  if (
    resolvedCard.support.status !== "implemented-dsl" ||
    resolvedCard.support.effectDefinitionId === undefined
  ) {
    return [];
  }
  const lookup = resolveImplementedDslEffectDefinition(
    resolvedCard,
    state.cardManifest,
  );
  if (!lookup.ok) {
    return [];
  }
  return lookup.definition.effects.flatMap((effect) => {
    if (!isSupportedActivatedReactionEffect(effect)) {
      return [];
    }
    return activatedReactionEventsForSource(state, source, effect).map(
      (triggerEvent) => ({ effect, triggerEvent }),
    );
  });
};

const isActivatedReactionActionLegal = (
  state: GameState,
  source: CardInstance,
  effect: EffectDefinition["effects"][number],
  triggerEvent: EngineEvent,
  resolvedCard: ResolvedCard,
): boolean => {
  const entry = createActivatedReactionQueueEntry({
    state,
    source,
    effectBlock: effect,
    triggerEvent,
    resolvedCard,
  });
  const condition = evaluateQueuedEffectCondition(
    state,
    entry,
    effect.condition,
  );
  if (!condition.supported || !condition.passed) {
    return false;
  }
  if (effect.oncePerTurn === true) {
    const key = toOncePerTurnKey({
      cardInstanceId: source.instanceId,
      effectId: effect.id,
      turnNumber: state.turn.globalTurn,
    });
    return !isOncePerTurnUsed(state, key);
  }
  return true;
};

export const getActivatedReactionLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const actions: LegalAction[] = [];
  for (const source of fieldTriggerSources(state)) {
    if (
      source.controller !== playerId ||
      isCardEffectInvalidated(state, source)
    ) {
      continue;
    }
    const resolved = state.cardManifest.cards[source.cardId];
    if (resolved === undefined) {
      continue;
    }
    const supported = findSupportedActivatedReactionEffects(
      state,
      source,
      resolved,
    );
    for (const { effect, triggerEvent } of supported) {
      if (
        !isActivatedReactionActionLegal(
          state,
          source,
          effect,
          triggerEvent,
          resolved,
        )
      ) {
        continue;
      }
      actions.push({
        type: "activateEffect",
        source: {
          instanceId: source.instanceId,
          cardId: source.cardId,
          playerId,
          zone: source.zone,
        },
        effectId: effect.id,
      });
    }
  }
  return actions;
};

export const applyActivatedReactionAction = (
  state: GameState,
  action: Extract<Action, { type: "activateEffect" }>,
): EngineResult | undefined => {
  if (!isMatchActive(state)) {
    return illegalAction(
      state,
      "activateEffect is only legal while match is active.",
    );
  }
  const live = findLiveCardBySource(state, action.source);
  if (live === undefined || live.card.controller !== action.source.playerId) {
    return undefined;
  }
  if (isCardEffectInvalidated(state, live.card)) {
    return undefined;
  }
  const supported = findSupportedActivatedReactionEffects(
    state,
    live.card,
    live.resolved,
  );
  const match = supported.find(
    ({ effect, triggerEvent }) =>
      effect.id === action.effectId &&
      isActivatedReactionActionLegal(
        state,
        live.card,
        effect,
        triggerEvent,
        live.resolved,
      ),
  );
  if (match === undefined) {
    return undefined;
  }

  const entry = createActivatedReactionQueueEntry({
    state,
    source: live.card,
    resolvedCard: live.resolved,
    effectBlock: match.effect,
    triggerEvent: match.triggerEvent,
  });
  const queuedEvents: EngineEvent[] = [];
  appendEvent(
    state,
    queuedEvents,
    "effectQueued",
    {
      queueEntryId: entry.id,
      timingWindowId: entry.timingWindowId,
      generation: entry.generation,
      effectBlockId: entry.effectBlockId,
      triggerEventId: entry.triggerEventId,
      sourcePresencePolicy: entry.sourcePresencePolicy,
      orderingGroup: entry.orderingGroup,
    },
    { type: "public" },
  );
  const queuedEvent = queuedEvents[0];
  if (queuedEvent !== undefined) {
    queuedEvent.causedBy = entry.causedBy;
  }
  const queuedState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    effectQueue: [...state.effectQueue, entry],
    eventJournal: [...state.eventJournal, ...queuedEvents],
  };
  const resolved = processEffectRuntime(queuedState);
  return {
    ...resolved,
    events: [...queuedEvents, ...resolved.events],
  };
};

const probePlayerId = "player-1" as EffectQueueEntry["controllerId"];

const syntheticActivatedReactionQueueEntry: EffectQueueEntry = {
  id: "queue-entry:activated-reaction:probe:source:effect" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "timing-window:activated-reaction:probe:lifeRemoved" as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: probePlayerId,
  source: {
    instanceId: "probe-source" as EffectQueueEntry["source"]["instanceId"],
    cardId: "PROBE-000" as EffectQueueEntry["source"]["cardId"],
    playerId: probePlayerId,
    zone: { playerId: probePlayerId, zone: "leaderArea" },
  },
  sourceSnapshot: {
    instanceId:
      "probe-source" as EffectQueueEntry["sourceSnapshot"]["instanceId"],
    cardId: "PROBE-000" as EffectQueueEntry["sourceSnapshot"]["cardId"],
    ownerId: probePlayerId,
    controllerId: probePlayerId,
    zone: { playerId: probePlayerId, zone: "leaderArea" },
    category: "leader",
    colors: [],
    keywords: [],
    power: 5000,
  },
  triggerEventId: "probe-event" as NonNullable<
    EffectQueueEntry["triggerEventId"]
  >,
  effectBlockId: "effect:probe" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: toStateSeq(1),
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: activatedReactionQueueingName },
};
