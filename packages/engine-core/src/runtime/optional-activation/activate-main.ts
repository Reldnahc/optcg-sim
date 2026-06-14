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
  illegalAction,
  toStateSeq,
} from "../../action-results.js";
import { isMatchActive } from "../../actions/state.js";
import {
  evaluateQueuedEffectCondition,
  isSupportedQueuedEffectConditionShape,
} from "../../effect-runtime-conditions.js";
import { isSupportedContinuousQueueEffect } from "../continuous/continuous.js";
import {
  processEffectRuntime,
  resolveImplementedDslEffectDefinition,
} from "../../effect-runtime.js";
import { isSupportedSequenceBlock } from "../../effect-runtime-sequence/support.js";
import { canResolvePrimitiveBodyForEntry } from "../../effect-runtime-queue/primitive-resolution.js";
import { toSnapshot } from "../../effect-runtime-trigger-source-lookup.js";
import { activeEffectTextPresentationForEffectBlock } from "../effect-presentation.js";
import {
  isFieldZoneForActivateMain,
  isScopedActivateMainQueueEntry,
} from "./activate-main-support.js";
import { canAdmitOncePerTurnEffect } from "../../rules/once-per-turn.js";
import {
  fieldSourceCanUseEffects,
  findFieldSource,
} from "../source-presence-gate.js";

export { isScopedActivateMainQueueEntry };

type ActivateMainSource = CardRef & { zone: NonNullable<CardRef["zone"]> };

type ActivateMainRuntimeEffectBlock = EffectDefinition["effects"][number] & {
  sourcePresencePolicy: SourcePresencePolicy;
};

const activateMainPrimitiveProbeEntry: EffectQueueEntry = {
  id: "queue-entry:activate-main:probe" as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    "timing-window:activate-main:probe" as EffectQueueEntry["timingWindowId"],
  queueOrigin: { type: "activateMain" },
  generation: 0,
  controllerId: "player-1" as PlayerId,
  source: {
    instanceId: "instance:activate-main:probe" as CardRef["instanceId"],
    cardId: "card:activate-main:probe" as CardRef["cardId"],
    playerId: "player-1" as PlayerId,
    zone: {
      zone: "leaderArea",
      playerId: "player-1" as PlayerId,
      slot: "leader",
      index: 0,
    },
  },
  sourceSnapshot: {
    instanceId: "instance:activate-main:probe" as CardRef["instanceId"],
    cardId: "card:activate-main:probe" as CardRef["cardId"],
    ownerId: "player-1" as PlayerId,
    controllerId: "player-1" as PlayerId,
    zone: {
      zone: "leaderArea",
      playerId: "player-1" as PlayerId,
      slot: "leader",
      index: 0,
    },
    category: "leader",
    colors: [],
    keywords: [],
  },
  effectBlockId:
    "effect:activate-main:probe" as EffectQueueEntry["effectBlockId"],
  orderingGroup: "turnPlayer",
  createdAtEventSeq: 0,
  queuedAtStateSeq: 0 as EffectQueueEntry["queuedAtStateSeq"],
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "effectRuntime:activateMain" },
};

const hasSupportedActivateMainEnvelope = (
  effect: EffectDefinition["effects"][number],
): effect is ActivateMainRuntimeEffectBlock =>
  effect.category === "activate" &&
  effect.trigger.type === "activateMain" &&
  effect.sourcePresencePolicy === "mustRemainInSameZone" &&
  effect.cost === undefined &&
  effect.conditionTiming === undefined &&
  effect.failurePolicy === undefined;

const isSupportedActivateMainContinuousBody = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
} =>
  isSupportedQueuedEffectConditionShape(effect.condition) &&
  isSupportedContinuousQueueEffect(effect.effect);

const isSupportedActivateMainPrimitiveBody = (
  effect: EffectDefinition["effects"][number],
  entry: EffectQueueEntry,
): boolean => {
  const primitiveSupportShape =
    effect.optional === true ? { ...effect, optional: false as const } : effect;
  return canResolvePrimitiveBodyForEntry(primitiveSupportShape, entry);
};

const isSupportedActivateMainSequenceBody = (
  effect: EffectDefinition["effects"][number],
  entry: EffectQueueEntry,
): boolean => isSupportedSequenceBlock(entry, effect);

