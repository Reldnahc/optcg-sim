import type {
  CardFilter,
  CardInstance,
  CardRef,
  Effect,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SequenceSegmentResult,
  Target,
} from "@optcg/types";

import {
  cardMatchesHandSelectionFilter,
  getOpponentId,
  toCardRef,
} from "../actions/state.js";
import { appendEvent } from "../action-results.js";
import { moveConcreteCardsToTrash } from "../concrete-card-movement.js";
import { computeView } from "../view/compute-view.js";
import { executeSelectedTargetEffectPrimitive } from "../runtime/primitives/execute.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type AllTargetTrashEffect = Extract<Effect, { type: "trash" }> & {
  target: Extract<Target, { type: "all" }>;
};
type AllTargetKoEffect = Extract<Effect, { type: "ko" }> & {
  target: Extract<Target, { type: "all" }>;
};
type SegmentLedgers = {
  savedReferences: EffectExecutionFrame["savedReferences"];
  segmentResults: EffectExecutionFrame["segmentResults"];
};

export const applyAllTargetTrashSequenceSegment = (params: {
  effect: AllTargetTrashEffect;
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  index: number;
  ledgers: SegmentLedgers;
  segment: SequenceEffect["effects"][number];
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
  state: GameState;
}): {
  events: EngineEvent[];
  ledgers: SegmentLedgers;
  state: GameState;
} => {
  const targetPlayerId =
    params.effect.target.player === "self"
      ? params.entry.controllerId
      : getOpponentId(params.state, params.entry.controllerId);
  const player =
    targetPlayerId === null ? undefined : params.state.players[targetPlayerId];
  if (targetPlayerId === null || player === undefined) {
    return {
      events: [],
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [params.segmentKey(params.segment, params.index)]: {
            ...params.emptySegmentResult(),
            attempted: true,
          },
        },
      },
      state: params.state,
    };
  }
  const sourceZone =
    params.effect.target.zone === "characterArea" ||
    params.effect.target.zone === "stageArea"
      ? params.effect.target.zone
      : null;
  if (sourceZone === null) {
    return {
      events: [],
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [params.segmentKey(params.segment, params.index)]: {
            ...params.emptySegmentResult(),
            attempted: true,
          },
        },
      },
      state: params.state,
    };
  }
  const sourceCards =
    sourceZone === "characterArea"
      ? player.characters
      : player.stage === undefined
        ? []
        : [player.stage];
  const selectedCards = sourceCards.filter((card) =>
    cardMatchesHandSelectionFilter(
      params.state,
      targetPlayerId,
      card,
      params.effect.target.filter,
    ),
  );
  const attachedDonIds = new Set(
    selectedCards.flatMap((card) => card.attachedDon),
  );
  const events: EngineEvent[] = [];
  const movement = moveConcreteCardsToTrash(
    params.state,
    events,
    selectedCards,
    {
      cardMovedPayloadShape: "zoneRefs",
      cardMovedVisibility: { type: "public" },
      cardTrashedVisibility: { type: "public" },
      clearAttachedDon: true,
      emitCardTrashed: true,
      includeCardIdentityInCardMoved: true,
      playerId: targetPlayerId,
      reason: "effectTrash",
      sourceZone,
    },
  );
  const movedPlayer = movement.state.players[targetPlayerId];
  if (movedPlayer === undefined) {
    return {
      events,
      ledgers: params.ledgers,
      state: params.state,
    };
  }
  const nextPlayer = {
    ...movedPlayer,
    costArea: player.costArea.map((card) =>
      attachedDonIds.has(card.instanceId)
        ? { ...card, state: "rested" as const }
        : card,
    ),
  };
  const eventBaseState: GameState = {
    ...movement.state,
    players: {
      ...movement.state.players,
      [targetPlayerId]: nextPlayer,
    },
  };
  for (const donId of attachedDonIds) {
    appendEvent(
      eventBaseState,
      events,
      "donReturned",
      { playerId: targetPlayerId, donInstanceId: donId, state: "rested" },
      { type: "replayOnly" },
    );
  }
  return {
    events,
    ledgers: {
      ...params.ledgers,
      segmentResults: {
        ...params.ledgers.segmentResults,
        [params.segmentKey(params.segment, params.index)]: {
          ...params.emptySegmentResult(),
          attempted: true,
          changedState: selectedCards.length > 0,
          succeeded: true,
        },
      },
    },
    state: {
      ...eventBaseState,
      eventJournal: [...params.state.eventJournal, ...events],
    },
  };
};

