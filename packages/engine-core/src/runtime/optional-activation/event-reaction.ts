import type {
  Action,
  CardFilter,
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
  Trigger,
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
  isSupportedActivatedReactionTrigger(effect.trigger) &&
  effect.sourcePresencePolicy === "mustRemainInSameZone" &&
  effect.effect.type === "sequence" &&
  effect.optional !== true &&
  effect.cost === undefined &&
  effect.conditionTiming === undefined &&
  effect.failurePolicy === undefined &&
  isSupportedQueuedEffectConditionShape(effect.condition) &&
  isSupportedSequenceBlock(syntheticActivatedReactionQueueEntry, effect);

const isSupportedActivatedReactionTrigger = (trigger: Trigger): boolean => {
  if (trigger.type === "lifeRemoved") {
    return true;
  }
  if (trigger.type === "onOpponentAttack") {
    return isSupportedEventCardFilter(trigger.attackerFilter);
  }
  if (trigger.type === "opponentActivated") {
    return true;
  }
  if (trigger.type === "cardPlayed") {
    return (
      isSupportedEventCardFilter(trigger.filter) &&
      trigger.sourceFilter === undefined &&
      trigger.anyOf === undefined
    );
  }
  if (trigger.type === "fieldRemoved") {
    return (
      trigger.target !== "self" &&
      trigger.sourceController === undefined &&
      (trigger.sourceKind === undefined ||
        trigger.sourceKind === "any" ||
        trigger.sourceKind === "ko") &&
      isSupportedEventCardFilter(trigger.filter)
    );
  }
  return false;
};

const isSupportedEventCardFilter = (
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  const keys = Object.keys(filter) as (keyof CardFilter)[];
  return keys.every(
    (key) =>
      key === "anyOf" ||
      key === "attributesAny" ||
      key === "categories" ||
      key === "cost" ||
      key === "effectEntryPoint" ||
      key === "typesAny",
  );
};

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

const playerRefMatchesSource = (
  state: GameState,
  source: CardInstance,
  ref: PlayerRef,
  playerId: PlayerId,
): boolean => {
  switch (ref) {
    case "self":
    case "controller":
      return playerId === source.controller;
    case "owner":
      return playerId === source.owner;
    case "opponent":
      return playerId === getOpponentId(state, source.controller);
    case "turnPlayer":
      return playerId === state.turn.turnPlayerId;
    case "nonTurnPlayer":
      return playerId === getOpponentId(state, state.turn.turnPlayerId);
  }
};

const resolvedMatchesFilter = (
  state: GameState,
  resolved: ResolvedCard | undefined,
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  if (resolved === undefined) {
    return false;
  }
  if (
    filter.anyOf !== undefined &&
    !filter.anyOf.some((candidate) =>
      resolvedMatchesFilter(state, resolved, candidate),
    )
  ) {
    return false;
  }
  if (
    filter.categories !== undefined &&
    !filter.categories.includes(resolved.category)
  ) {
    return false;
  }
  if (
    filter.attributesAny !== undefined &&
    !filter.attributesAny.some((attribute) =>
      resolved.attributes.includes(attribute),
    )
  ) {
    return false;
  }
  if (
    filter.typesAny !== undefined &&
    !filter.typesAny.some((type) => resolved.types.includes(type))
  ) {
    return false;
  }
  if (filter.cost !== undefined) {
    const cost = resolved.cost;
    if (cost === undefined) {
      return false;
    }
    if ("op" in filter.cost) {
      if (filter.cost.op !== "gte" || cost < filter.cost.value) {
        return false;
      }
    } else if (
      (filter.cost.min !== undefined && cost < filter.cost.min) ||
      (filter.cost.max !== undefined && cost > filter.cost.max)
    ) {
      return false;
    }
  }
  if (filter.effectEntryPoint !== undefined) {
    const effectDefinitionId =
      resolved.support.status === "implemented-dsl"
        ? resolved.support.effectDefinitionId
        : undefined;
    const definition =
      effectDefinitionId === undefined
        ? undefined
        : state.cardManifest.effectDefinitions?.[effectDefinitionId];
    const hasEntry =
      definition?.effects.some(
        (effect) =>
          effect.trigger.type === filter.effectEntryPoint?.trigger.type,
      ) === true;
    return filter.effectEntryPoint.mode === "with" ? hasEntry : !hasEntry;
  }
  return true;
};

const eventCardPayload = (
  event: EngineEvent,
): { playerId?: PlayerId; cardId?: CardInstance["cardId"] } | undefined => {
  if (typeof event.payload !== "object" || event.payload === null) {
    return undefined;
  }
  const payload = event.payload as {
    playerId?: PlayerId;
    cardId?: CardInstance["cardId"];
  };
  return payload;
};

const opponentActivationFromEvent = (
  state: GameState,
  event: EngineEvent,
):
  | { kind: "event" | "blocker" | "trigger"; playerId: PlayerId }
  | undefined => {
  if (event.visibility.type !== "public") {
    return undefined;
  }
  if (event.type === "cardPlayed") {
    const payload = eventCardPayload(event);
    return payload?.playerId !== undefined &&
      (event.payload as { category?: unknown }).category === "event"
      ? { kind: "event", playerId: payload.playerId }
      : undefined;
  }
  if (event.type === "counterUsed") {
    const payload = eventCardPayload(event);
    const resolved =
      payload?.cardId === undefined
        ? undefined
        : state.cardManifest.cards[payload.cardId];
    return payload?.playerId !== undefined && resolved?.category === "event"
      ? { kind: "event", playerId: payload.playerId }
      : undefined;
  }
  if (event.type === "triggerActivated") {
    const payload = eventCardPayload(event);
    return payload?.playerId === undefined
      ? undefined
      : { kind: "trigger", playerId: payload.playerId };
  }
  if (event.type === "blockerActivated") {
    const payload = event.payload as {
      blocker?: { playerId?: PlayerId };
    };
    return payload.blocker?.playerId === undefined
      ? undefined
      : { kind: "blocker", playerId: payload.blocker.playerId };
  }
  return undefined;
};

const isRecentRuntimeEvent = (state: GameState, event: EngineEvent): boolean =>
  Number(event.createdAtStateSeq) >= Math.max(0, Number(state.seq) - 2);

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
      `timing-window:activated-reaction:${String(params.triggerEvent.id)}:${params.effectBlock.trigger.type}` as EffectQueueEntry["timingWindowId"],
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
  const trigger = effect.trigger;
  if (trigger.type === "lifeRemoved") {
    return state.eventJournal.filter((event) => {
      if (!isOpenLifeRemovedEvent(state, event)) {
        return false;
      }
      const movedPlayerId = movedLifePlayer(event);
      return (
        movedPlayerId !== undefined &&
        trigger.players.some((ref) =>
          playerRefMatches(state, source, ref, movedPlayerId),
        )
      );
    });
  }
  if (trigger.type === "onOpponentAttack") {
    return state.eventJournal.filter((event) =>
      isActivatedOpponentAttackEvent(state, source, trigger, event),
    );
  }
  if (trigger.type === "opponentActivated") {
    return state.eventJournal.filter((event) =>
      isActivatedOpponentActivationEvent(state, source, trigger, event),
    );
  }
  if (trigger.type === "cardPlayed") {
    return state.eventJournal.filter((event) =>
      isActivatedCardPlayedEvent(state, source, trigger, event),
    );
  }
  if (trigger.type === "fieldRemoved") {
    return state.eventJournal.filter((event) =>
      isActivatedFieldRemovedEvent(state, source, trigger, event),
    );
  }
  return [];
};