export const isSupportedActivateMainRuntimeEffectBlock = (
  effect: EffectDefinition["effects"][number],
  entry: EffectQueueEntry = activateMainPrimitiveProbeEntry,
): effect is ActivateMainRuntimeEffectBlock => {
  if (!hasSupportedActivateMainEnvelope(effect)) {
    return false;
  }
  if (effect.optional === true) {
    return isSupportedActivateMainPrimitiveBody(effect, entry);
  }
  return (
    isSupportedActivateMainPrimitiveBody(effect, entry) ||
    isSupportedActivateMainSequenceBody(effect, entry) ||
    isSupportedActivateMainContinuousBody(effect)
  );
};

const createActivateMainQueueEntry = (params: {
  state: GameState;
  source: {
    instanceId: CardRef["instanceId"];
    cardId: CardRef["cardId"];
    playerId: PlayerId;
    zone: NonNullable<CardRef["zone"]>;
    controllerId: PlayerId;
  };
  sourceSnapshot: EffectQueueEntry["sourceSnapshot"];
  effectBlock: EffectDefinition["effects"][number];
  resolvedCard: ResolvedCard;
}): EffectQueueEntry => {
  const entrySource = {
    instanceId: params.source.instanceId,
    cardId: params.source.cardId,
    playerId: params.source.playerId,
    zone: params.source.zone,
  };
  const presentation = activeEffectTextPresentationForEffectBlock({
    effectBlock: params.effectBlock,
    resolvedCard: params.resolvedCard,
    source: entrySource,
  });
  return {
    id: `queue-entry:activate-main:${String(params.state.actionSeq + 1)}:${String(params.source.instanceId)}:${String(params.effectBlock.id)}` as EffectQueueEntry["id"],
    state: "pending",
    timingWindowId:
      `timing-window:activate-main:${String(params.state.seq + 1)}` as EffectQueueEntry["timingWindowId"],
    queueOrigin: { type: "activateMain" },
    generation: 0,
    controllerId: params.source.controllerId,
    source: entrySource,
    sourceSnapshot: params.sourceSnapshot,
    effectBlockId: params.effectBlock.id,
    orderingGroup:
      params.source.controllerId === params.state.turn.turnPlayerId
        ? "turnPlayer"
        : "nonTurnPlayer",
    createdAtEventSeq: params.state.eventJournal.length + 1,
    queuedAtStateSeq: toStateSeq(params.state.seq + 1),
    sourcePresencePolicy: "mustRemainInSameZone",
    causedBy: { type: "ruleProcess", name: "effectRuntime:activateMain" },
    ...(presentation === undefined ? {} : { presentation }),
  };
};

const findSupportedActivateMainEffects = (
  state: GameState,
  source: ActivateMainSource,
  liveCard: CardInstance,
  resolvedCard: ResolvedCard,
): EffectDefinition["effects"][number][] => {
  const resolved = state.cardManifest.cards[source.cardId];
  if (resolved === undefined || resolved.support.status !== "implemented-dsl") {
    return [];
  }
  const lookup = resolveImplementedDslEffectDefinition(
    resolved,
    state.cardManifest,
  );
  if (!lookup.ok) {
    return [];
  }
  return lookup.definition.effects.filter((effect) => {
    const sequenceSupportEntry = createActivateMainQueueEntry({
      state,
      source: {
        instanceId: liveCard.instanceId,
        cardId: liveCard.cardId,
        playerId: source.playerId,
        zone: liveCard.zone,
        controllerId: liveCard.controller,
      },
      sourceSnapshot: toSnapshot(liveCard, resolvedCard),
      effectBlock: effect,
      resolvedCard,
    });
    return (
      isSupportedActivateMainRuntimeEffectBlock(effect, sequenceSupportEntry) ||
      (effect.trigger.type === "activateMain" &&
        isSupportedSequenceBlock(sequenceSupportEntry, effect))
    );
  });
};