const numericFilterMatches = (
  value: number | undefined,
  filter: CardFilter["power"] | CardFilter["currentPower"],
): boolean => {
  if (filter === undefined) return true;
  if (value === undefined) return false;
  if ("op" in filter) {
    if (filter.op === "eq") return value === filter.value;
    if (filter.op === "neq") return value !== filter.value;
    if (filter.op === "gt") return value > filter.value;
    if (filter.op === "gte") return value >= filter.value;
    if (filter.op === "lt") return value < filter.value;
    return value <= filter.value;
  }
  if (filter.min !== undefined && value < filter.min) return false;
  if (filter.max !== undefined && value > filter.max) return false;
  return true;
};

const withoutCurrentPowerFilter = (filter: CardFilter): CardFilter => {
  const { currentPower, ...rest } = filter;
  void currentPower;
  return rest;
};

const cardMatchesAllKoFilter = (
  state: GameState,
  playerId: CardRef["playerId"],
  card: CardInstance,
  source: EffectQueueEntry["source"],
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  if (filter.excludeSelf === true && card.instanceId === source.instanceId) {
    return false;
  }
  if (
    !cardMatchesHandSelectionFilter(
      state,
      playerId,
      card,
      withoutCurrentPowerFilter(filter),
    )
  ) {
    return false;
  }
  if (filter.currentPower === undefined) {
    return true;
  }
  const view = computeView(state, {
    supportStatusPolicy: "ignore",
    unsupportedCombatKeywordPolicy: "ignore",
  });
  return numericFilterMatches(
    view.cards[card.instanceId]?.currentPower,
    filter.currentPower,
  );
};

const targetPlayersForAllTarget = (
  state: GameState,
  entry: EffectQueueEntry,
  player: Extract<Target, { type: "all" }>["player"],
): readonly CardRef["playerId"][] => {
  if (player === "self") {
    return [entry.controllerId];
  }
  if (player === "opponent") {
    const opponentId = getOpponentId(state, entry.controllerId);
    return opponentId === null ? [] : [opponentId];
  }
  return Object.keys(state.players) as CardRef["playerId"][];
};

export const applyAllTargetKoSequenceSegment = (params: {
  effect: AllTargetKoEffect;
  emptySegmentResult: () => SequenceSegmentResult;
  entry: EffectQueueEntry;
  index: number;
  ledgers: SegmentLedgers;
  segment: SequenceEffect["effects"][number];
  segmentKey: (
    segment: SequenceEffect["effects"][number],
    index: number,
  ) => string;
  state: GameState;
}): {
  events: EngineEvent[];
  ledgers: SegmentLedgers;
  state: GameState;
} => {
  const targetPlayerIds = targetPlayersForAllTarget(
    params.state,
    params.entry,
    params.effect.target.player,
  );
  if (targetPlayerIds.length === 0) {
    return {
      events: [],
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [params.segmentKey(params.segment, params.index)]: {
            ...params.emptySegmentResult(),
            attempted: true,
          },
        },
      },
      state: params.state,
    };
  }
  const selectedTargets = targetPlayerIds.flatMap((targetPlayerId) => {
    const player = params.state.players[targetPlayerId];
    if (player === undefined) {
      return [];
    }
    return player.characters
      .filter((card) =>
        cardMatchesAllKoFilter(
          params.state,
          targetPlayerId,
          card,
          params.entry.source,
          params.effect.target.filter,
        ),
      )
      .map((card) => toCardRef(card, targetPlayerId));
  });
  const resolvedKo = executeSelectedTargetEffectPrimitive(
    params.state,
    params.entry,
    {
      type: "ko",
      target: {
        type: "choose",
        request: {
          timing: "onResolution",
          chooser: "self",
          player: params.effect.target.player,
          zone: "characterArea",
          min: selectedTargets.length,
          max: selectedTargets.length,
          allowFewerIfUnavailable: false,
          visibility: "public",
        },
      },
    },
    selectedTargets,
  );
  if (resolvedKo.errors !== undefined) {
    return {
      events: [],
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [params.segmentKey(params.segment, params.index)]: {
            ...params.emptySegmentResult(),
            attempted: true,
          },
        },
      },
      state: params.state,
    };
  }
  if (resolvedKo.state.pendingDecision?.type === "chooseReplacement") {
    return {
      events: resolvedKo.events,
      ledgers: {
        ...params.ledgers,
        segmentResults: {
          ...params.ledgers.segmentResults,
          [params.segmentKey(params.segment, params.index)]: {
            ...params.emptySegmentResult(),
            attempted: true,
          },
        },
      },
      state: resolvedKo.state,
    };
  }
  return {
    events: resolvedKo.events,
    ledgers: {
      ...params.ledgers,
      segmentResults: {
        ...params.ledgers.segmentResults,
        [params.segmentKey(params.segment, params.index)]: {
          ...params.emptySegmentResult(),
          attempted: true,
          changedState: resolvedKo.events.length > 0,
          selectedTargets,
          succeeded: true,
        },
      },
    },
    state: resolvedKo.state,
  };
};
