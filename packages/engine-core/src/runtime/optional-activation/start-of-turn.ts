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
  ResolvedCard,
  SourcePresencePolicy,
} from "@optcg/types";

import {
  appendEffectQueuedEvent,
  type EngineResultOptions,
  illegalAction,
  toStateSeq,
} from "../../action-results.js";
import { prependEventsToEngineResult } from "../../engine-result-events.js";
import { isMatchActive } from "../../actions/state.js";
import {
  evaluateQueuedEffectCondition,
  isSupportedQueuedEffectConditionShape,
} from "../../effect-runtime-conditions.js";
import {
  processEffectRuntime,
  resolveImplementedDslEffectDefinition,
} from "../../effect-runtime.js";
import { canResolvePrimitiveBodyForEntry } from "../../effect-runtime-queue/primitive-resolution.js";
import { isSupportedSequenceBlock } from "../../effect-runtime-sequence/support.js";
import { toSnapshot } from "../../effect-runtime-trigger-source-lookup.js";
import { canAdmitOncePerTurnEffect } from "../../rules/once-per-turn.js";
import { activeEffectTextPresentationForEffectBlock } from "../effect-presentation.js";
import { startOfYourTurnQueueingName } from "./start-of-turn-support.js";
import {
  fieldSourceCanUseEffects,
  findFieldSource,
} from "../source-presence-gate.js";

type StartOfTurnRuntimeEffectBlock = EffectDefinition["effects"][number] & {
  sourcePresencePolicy: SourcePresencePolicy;
};

const probePlayerId = "player-1" as PlayerId;

const startOfTurnPrimitiveProbeEntry: EffectQueueEntry = {
  id: "queue-entry:start-of-turn:probe" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "timing-window:start-of-turn:probe" as EffectQueueEntry["timingWindowId"],
  queueOrigin: { type: "startOfYourTurn" },
  generation: 0,
  controllerId: probePlayerId,
  source: {
    instanceId: "instance:start-of-turn:probe" as CardRef["instanceId"],
    cardId: "card:start-of-turn:probe" as CardRef["cardId"],
    playerId: probePlayerId,
    zone: {
      zone: "leaderArea",
      playerId: probePlayerId,
      slot: "leader",
      index: 0,
    },
  },
  sourceSnapshot: {
    instanceId: "instance:start-of-turn:probe" as CardRef["instanceId"],
    cardId: "card:start-of-turn:probe" as CardRef["cardId"],
    ownerId: probePlayerId,
    controllerId: probePlayerId,
    zone: {
      zone: "leaderArea",
      playerId: probePlayerId,
      slot: "leader",
      index: 0,
    },
    category: "leader",
    colors: [],
    keywords: [],
  },
  effectBlockId:
    "effect:start-of-turn:probe" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: toStateSeq(1),
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: startOfYourTurnQueueingName },
};

const hasSupportedStartOfTurnEnvelope = (
  effect: EffectDefinition["effects"][number],
): effect is StartOfTurnRuntimeEffectBlock =>
  effect.category === "activate" &&
  effect.trigger.type === "startOfYourTurn" &&
  effect.sourcePresencePolicy === "mustRemainInSameZone" &&
  effect.optional !== true &&
  effect.cost === undefined &&
  effect.conditionTiming === undefined &&
  effect.failurePolicy === undefined &&
  isSupportedQueuedEffectConditionShape(effect.condition);

export const isSupportedStartOfTurnRuntimeEffectBlock = (
  effect: EffectDefinition["effects"][number],
  entry: EffectQueueEntry = startOfTurnPrimitiveProbeEntry,
): effect is StartOfTurnRuntimeEffectBlock =>
  hasSupportedStartOfTurnEnvelope(effect) &&
  (canResolvePrimitiveBodyForEntry(effect, entry) ||
    isSupportedSequenceBlock(entry, effect));

