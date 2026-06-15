import type {
  Action,
  CardInstance,
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
import { isMatchActive } from "../../actions/state.js";
import { evaluateQueuedEffectCondition } from "../../effect-runtime-conditions.js";
import {
  processEffectRuntime,
  resolveImplementedDslEffectDefinition,
} from "../../effect-runtime.js";
import {
  fieldTriggerSources,
  toSnapshot,
  zoneRefFromUnknown,
} from "../../effect-runtime-trigger-source-lookup.js";
import { activeEffectTextPresentationForEffectBlock } from "../effect-presentation.js";
import {
  isEventTriggerQueueAnchor,
  matchEventTrigger,
} from "../event-hooks/matcher.js";
import { canAdmitOncePerTurnEffect } from "../../rules/once-per-turn.js";
import { activatedReactionQueueingName } from "./event-reaction-support.js";
import { isSupportedActivatedReactionEffect as isSupportedActivatedReactionEffectWithEntry } from "./event-reaction-runtime-support.js";
import {
  fieldSourceCanUseEffects,
  findFieldSource,
} from "../source-presence-gate.js";

export const isSupportedActivatedReactionEffect = (
  effect: EffectDefinition["effects"][number],
): boolean =>
  isSupportedActivatedReactionEffectWithEntry(
    effect,
    syntheticActivatedReactionQueueEntry,
  );

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
    (event) =>
      matchEventTrigger(state, source, trigger, event, candidateEvents)
        .matched &&
      isEventTriggerQueueAnchor(state, source, trigger, event, candidateEvents),
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
  return canAdmitOncePerTurnEffect(state, entry, effect);
};

export const getActivatedReactionLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  const actions: LegalAction[] = [];
  for (const source of fieldTriggerSources(state)) {
    if (source.controller !== playerId) {
      continue;
    }
    const live = fieldSourceCanUseEffects(state, {
      instanceId: source.instanceId,
      cardId: source.cardId,
      playerId,
      zone: source.zone,
    });
    if (live === undefined) {
      continue;
    }
    const supported = findSupportedActivatedReactionEffects(
      state,
      live.card,
      live.resolved,
    );
    for (const { effect, triggerEvent } of supported) {
      if (
        !isActivatedReactionActionLegal(
          state,
          live.card,
          effect,
          triggerEvent,
          live.resolved,
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
  const live = findFieldSource(state, action.source);
  if (live === undefined || live.card.controller !== action.source.playerId) {
    return undefined;
  }
  if (fieldSourceCanUseEffects(state, action.source) === undefined) {
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
