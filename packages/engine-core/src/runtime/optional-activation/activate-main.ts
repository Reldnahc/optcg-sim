import type {
  Action,
  CardInstance,
  CardRef,
  Effect,
  EffectDefinition,
  EffectQueueEntry,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  PlayerId,
  ResolvedCard,
} from "@optcg/types";

import {
  appendEvent,
  illegalAction,
  toStateSeq,
} from "../../action-results.js";
import { isMatchActive, zonesEqual } from "../../action-state.js";
import {
  evaluateQueuedEffectCondition,
  isSupportedQueuedEffectConditionShape,
} from "../../effect-runtime-conditions.js";
import { isSupportedContinuousQueueEffect } from "../continuous/continuous.js";
import { isCardEffectInvalidated } from "../../effect-invalidation.js";
import {
  processEffectRuntime,
  resolveImplementedDslEffectDefinition,
} from "../../effect-runtime.js";
import { isSupportedSequenceBlock } from "../../effect-runtime-sequence/support.js";
import { toSnapshot } from "../../effect-runtime-trigger-source-lookup.js";
import {
  isOncePerTurnUsed,
  toOncePerTurnKey,
} from "../../rules/once-per-turn.js";

const isFieldZoneForActivateMain = (
  zone: CardRef["zone"],
): zone is NonNullable<CardRef["zone"]> =>
  zone?.zone === "leaderArea" ||
  zone?.zone === "characterArea" ||
  zone?.zone === "stageArea";

export const isScopedActivateMainQueueEntry = (
  entry: EffectQueueEntry,
): boolean =>
  entry.causedBy.type === "ruleProcess" &&
  entry.causedBy.name === "effectRuntime:activateMain" &&
  String(entry.id).startsWith("queue-entry:activate-main:") &&
  String(entry.timingWindowId).startsWith("timing-window:activate-main:") &&
  entry.generation === 0 &&
  entry.triggerEventId === undefined &&
  entry.sourcePresencePolicy === "mustRemainInSameZone" &&
  isFieldZoneForActivateMain(entry.source.zone) &&
  isFieldZoneForActivateMain(entry.sourceSnapshot.zone);

type ActivateMainSource = CardRef & { zone: NonNullable<CardRef["zone"]> };

const isSupportedActivateMainDrawEffectShape = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  effect: Extract<Effect, { type: "draw" }>;
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
} =>
  effect.category === "activate" &&
  effect.trigger.type === "activateMain" &&
  effect.sourcePresencePolicy === "mustRemainInSameZone" &&
  effect.cost === undefined &&
  effect.conditionTiming === undefined &&
  effect.failurePolicy === undefined &&
  effect.effect.type === "draw" &&
  Number.isInteger(effect.effect.count) &&
  effect.effect.count >= 0 &&
  effect.effect.player === "self";

export const isSupportedActivateMainNoChoiceDrawEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  effect: Extract<Effect, { type: "draw" }>;
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
} => effect.optional !== true && isSupportedActivateMainDrawEffectShape(effect);

export const isSupportedOptionalActivateMainNoChoiceDrawEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  effect: Extract<Effect, { type: "draw" }>;
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
} => effect.optional === true && isSupportedActivateMainDrawEffectShape(effect);

export const isSupportedActivateMainContinuousEffect = (
  effect: EffectDefinition["effects"][number],
): effect is EffectDefinition["effects"][number] & {
  sourcePresencePolicy: EffectQueueEntry["sourcePresencePolicy"];
} =>
  effect.category === "activate" &&
  effect.trigger.type === "activateMain" &&
  effect.sourcePresencePolicy === "mustRemainInSameZone" &&
  effect.optional !== true &&
  effect.cost === undefined &&
  effect.conditionTiming === undefined &&
  effect.failurePolicy === undefined &&
  isSupportedQueuedEffectConditionShape(effect.condition) &&
  isSupportedContinuousQueueEffect(effect.effect);

const findLiveCardBySource = (
  state: GameState,
  source: CardRef,
):
  | {
      card: CardInstance;
      resolved: ResolvedCard;
    }
  | undefined => {
  if (!isFieldZoneForActivateMain(source.zone)) {
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
  effectId: EffectDefinition["effects"][number]["id"];
}): EffectQueueEntry => ({
  id: `queue-entry:activate-main:${String(params.state.actionSeq + 1)}:${String(params.source.instanceId)}:${String(params.effectId)}` as EffectQueueEntry["id"],
  state: "pending",
  timingWindowId:
    `timing-window:activate-main:${String(params.state.seq + 1)}` as EffectQueueEntry["timingWindowId"],
  generation: 0,
  controllerId: params.source.controllerId,
  source: {
    instanceId: params.source.instanceId,
    cardId: params.source.cardId,
    playerId: params.source.playerId,
    zone: params.source.zone,
  },
  sourceSnapshot: params.sourceSnapshot,
  effectBlockId: params.effectId,
  orderingGroup:
    params.source.controllerId === params.state.turn.turnPlayerId
      ? "turnPlayer"
      : "nonTurnPlayer",
  createdAtEventSeq: params.state.eventJournal.length + 1,
  queuedAtStateSeq: toStateSeq(params.state.seq + 1),
  sourcePresencePolicy: "mustRemainInSameZone",
  causedBy: { type: "ruleProcess", name: "effectRuntime:activateMain" },
});

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
      effectId: effect.id,
    });
    return (
      isSupportedActivateMainNoChoiceDrawEffect(effect) ||
      isSupportedOptionalActivateMainNoChoiceDrawEffect(effect) ||
      isSupportedActivateMainContinuousEffect(effect) ||
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
    const live = findLiveCardBySource(state, sourceWithZone);
    if (live === undefined || live.card.controller !== playerId) {
      continue;
    }
    const supported = findSupportedActivateMainEffects(
      state,
      sourceWithZone,
      live.card,
      live.resolved,
    );
    if (isCardEffectInvalidated(state, live.card)) {
      continue;
    }
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
        effectId: effect.id,
      });
      const condition = evaluateQueuedEffectCondition(
        state,
        queueEntry,
        effect.condition,
      );
      if (!condition.supported || !condition.passed) {
        continue;
      }
      if (effect.oncePerTurn === true) {
        const key = toOncePerTurnKey({
          cardInstanceId: source.instanceId,
          effectId: effect.id,
          turnNumber: state.turn.globalTurn,
        });
        if (isOncePerTurnUsed(state, key)) {
          continue;
        }
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
  const live = findLiveCardBySource(state, action.source);
  if (live === undefined || live.card.controller !== action.source.playerId) {
    return illegalAction(
      state,
      "activateEffect source is stale or not controller-owned.",
    );
  }
  if (isCardEffectInvalidated(state, live.card)) {
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
  if (effect.oncePerTurn === true) {
    const key = toOncePerTurnKey({
      cardInstanceId: action.source.instanceId,
      effectId: effect.id,
      turnNumber: state.turn.globalTurn,
    });
    if (isOncePerTurnUsed(state, key)) {
      return illegalAction(state, "activateEffect once-per-turn already used.");
    }
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
    effectId: effect.id,
  });
  const condition = evaluateQueuedEffectCondition(
    state,
    entry,
    effect.condition,
  );
  if (!condition.supported || !condition.passed) {
    return illegalAction(state, "activateEffect activation condition not met.");
  }

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