export const getActivateMainLegalActions = (
  state: GameState,
  playerId: PlayerId,
): LegalAction[] => {
  if (
    state.turn.phase !== "main" ||
    state.turn.turnPlayerId !== playerId ||
    state.battle !== undefined
  ) {
    return [];
  }
  const player = state.players[playerId];
  if (player === undefined) {
    return [];
  }
  const sources: CardRef[] = [
    {
      instanceId: player.leader.instanceId,
      cardId: player.leader.cardId,
      playerId,
      zone: player.leader.zone,
    },
    ...player.characters.map((card) => ({
      instanceId: card.instanceId,
      cardId: card.cardId,
      playerId,
      zone: card.zone,
    })),
    ...(player.stage === undefined
      ? []
      : [
          {
            instanceId: player.stage.instanceId,
            cardId: player.stage.cardId,
            playerId,
            zone: player.stage.zone,
          },
        ]),
  ];
  const actions: LegalAction[] = [];
  for (const source of sources) {
    if (!isFieldZoneForActivateMain(source.zone)) {
      continue;
    }
    const sourceWithZone: ActivateMainSource = {
      ...source,
      zone: source.zone,
    };
    const live = fieldSourceCanUseEffects(state, sourceWithZone);
    if (live === undefined || live.card.controller !== playerId) {
      continue;
    }
    const supported = findSupportedActivateMainEffects(
      state,
      sourceWithZone,
      live.card,
      live.resolved,
    );
    for (const effect of supported) {
      const queueEntry = createActivateMainQueueEntry({
        state,
        source: {
          instanceId: live.card.instanceId,
          cardId: live.card.cardId,
          playerId,
          zone: live.card.zone,
          controllerId: live.card.controller,
        },
        sourceSnapshot: toSnapshot(live.card, live.resolved),
        effectBlock: effect,
        resolvedCard: live.resolved,
      });
      const condition = evaluateQueuedEffectCondition(
        state,
        queueEntry,
        effect.condition,
      );
      if (!condition.supported || !condition.passed) {
        continue;
      }
      if (!canAdmitOncePerTurnEffect(state, queueEntry, effect)) {
        continue;
      }
      actions.push({
        type: "activateEffect",
        source,
        effectId: effect.id,
      });
    }
  }
  return actions;
};

export const applyActivateMainAction = (
  state: GameState,
  action: Extract<Action, { type: "activateEffect" }>,
): EngineResult => {
  if (!isMatchActive(state)) {
    return illegalAction(
      state,
      "activateEffect is only legal while match is active.",
    );
  }
  if (
    state.turn.phase !== "main" ||
    state.battle !== undefined ||
    state.turn.turnPlayerId !== action.source.playerId
  ) {
    return illegalAction(
      state,
      "activateEffect requires controller main phase.",
    );
  }
  const live = findFieldSource(state, action.source);
  if (live === undefined || live.card.controller !== action.source.playerId) {
    return illegalAction(
      state,
      "activateEffect source is stale or not controller-owned.",
    );
  }
  if (fieldSourceCanUseEffects(state, action.source) === undefined) {
    return illegalAction(state, "activateEffect source effects are negated.");
  }
  const supportedEffects = findSupportedActivateMainEffects(
    state,
    {
      ...action.source,
      zone: live.card.zone,
    },
    live.card,
    live.resolved,
  );
  const effect = supportedEffects.find(
    (candidate) => candidate.id === action.effectId,
  );
  if (effect === undefined) {
    return illegalAction(
      state,
      "activateEffect effect id is unsupported for source.",
    );
  }
  const entry = createActivateMainQueueEntry({
    state,
    source: {
      instanceId: live.card.instanceId,
      cardId: live.card.cardId,
      playerId: action.source.playerId,
      zone: live.card.zone,
      controllerId: live.card.controller,
    },
    sourceSnapshot: toSnapshot(live.card, live.resolved),
    effectBlock: effect,
    resolvedCard: live.resolved,
  });
  if (!canAdmitOncePerTurnEffect(state, entry, effect)) {
    return illegalAction(state, "activateEffect once-per-turn already used.");
  }
  const condition = evaluateQueuedEffectCondition(
    state,
    entry,
    effect.condition,
  );
  if (!condition.supported || !condition.passed) {
    return illegalAction(state, "activateEffect activation condition not met.");
  }

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
  return {
    ...resolved,
    events: [...queuedEvents, ...resolved.events],
  };
};