const isActivatedOpponentAttackEvent = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "onOpponentAttack" }>,
  event: EngineEvent,
): boolean => {
  if (event.type !== "attackDeclared" || !isRecentRuntimeEvent(state, event)) {
    return false;
  }
  const payload = event.payload as {
    attacker?: {
      playerId?: PlayerId;
      cardId?: CardInstance["cardId"];
    };
  };
  if (payload.attacker?.playerId !== getOpponentId(state, source.controller)) {
    return false;
  }
  const resolved =
    payload.attacker.cardId === undefined
      ? undefined
      : state.cardManifest.cards[payload.attacker.cardId];
  return resolvedMatchesFilter(state, resolved, trigger.attackerFilter);
};

const isActivatedOpponentActivationEvent = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "opponentActivated" }>,
  event: EngineEvent,
): boolean => {
  if (!isRecentRuntimeEvent(state, event)) {
    return false;
  }
  const activation = opponentActivationFromEvent(state, event);
  return (
    activation !== undefined &&
    activation.playerId === getOpponentId(state, source.controller) &&
    trigger.activations.includes(activation.kind)
  );
};

const isActivatedCardPlayedEvent = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "cardPlayed" }>,
  event: EngineEvent,
): boolean => {
  if (event.type !== "cardPlayed" || !isRecentRuntimeEvent(state, event)) {
    return false;
  }
  const payload = eventCardPayload(event);
  if (
    payload?.playerId === undefined ||
    !playerRefMatchesSource(state, source, trigger.player, payload.playerId)
  ) {
    return false;
  }
  const resolved =
    payload.cardId === undefined
      ? undefined
      : state.cardManifest.cards[payload.cardId];
  return resolvedMatchesFilter(state, resolved, trigger.filter);
};

const isActivatedFieldRemovedEvent = (
  state: GameState,
  source: CardInstance,
  trigger: Extract<Trigger, { type: "fieldRemoved" }>,
  event: EngineEvent,
): boolean => {
  if (event.type !== "cardMoved" || !isRecentRuntimeEvent(state, event)) {
    return false;
  }
  const payload = event.payload as {
    from?: unknown;
    instanceId?: CardInstance["instanceId"];
    cardId?: CardInstance["cardId"];
    reason?: unknown;
  };
  const from = zoneRefFromUnknown(payload.from);
  if (
    from?.playerId === undefined ||
    (from.zone !== "leaderArea" &&
      from.zone !== "characterArea" &&
      from.zone !== "stageArea") ||
    !playerRefMatchesSource(state, source, trigger.player, from.playerId)
  ) {
    return false;
  }
  if (trigger.sourceKind === "ko" && payload.reason !== "ko") {
    return false;
  }
  const resolved =
    payload.cardId === undefined
      ? undefined
      : state.cardManifest.cards[payload.cardId];
  return resolvedMatchesFilter(state, resolved, trigger.filter);
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
    "timing-window:activated-reaction:probe:trigger" as EffectQueueEntry["timingWindowId"],
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