const createStartOfTurnQueueEntry = (params: {
  state: GameState;
  source: CardInstance;
  sourceSnapshot: EffectQueueEntry["sourceSnapshot"];
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
    id: `queue-entry:start-of-turn:${String(params.state.actionSeq + 1)}:${String(params.source.instanceId)}:${String(params.effectBlock.id)}` as EffectQueueEntry["id"],
    state: "pending",
    timingWindowId:
      `timing-window:start-of-turn:${String(params.state.seq + 1)}` as EffectQueueEntry["timingWindowId"],
    queueOrigin: { type: "startOfYourTurn" },
    generation: 0,
    controllerId: params.source.controller,
    source: entrySource,
    sourceSnapshot: params.sourceSnapshot,
    effectBlockId: params.effectBlock.id,
    orderingGroup: "turnPlayer",
    createdAtEventSeq: params.state.eventJournal.length + 1,
    queuedAtStateSeq: toStateSeq(params.state.seq + 1),
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: startOfYourTurnQueueingName },
    ...(presentation === undefined ? {} : { presentation }),
  };
};

const findSupportedStartOfTurnEffects = (
  state: GameState,
  source: CardInstance,
  resolvedCard: ResolvedCard,
): EffectDefinition["effects"][number][] => {
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
  return lookup.definition.effects.filter((effect) =>
    isSupportedStartOfTurnRuntimeEffectBlock(
      effect,
      createStartOfTurnQueueEntry({
        state,
        source,
        sourceSnapshot: toSnapshot(source, resolvedCard),
        effectBlock: effect,
        resolvedCard,
      }),
    ),
  );
};

const isStartOfTurnActionLegal = (
  state: GameState,
  source: CardInstance,
  effect: EffectDefinition["effects"][number],
  resolvedCard: ResolvedCard,
): boolean => {
  const entry = createStartOfTurnQueueEntry({
    state,
    source,
    sourceSnapshot: toSnapshot(source, resolvedCard),
    effectBlock: effect,
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

export const getStartOfTurnLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  if (
    state.turn.phase !== "refresh" ||
    state.turn.turnPlayerId !== playerId ||
    state.battle !== undefined
  ) {
    return [];
  }
  const player = state.players[playerId];
  if (player === undefined) {
    return [];
  }
  const sources = [
    player.leader,
    ...player.characters,
    ...(player.stage === undefined ? [] : [player.stage]),
  ];
  const actions: LegalAction[] = [];
  for (const source of sources) {
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
    const supported = findSupportedStartOfTurnEffects(
      state,
      live.card,
      live.resolved,
    );
    for (const effect of supported) {
      if (!isStartOfTurnActionLegal(state, live.card, effect, live.resolved)) {
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

export const applyStartOfTurnAction = (
  state: GameState,
  action: Extract<Action, { type: "activateEffect" }>,
  options: EngineResultOptions = {},
): EngineResult | undefined => {
  if (state.turn.phase !== "refresh") {
    return undefined;
  }
  if (!isMatchActive(state)) {
    return illegalAction(
      state,
      "activateEffect is only legal while match is active.",
    );
  }
  if (state.turn.turnPlayerId !== action.source.playerId) {
    return illegalAction(
      state,
      "start-of-turn activateEffect requires turn player refresh phase.",
    );
  }
  if (action.source.zone === undefined) {
    return illegalAction(
      state,
      "start-of-turn activateEffect requires a field source.",
    );
  }
  const live = findFieldSource(state, action.source);
  if (live === undefined || live.card.controller !== action.source.playerId) {
    return illegalAction(
      state,
      "start-of-turn activateEffect source is stale or not controller-owned.",
    );
  }
  if (fieldSourceCanUseEffects(state, action.source) === undefined) {
    return illegalAction(
      state,
      "start-of-turn activateEffect source effects are negated.",
    );
  }
  const supported = findSupportedStartOfTurnEffects(
    state,
    live.card,
    live.resolved,
  );
  const effect = supported.find(
    (candidate) =>
      candidate.id === action.effectId &&
      isStartOfTurnActionLegal(state, live.card, candidate, live.resolved),
  );
  if (effect === undefined) {
    return illegalAction(
      state,
      "start-of-turn activateEffect effect id is unsupported for source.",
    );
  }
  const entry = createStartOfTurnQueueEntry({
    state,
    source: live.card,
    sourceSnapshot: toSnapshot(live.card, live.resolved),
    effectBlock: effect,
    resolvedCard: live.resolved,
  });
  const queuedEvents: EngineEvent[] = [];
  appendEffectQueuedEvent(state, queuedEvents, entry, effect, live.resolved);
  const queuedState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    effectQueue: [...state.effectQueue, entry],
    eventJournal: [...state.eventJournal, ...queuedEvents],
  };
  const resolved = processEffectRuntime(queuedState);
  return prependEventsToEngineResult(resolved, queuedEvents, options);
};
