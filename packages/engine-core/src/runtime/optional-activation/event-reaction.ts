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
  ResolvedCard,
  Trigger,
} from "@optcg/types";

import {
  appendEffectQueuedEvent,
  illegalAction,
  toStateSeq,
} from "../../action-results.js";
import { isMatchActive, zonesEqual } from "../../actions/state.js";
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
import { matchEventTrigger } from "../event-hooks/matcher.js";
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
  if (trigger.type === "anyOf") {
    return trigger.triggers.every(isSupportedActivatedReactionTrigger);
  }
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
    return isSupportedActivatedReactionCardPlayedTrigger(trigger);
  }
  if (trigger.type === "fieldRemoved") {
    return (
      trigger.target !== "self" && isSupportedEventCardFilter(trigger.filter)
    );
  }
  return false;
};

const isSupportedActivatedReactionCardPlayedTrigger = (
  trigger: Extract<Trigger, { type: "cardPlayed" }>,
): boolean =>
  isSupportedEventCardFilter(trigger.filter) &&
  isSupportedEventCardFilter(trigger.sourceFilter) &&
  (trigger.anyOf === undefined ||
    trigger.anyOf.every(
      (branch) =>
        isSupportedEventCardFilter(branch.filter) &&
        isSupportedEventCardFilter(branch.sourceFilter),
    ));

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
      key === "baseCost" ||
      key === "categories" ||
      key === "cost" ||
      key === "effectEntryPoint" ||
      key === "typesAny" ||
      key === "typesIncludeAny",
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
    queueOrigin: { type: "activatedReaction" },
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
  const acceptsTriggerType = (type: Trigger["type"]): boolean =>
    trigger.type === type ||
    (trigger.type === "anyOf" &&
      trigger.triggers.some((child) => child.type === type));
  const candidateEvents = state.eventJournal.filter((event) => {
    if (acceptsTriggerType("lifeRemoved")) {
      return isOpenLifeRemovedEvent(state, event);
    }
    if (acceptsTriggerType("onOpponentAttack")) {
      return (
        event.type === "attackDeclared" && isRecentRuntimeEvent(state, event)
      );
    }
    if (acceptsTriggerType("opponentActivated")) {
      return isRecentRuntimeEvent(state, event);
    }
    if (acceptsTriggerType("cardPlayed")) {
      return event.type === "cardPlayed" && isRecentRuntimeEvent(state, event);
    }
    if (acceptsTriggerType("fieldRemoved")) {
      return event.type === "cardMoved" && isRecentRuntimeEvent(state, event);
    }
    return false;
  });
  return candidateEvents.filter(
    (event) => matchEventTrigger(state, source, trigger, event).matched,
  );
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
  appendEffectQueuedEvent(
    state,
    queuedEvents,
    entry,
    match.effect,
    live.resolved,
  );
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
  queueOrigin: { type: "activatedReaction" },
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
