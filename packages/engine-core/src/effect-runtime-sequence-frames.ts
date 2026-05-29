/* eslint-disable max-lines */
import type {
  CardInstance,
  CardFilter,
  CardRef,
  ChooseOptionalActivationDecision,
  Effect,
  EffectDefinition,
  EffectExecutionFrame,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  GameState,
  OptionalPayCostDecision,
  PayCostDecision,
  SelectTargetsDecision,
  SelectCardsDecision,
  SequenceSegmentResult,
  Target,
  TargetRequest,
  MultiZoneTargetRequest,
} from "@optcg/types";

import {
  cardMatchesHandSelectionFilter,
  getOpponentId,
  reindexZoneCards,
  toCardRef,
} from "./action-state.js";
import { appendEvent, toDecisionId, toStateSeq } from "./action-results.js";
import { moveConcreteCardsToTrash } from "./concrete-card-movement.js";
import { createSupportedHandSelectionChoiceDecision } from "./effect-runtime-hand-selection.js";
import {
  createChooseQuantityDecisionForSequenceSegment,
  createOptionalActivationDecisionForSequenceSegment,
  createPayCostDecisionForSequenceSegment,
  findSequenceFrameByDecisionId,
  frameForPausedSequenceDecision,
  getSequenceOptionalPayCostOptions,
  stateWithPausedSequenceFrame,
} from "./effect-runtime-sequence-frame-decisions.js";
import { appendEffectResolvedForCompletedSequence } from "./effect-runtime-sequence-frame-events.js";
import {
  applyPlaySelectedSequenceSegment,
  resumePlaySelectedOverflowFrame,
} from "./effect-runtime-play-selected.js";
import {
  resumeSequenceFrameAfterHandSelection as resumeSequenceFrameAfterHandSelectionHelper,
  resumeSequenceFrameAfterTrashFromHand as resumeSequenceFrameAfterTrashFromHandHelper,
} from "./effect-runtime-sequence-select-cards.js";
import {
  applySavedFieldObjectActivateSequenceSegment,
  applySavedFieldObjectKoSequenceSegment,
  applySavedFieldObjectRestSequenceSegment,
  applySavedFieldObjectRestrictionSequenceSegment,
} from "./effect-runtime-sequence-saved-field-object.js";
import { evaluateQueuedEffectCondition } from "./effect-runtime-conditions.js";
import { createContinuousRecordsForResolvedEffect } from "./effect-runtime-continuous.js";
import { executeSelectedTargetEffectPrimitive } from "./effect-runtime-target-ko-primitives.js";
import { resolvePlayerId } from "./effect-runtime-primitives.js";
import {
  applySelectTargetsSequenceSegment,
  resumeSequenceFrameAfterSelectTargets as resumeSequenceFrameAfterSelectTargetsHelper,
} from "./effect-runtime-sequence-select-targets.js";
import { resumeSequenceFrameAfterChooseQuantity as resumeDrawUpToQuantitySequenceFrame } from "./effect-runtime-sequence-draw-upto.js";
import {
  applySearchRevealSequenceSegment,
  resumeSequenceFrameAfterSearchRevealHelper,
  retargetSequenceFrameAfterSearchRevealOrder,
} from "./effect-runtime-sequence-search-reveal.js";
import { createTopDeckPlacementDecision } from "./effect-runtime-top-deck-placement.js";
import {
  applyDrawSegment,
  applyMoveCardsSegment,
  removeFrame,
  replaceQueueEntry,
  resolvingEntryFor,
  saveReference,
  shouldAttemptSegment,
} from "./effect-runtime-sequence-segments.js";
import {
  toSupportedSequenceBlock,
  type SupportedSequenceBlock,
  type SupportedSequenceSegment,
} from "./effect-runtime-sequence-support.js";
import { resolvePublicTargetCandidatesForRequest } from "./target-selection.js";
import {
  consumeOncePerTurn,
  isOncePerTurnUsed,
  toOncePerTurnKey,
} from "./once-per-turn.js";
import { applyRuntimePlaySource } from "./play-card.js";
import { computeView } from "./compute-view.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type SequenceSegmentEffect = SequenceEffect["effects"][number]["effect"];
type DrawEffect = Extract<Effect, { type: "draw" }>;
type MoveCardsEffect = Extract<Effect, { type: "moveCards" }>;
type TrashFromHandEffect = Extract<Effect, { type: "trashFromHand" }>;
type PayCostEffect = Extract<SequenceSegmentEffect, { type: "payCost" }>;
type MoveSelectedEffect = Extract<Effect, { type: "moveSelected" }>;
type AttachSelectedDonEffect = Extract<Effect, { type: "attachSelectedDon" }>;
type RevealTopEffect = Extract<Effect, { type: "revealTop" }>;
type SelectFromSetEffect = Extract<Effect, { type: "selectFromSet" }>;
type BounceEffect = Extract<Effect, { type: "bounce" }> & {
  target: Extract<Target, { type: "savedFieldObject" }>;
  destination: "hand";
};
type TrashEffect = Extract<Effect, { type: "trash" }> & {
  target: Extract<Target, { type: "all" }>;
};
type AllTargetKoEffect = Extract<Effect, { type: "ko" }> & {
  target: Extract<Target, { type: "all" }>;
};
type ContinuousResolvedEffect = Extract<
  Effect,
  {
    type:
      | "modifyPower"
      | "giveKeyword"
      | "modifyCost"
      | "preventDraw"
      | "invalidateEffects"
      | "cannotBecomeActive"
      | "cannotAttack"
      | "cannotBlock";
  }
>;
type ContinuousEffectWithTarget = Extract<
  ContinuousResolvedEffect,
  {
    target: Target;
  }
>;
type SegmentLedgers = {
  savedReferences: EffectExecutionFrame["savedReferences"];
  segmentResults: EffectExecutionFrame["segmentResults"];
};

export { retargetSequenceFrameAfterSearchRevealOrder };

type TrashDecisionResult =
  | {
      events: EngineEvent[];
      ok: true;
      state: GameState;
    }
  | {
      error: EngineError;
      events: EngineEvent[];
      ok: false;
      state: GameState;
    };

export type CreateTrashFromHandSequenceDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: TrashFromHandEffect,
) => TrashDecisionResult;

const createUnsupportedTrashDecision: CreateTrashFromHandSequenceDecision = (
  state,
  entry,
) => ({
  error: sequenceRuntimeError(
    entry.effectBlockId,
    "unsupported-sequence-shape",
  ),
  events: [],
  ok: false,
  state,
});

const isContinuousResolvedEffect = (
  effect: Effect,
): effect is ContinuousResolvedEffect =>
  effect.type === "modifyPower" ||
  effect.type === "giveKeyword" ||
  effect.type === "modifyCost" ||
  effect.type === "preventDraw" ||
  effect.type === "invalidateEffects" ||
  effect.type === "cannotBecomeActive" ||
  effect.type === "cannotAttack" ||
  effect.type === "cannotBlock";

const isContinuousEffectWithTarget = (
  effect: ContinuousResolvedEffect,
): effect is ContinuousEffectWithTarget => "target" in effect;

const hasSavedFieldObjectContinuousTarget = (
  effect: ContinuousResolvedEffect,
): boolean =>
  isContinuousEffectWithTarget(effect) &&
  effect.target.type === "savedFieldObject";

const continuousChooseTargetRequest = (
  effect: ContinuousResolvedEffect,
): TargetRequest | MultiZoneTargetRequest | undefined => {
  if (!isContinuousEffectWithTarget(effect)) {
    return undefined;
  }
  if (
    effect.target.type === "choose" ||
    effect.target.type === "chooseFromZones"
  ) {
    return effect.target.request;
  }
  return undefined;
};

const selectedCardRefsForMove = (
  ledgers: SegmentLedgers,
  effect: MoveSelectedEffect,
): readonly CardRef[] | null => {
  const selected = ledgers.savedReferences[effect.selection];
  return selected?.kind === "selectedCards" ? selected.cards : null;
};

const selectedCardRefsForAttachDon = (
  ledgers: SegmentLedgers,
  effect: AttachSelectedDonEffect,
): readonly CardRef[] | null => {
  const selected = ledgers.savedReferences[effect.selection];
  return selected?.kind === "selectedCards" ? selected.cards : null;
};

const selectedTargetRefForAttachDon = (
  ledgers: SegmentLedgers,
  effect: AttachSelectedDonEffect,
): CardRef | null => {
  if (effect.target.type !== "savedFieldObject") {
    return null;
  }
  const selected = ledgers.savedReferences[effect.target.binding.saveResultAs];
  if (selected?.kind !== "selectedTargets") {
    return null;
  }
  return (
    selected.targets[effect.target.binding.objectIndex ?? 0]?.object ?? null
  );
};

const applyAttachSelectedDonSequenceSegment = (params: {
  effect: AttachSelectedDonEffect;
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
}):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | { ok: false } => {
  const selectedDon = selectedCardRefsForAttachDon(
    params.ledgers,
    params.effect,
  );
  const target = selectedTargetRefForAttachDon(params.ledgers, params.effect);
  const player = params.state.players[params.entry.controllerId];
  if (selectedDon === null || target === null || player === undefined) {
    return { ok: false };
  }
  const selectedIds = new Set(selectedDon.map((card) => card.instanceId));
  const targetIndex = player.characters.findIndex(
    (card) =>
      card.instanceId === target.instanceId &&
      card.cardId === target.cardId &&
      card.zone.zone === "characterArea",
  );
  const targetsLeader =
    player.leader.instanceId === target.instanceId &&
    player.leader.cardId === target.cardId &&
    target.zone?.zone === "leaderArea";
  if (targetIndex < 0 && !targetsLeader) {
    return { ok: false };
  }
  if (
    !selectedDon.every((card) =>
      player.costArea.some(
        (candidate) =>
          candidate.instanceId === card.instanceId &&
          candidate.cardId === card.cardId &&
          candidate.state === "rested",
      ),
    )
  ) {
    return { ok: false };
  }
  const nextLeader = targetsLeader
    ? {
        ...player.leader,
        attachedDon: [...player.leader.attachedDon, ...selectedIds],
      }
    : player.leader;
  const nextCharacters = player.characters.map((card, index) =>
    index === targetIndex
      ? { ...card, attachedDon: [...card.attachedDon, ...selectedIds] }
      : card,
  );
  const nextCostArea = player.costArea.map((card) => {
    if (!selectedIds.has(card.instanceId)) {
      return card;
    }
    const attached = { ...card };
    delete attached.state;
    return attached;
  });
  const nextState: GameState = {
    ...params.state,
    seq: toStateSeq(params.state.seq + 1),
    players: {
      ...params.state.players,
      [params.entry.controllerId]: {
        ...player,
        leader: nextLeader,
        characters: nextCharacters,
        costArea: nextCostArea,
      },
    },
  };
  const events: EngineEvent[] = [];
  for (const don of selectedDon) {
    appendEvent(
      nextState,
      events,
      "donAttached",
      {
        playerId: params.entry.controllerId,
        donInstanceId: don.instanceId,
        targetInstanceId: target.instanceId,
      },
      { type: "replayOnly" },
    );
    const event = events[events.length - 1];
    if (event !== undefined) {
      event.causedBy = {
        type: "effect",
        queueEntryId: params.entry.id,
        effectId: params.entry.effectBlockId,
      };
    }
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
          succeeded: true,
          changedState: selectedDon.length > 0,
          selectedCards: [...selectedDon],
          selectedTargets: [target],
        },
      },
    },
    ok: true,
    state: {
      ...nextState,
      eventJournal: [...params.state.eventJournal, ...events],
    },
  };
};

const applyRevealTopSequenceSegment = (params: {
  effect: RevealTopEffect;
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
  const player = params.state.players[params.entry.controllerId];
  if (player === undefined || params.effect.player !== "self") {
    return {
      events: [],
      ledgers: params.ledgers,
      state: params.state,
    };
  }
  const sourceZone = params.effect.zone ?? "deck";
  const sourceCards =
    sourceZone === "life"
      ? player.life.map((lifeCard) => lifeCard.card)
      : player.deck;
  const revealedCards = sourceCards
    .slice(0, params.effect.count)
    .map((card) => toCardRef(card, params.entry.controllerId));
  const revealId = `reveal:sequence:${String(params.entry.id)}:${String(params.index)}`;
  const events: EngineEvent[] = [];
  if (revealedCards.length > 0) {
    appendEvent(
      params.state,
      events,
      "cardRevealed",
      {
        revealId,
        cards: revealedCards,
        origin:
          sourceZone === "life"
            ? { zone: "life", playerId: params.entry.controllerId }
            : "topOfDeck",
        selectionSetId: params.effect.saveAs,
      },
      { type: "public" },
    );
    const event = events[0];
    if (event !== undefined) {
      event.causedBy = {
        type: "effect",
        queueEntryId: params.entry.id,
        effectId: params.entry.effectBlockId,
      };
    }
  }

  const nextState =
    revealedCards.length === 0
      ? params.state
      : {
          ...params.state,
          seq: toStateSeq(params.state.seq + 1),
          revealedCards: [
            ...params.state.revealedCards,
            {
              id: revealId,
              cards: revealedCards,
              visibility: { type: "public" as const },
              origin:
                sourceZone === "life"
                  ? ({
                      zone: "life",
                      playerId: params.entry.controllerId,
                    } as const)
                  : ("topOfDeck" as const),
              createdAtStateSeq: toStateSeq(params.state.seq + 1),
              cleanupPolicy: "returnToOrigin" as const,
            },
          ],
          eventJournal: [...params.state.eventJournal, ...events],
        };

  return {
    events,
    ledgers: {
      ...params.ledgers,
      savedReferences: {
        ...params.ledgers.savedReferences,
        [params.effect.saveAs]: {
          kind: "selectedCards",
          cards: revealedCards,
        },
      },
      segmentResults: {
        ...params.ledgers.segmentResults,
        [params.segmentKey(params.segment, params.index)]: {
          ...params.emptySegmentResult(),
          attempted: true,
          succeeded: true,
          changedState: revealedCards.length > 0,
          selectedCards: revealedCards,
        },
      },
    },
    state: nextState,
  };
};

const createSelectFromSetDecision = (params: {
  effect: SelectFromSetEffect;
  entry: EffectQueueEntry;
  index: number;
  ledgers: SegmentLedgers;
  state: GameState;
}): { events: EngineEvent[]; ok: true; state: GameState } | { ok: false } => {
  const set = params.ledgers.savedReferences[params.effect.set];
  if (set?.kind !== "selectedCards") {
    return { ok: false };
  }
  const candidates = set.cards.filter((card) => {
    const player = params.state.players[card.playerId];
    const deckCard =
      card.zone?.zone === "deck"
        ? player?.deck.find(
            (candidate) => candidate.instanceId === card.instanceId,
          )
        : undefined;
    return (
      deckCard !== undefined &&
      cardMatchesHandSelectionFilter(
        params.state,
        card.playerId,
        deckCard,
        params.effect.filter,
      )
    );
  });
  const decision: SelectCardsDecision = {
    id: toDecisionId(
      `decision:selectCards:sequence-set:${String(params.entry.id)}:${String(params.index)}`,
    ),
    type: "selectCards",
    playerId: params.entry.controllerId,
    prompt: "Choose a revealed card, or decline.",
    causedBy: {
      type: "effect",
      queueEntryId: params.entry.id,
      effectId: params.entry.effectBlockId,
    },
    visibility: { type: "public" },
    request: {
      timing: "onResolution",
      chooser: "self",
      set: params.effect.set,
      min: params.effect.min,
      max: params.effect.max,
      allowFewerIfUnavailable: true,
      visibility: "public",
      ...(params.effect.filter === undefined
        ? {}
        : { filter: params.effect.filter }),
    },
    candidates: candidates.map((card) => ({
      card,
      visibility: { type: "public" as const },
    })),
    defaultResponse: { type: "cards", cards: [] },
  };
  const events: EngineEvent[] = [];
  appendEvent(
    params.state,
    events,
    "decisionCreated",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
    },
    { type: "public" },
  );
  const event = events[0];
  if (event !== undefined) {
    event.causedBy = decision.causedBy;
  }
  return {
    events,
    ok: true,
    state: {
      ...params.state,
      seq: toStateSeq(params.state.seq + 1),
      pendingDecision: decision,
      eventJournal: [...params.state.eventJournal, ...events],
    },
  };
};

const applyTrashToHandMoveSelectedSegment = (params: {
  effect: MoveSelectedEffect;
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
}):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | { ok: false } => {
  if (
    params.effect.from !== "trash" ||
    params.effect.to !== "hand" ||
    params.effect.position !== undefined
  ) {
    return { ok: false };
  }
  const selected = selectedCardRefsForMove(params.ledgers, params.effect);
  const player = params.state.players[params.entry.controllerId];
  if (selected === null || player === undefined) {
    return { ok: false };
  }
  const selectedIds = new Set(selected.map((card) => card.instanceId));
  const movedCards: CardInstance[] = [];
  for (const selectedCard of selected) {
    const current = player.trash.find(
      (card) =>
        card.instanceId === selectedCard.instanceId &&
        card.cardId === selectedCard.cardId,
    );
    if (current === undefined) {
      return { ok: false };
    }
    movedCards.push(current);
  }
  const nextTrash = reindexZoneCards(
    player.trash.filter((card) => !selectedIds.has(card.instanceId)),
    "trash",
    params.entry.controllerId,
    "trash",
  );
  const nextHand = reindexZoneCards(
    [...player.hand, ...movedCards],
    "hand",
    params.entry.controllerId,
    "hand",
  );
  const eventBaseState: GameState = {
    ...params.state,
    players: {
      ...params.state.players,
      [params.entry.controllerId]: {
        ...player,
        hand: nextHand,
        trash: nextTrash,
      },
    },
  };
  const events: EngineEvent[] = [];
  for (const card of movedCards) {
    appendEvent(
      eventBaseState,
      events,
      "cardMoved",
      {
        instanceId: card.instanceId,
        cardId: card.cardId,
        from: card.zone,
        to: nextHand.find(
          (candidate) => candidate.instanceId === card.instanceId,
        )?.zone,
        reason: "effect",
      },
      { type: "public" },
    );
    const event = events[events.length - 1];
    if (event !== undefined) {
      event.causedBy = {
        type: "effect",
        queueEntryId: params.entry.id,
        effectId: params.entry.effectBlockId,
      };
    }
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
          succeeded: true,
          changedState: movedCards.length > 0,
          selectedCards: [...selected],
        },
      },
    },
    ok: true,
    state: {
      ...eventBaseState,
      eventJournal: [...params.state.eventJournal, ...events],
    },
  };
};

const applyBounceToOwnerHandSequenceSegment = (params: {
  effect: BounceEffect;
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
}):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | { ok: false } => {
  const selected =
    params.ledgers.savedReferences[params.effect.target.binding.saveResultAs];
  if (selected?.kind !== "selectedTargets") {
    return { ok: false };
  }
  let nextState = params.state;
  const events: EngineEvent[] = [];
  const movedTargets: CardRef[] = [];
  for (const selectedTarget of selected.targets) {
    const target = selectedTarget.object;
    const player = nextState.players[target.playerId];
    if (player === undefined || target.zone?.zone !== "characterArea") {
      continue;
    }
    const card = player.characters.find(
      (candidate) => candidate.instanceId === target.instanceId,
    );
    if (card === undefined) {
      continue;
    }
    const attachedDonIds = new Set(card.attachedDon);
    const nextCharacters = reindexZoneCards(
      player.characters.filter(
        (candidate) => candidate.instanceId !== card.instanceId,
      ),
      "characterArea",
      target.playerId,
      "character",
    );
    const nextHand = reindexZoneCards(
      [...player.hand, { ...card, attachedDon: [] }],
      "hand",
      target.playerId,
      "hand",
    );
    const nextCostArea = player.costArea.map((don) =>
      attachedDonIds.has(don.instanceId)
        ? { ...don, state: "rested" as const }
        : don,
    );
    const eventBaseState: GameState = {
      ...nextState,
      players: {
        ...nextState.players,
        [target.playerId]: {
          ...player,
          characters: nextCharacters,
          costArea: nextCostArea,
          hand: nextHand,
        },
      },
    };
    const movedCard = nextHand.find(
      (candidate) => candidate.instanceId === card.instanceId,
    );
    appendEvent(
      eventBaseState,
      events,
      "cardMoved",
      {
        instanceId: card.instanceId,
        cardId: card.cardId,
        from: card.zone,
        to: movedCard?.zone,
        reason: "effect",
      },
      { type: "public" },
    );
    const event = events[events.length - 1];
    if (event !== undefined) {
      event.causedBy = {
        type: "effect",
        queueEntryId: params.entry.id,
        effectId: params.entry.effectBlockId,
      };
    }
    nextState = eventBaseState;
    movedTargets.push(target);
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
          succeeded: true,
          changedState: movedTargets.length > 0,
          selectedTargets: movedTargets,
        },
      },
    },
    ok: true,
    state: {
      ...nextState,
      seq:
        movedTargets.length === 0
          ? nextState.seq
          : toStateSeq(nextState.seq + 1),
      eventJournal: [...params.state.eventJournal, ...events],
    },
  };
};

const applyAllTargetTrashSequenceSegment = (params: {
  effect: TrashEffect;
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
  filter: CardFilter["power"],
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

const withoutPowerFilter = (filter: CardFilter): CardFilter => {
  const { power, ...rest } = filter;
  void power;
  return rest;
};

const cardMatchesAllKoFilter = (
  state: GameState,
  playerId: CardRef["playerId"],
  card: CardInstance,
  filter: CardFilter | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
  }
  if (
    !cardMatchesHandSelectionFilter(
      state,
      playerId,
      card,
      withoutPowerFilter(filter),
    )
  ) {
    return false;
  }
  if (filter.power === undefined) {
    return true;
  }
  const view = computeView(state, {
    supportStatusPolicy: "ignore",
    unsupportedCombatKeywordPolicy: "ignore",
  });
  return numericFilterMatches(
    view.cards[card.instanceId]?.currentPower,
    filter.power,
  );
};

const applyAllTargetKoSequenceSegment = (params: {
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
  const selectedTargets = player.characters
    .filter((card) =>
      cardMatchesAllKoFilter(
        params.state,
        targetPlayerId,
        card,
        params.effect.target.filter,
      ),
    )
    .map((card) => toCardRef(card, targetPlayerId));
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
  if (
    resolvedKo.errors !== undefined ||
    resolvedKo.state.pendingDecision?.type === "chooseReplacement"
  ) {
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

export type SequenceFrameDecisionResult =
  | {
      events: EngineEvent[];
      ok: true;
      state: GameState;
    }
  | { ok: false }
  | undefined;

export type SequenceFrameResumeResult =
  | {
      events: EngineEvent[];
      ok: true;
      state: GameState;
    }
  | {
      error: EngineError;
      ok: false;
    }
  | undefined;

type SequenceFrameRunResult =
  | {
      events: EngineEvent[];
      kind: "completed";
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | {
      events: EngineEvent[];
      kind: "paused";
      ok: true;
      state: GameState;
    }
  | { ok: false };

type SequenceRuntimeFailureReason =
  | "missing-frame"
  | "missing-queue-entry"
  | "missing-effect-block"
  | "unsupported-sequence-shape"
  | "segment-execution-failed";

interface SequenceRuntimeErrorDetails {
  reason: SequenceRuntimeFailureReason;
}

const emptySegmentResult = (): SequenceSegmentResult => ({
  attempted: false,
  succeeded: false,
  changedState: false,
  selectedCards: [],
  selectedTargets: [],
  paidCost: false,
  playerDeclined: false,
});

const sequenceRuntimeError = (
  effectId: EffectQueueEntry["effectBlockId"],
  reason: SequenceRuntimeFailureReason,
): EngineError => ({
  type: "effectRuntimeError",
  effectId,
  details: { reason } satisfies SequenceRuntimeErrorDetails,
});

const segmentKey = (
  _segment: SequenceEffect["effects"][number],
  index: number,
): string => String(index);

const rootSequenceEffectPath = ["effect", "sequence"] as const;

const isRootSequencePath = (effectPath: readonly string[]): boolean =>
  effectPath.length === rootSequenceEffectPath.length &&
  effectPath.every((part, index) => part === rootSequenceEffectPath[index]);

const segmentKeyForPath = (
  effectPath: readonly string[],
  segment: SequenceEffect["effects"][number],
  index: number,
): string =>
  isRootSequencePath(effectPath)
    ? segmentKey(segment, index)
    : `${effectPath.join(".")}:${segmentKey(segment, index)}`;

const conditionalThenSequencePath = (
  effectPath: readonly string[],
  index: number,
): string[] => [...effectPath, String(index), "then", "sequence"];

const conditionalThenSingleEffectPath = (
  effectPath: readonly string[],
  index: number,
): string[] => [...effectPath, String(index), "then", "single"];

const toSingleEffectSequence = (effect: Effect): SequenceEffect => ({
  type: "sequence",
  effects: [{ connector: "always", effect }],
});

const resolveSequenceForPath = (
  effect: SequenceEffect,
  effectPath: readonly string[],
): SequenceEffect | undefined => {
  if (!isRootSequencePath(effectPath)) {
    if (
      effectPath.length < rootSequenceEffectPath.length ||
      !isRootSequencePath(effectPath.slice(0, rootSequenceEffectPath.length))
    ) {
      return undefined;
    }
  }
  let current: SequenceEffect = effect;
  let index = rootSequenceEffectPath.length;
  while (index < effectPath.length) {
    const segmentIndex = Number(effectPath[index]);
    const thenToken = effectPath[index + 1];
    const sequenceToken = effectPath[index + 2];
    if (!Number.isSafeInteger(segmentIndex) || thenToken !== "then") {
      return undefined;
    }
    const segment = current.effects[segmentIndex];
    if (segment === undefined || segment.effect.type !== "conditional") {
      return undefined;
    }
    if (sequenceToken === "sequence") {
      if (segment.effect.then.type !== "sequence") {
        return undefined;
      }
      current = segment.effect.then;
    } else if (sequenceToken === "single") {
      if (segment.effect.then.type === "sequence") {
        return undefined;
      }
      current = toSingleEffectSequence(segment.effect.then);
    } else {
      return undefined;
    }
    index += 3;
  }
  return current;
};

const findFrameQueueEntry = (
  state: GameState,
  frame: EffectExecutionFrame,
): EffectQueueEntry | undefined =>
  state.effectQueue.find(
    (entry) =>
      entry.id === frame.queueEntryId &&
      entry.effectBlockId === frame.effectBlockId,
  );

const findSequenceEffectBlock = (
  state: GameState,
  entry: EffectQueueEntry,
): EffectDefinition["effects"][number] | undefined => {
  const card = state.cardManifest.cards[entry.source.cardId];
  const definitionId = card?.support.effectDefinitionId;
  if (
    card === undefined ||
    card.support.status !== "implemented-dsl" ||
    definitionId === undefined
  ) {
    return undefined;
  }
  return state.cardManifest.effectDefinitions?.[definitionId]?.effects.find(
    (effect) => effect.id === entry.effectBlockId,
  );
};

const resumeSequenceFrameFromLedgers = (params: {
  createTrashDecision: CreateTrashFromHandSequenceDecision;
  effectBlock: SupportedSequenceBlock;
  entry: EffectQueueEntry;
  finalizeCompleted: boolean;
  frame: EffectExecutionFrame;
  ledgers: SegmentLedgers;
  state: GameState;
}): SequenceFrameResumeResult => {
  const continued = continueNoDecisionSegments(
    params.state,
    params.entry,
    resolveSequenceForPath(params.effectBlock.effect, params.frame.effectPath),
    params.frame.nextSegmentIndex,
    params.ledgers,
    params.createTrashDecision,
    false,
    params.frame.effectPath,
  );
  if (!continued.ok) {
    return {
      error: sequenceRuntimeError(
        params.entry.effectBlockId,
        "segment-execution-failed",
      ),
      ok: false,
    };
  }
  if (continued.kind === "paused") {
    return {
      events: continued.events,
      ok: true,
      state: continued.state,
    };
  }

  const events = [...continued.events];
  let completedState = removeFrame(continued.state, params.frame);
  if (params.finalizeCompleted) {
    completedState = appendEffectResolvedForCompletedSequence(
      completedState,
      params.entry,
      events,
    );
  }
  if (
    completedState.pendingDecision === undefined &&
    params.frame.resumePendingDecision !== undefined
  ) {
    completedState = {
      ...completedState,
      pendingDecision: params.frame.resumePendingDecision,
    };
  }
  return {
    events,
    ok: true,
    state: completedState,
  };
};

const continueNoDecisionSegments = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: SequenceEffect | undefined,
  startIndex: number,
  ledgers: SegmentLedgers,
  createTrashDecision: CreateTrashFromHandSequenceDecision,
  incrementStateSeqForDraw: boolean,
  effectPath: readonly string[] = [...rootSequenceEffectPath],
): SequenceFrameRunResult => {
  if (effect === undefined) {
    return { ok: false };
  }
  const ledgerKey = (
    segment: SequenceEffect["effects"][number],
    index: number,
  ): string => segmentKeyForPath(effectPath, segment, index);
  let nextState = state;
  let nextLedgers = ledgers;
  const events: EngineEvent[] = [];
  for (let index = startIndex; index < effect.effects.length; index += 1) {
    const segment = effect.effects[index];
    if (segment === undefined) {
      return { ok: false };
    }
    if (
      !shouldAttemptSegment(
        nextLedgers.segmentResults,
        effect,
        index,
        ledgerKey,
      )
    ) {
      nextLedgers = {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [ledgerKey(segment, index)]: emptySegmentResult(),
        },
      };
      continue;
    }
    if (segment.optional === true) {
      const partialResult: SequenceSegmentResult = {
        ...emptySegmentResult(),
        attempted: true,
      };
      const pausedLedgers: SegmentLedgers = {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [ledgerKey(segment, index)]: partialResult,
        },
      };
      const optionalDecision =
        createOptionalActivationDecisionForSequenceSegment(
          nextState,
          entry,
          index,
        );
      const decision = optionalDecision.state.pendingDecision;
      if (decision === undefined) {
        return { ok: false };
      }
      const frame = frameForPausedSequenceDecision({
        decision,
        entry,
        effectPath: [...effectPath],
        index,
        savedReferences: pausedLedgers.savedReferences,
        segmentResults: pausedLedgers.segmentResults,
        state: optionalDecision.state,
      });
      return {
        events: [...events, ...optionalDecision.events],
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(
          optionalDecision.state,
          entry,
          frame,
        ),
      };
    }
    if (segment.effect.type === "draw") {
      const drawn = applyDrawSegment(
        nextState,
        entry,
        segment as SupportedSequenceSegment & { effect: DrawEffect },
        index,
        nextLedgers,
        { incrementStateSeq: incrementStateSeqForDraw },
        emptySegmentResult,
        ledgerKey,
      );
      if (!drawn.ok) {
        return { ok: false };
      }
      nextState = drawn.state;
      nextLedgers = drawn.ledgers;
      events.push(...drawn.events);
      continue;
    }
    if (segment.effect.type === "moveCards") {
      if (
        segment.effect.min !== undefined &&
        segment.effect.min < segment.effect.count
      ) {
        const quantityDecision = createChooseQuantityDecisionForSequenceSegment(
          nextState,
          entry,
          index,
          segment.effect.count,
        );
        const decision = quantityDecision.state.pendingDecision;
        if (decision === undefined) {
          return { ok: false };
        }
        const frame = frameForPausedSequenceDecision({
          decision,
          entry,
          effectPath: [...effectPath],
          index,
          savedReferences: nextLedgers.savedReferences,
          segmentResults: nextLedgers.segmentResults,
          state: quantityDecision.state,
        });
        return {
          events: [...events, ...quantityDecision.events],
          kind: "paused",
          ok: true,
          state: stateWithPausedSequenceFrame(
            quantityDecision.state,
            entry,
            frame,
          ),
        };
      }
      const moved = applyMoveCardsSegment(
        nextState,
        entry,
        segment as SupportedSequenceSegment & { effect: MoveCardsEffect },
        index,
        nextLedgers,
        emptySegmentResult,
        ledgerKey,
      );
      if (!moved.ok) {
        return { ok: false };
      }
      nextState = moved.state;
      nextLedgers = moved.ledgers;
      events.push(...moved.events);
      continue;
    }
    if (segment.effect.type === "drawUpTo") {
      const quantityDecision = createChooseQuantityDecisionForSequenceSegment(
        nextState,
        entry,
        index,
        segment.effect.count,
      );
      const decision = quantityDecision.state.pendingDecision;
      if (decision === undefined) {
        return { ok: false };
      }
      const frame = frameForPausedSequenceDecision({
        decision,
        entry,
        effectPath: [...effectPath],
        index,
        savedReferences: nextLedgers.savedReferences,
        segmentResults: nextLedgers.segmentResults,
        state: quantityDecision.state,
      });
      return {
        events: [...events, ...quantityDecision.events],
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(
          quantityDecision.state,
          entry,
          frame,
        ),
      };
    }
    if (segment.effect.type === "search") {
      const search = applySearchRevealSequenceSegment({
        emptySegmentResult,
        entry,
        events,
        index,
        nextLedgers,
        nextState,
        segment: segment as SupportedSequenceSegment & {
          effect: Extract<
            SupportedSequenceSegment["effect"],
            { type: "search" }
          >;
        },
        segmentKey: ledgerKey,
      });
      if (!search.ok || search.kind === "paused") {
        return search;
      }
      nextState = search.state;
      nextLedgers = search.ledgers;
      continue;
    }
    if (segment.effect.type === "revealTop") {
      const revealed = applyRevealTopSequenceSegment({
        effect: segment.effect,
        emptySegmentResult,
        entry,
        index,
        ledgers: nextLedgers,
        segment,
        segmentKey: ledgerKey,
        state: nextState,
      });
      nextState = revealed.state;
      nextLedgers = revealed.ledgers;
      events.push(...revealed.events);
      continue;
    }
    if (segment.effect.type === "placeTopDeckCards") {
      const partialResult: SequenceSegmentResult = {
        ...emptySegmentResult(),
        attempted: true,
      };
      const pausedLedgers: SegmentLedgers = {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [ledgerKey(segment, index)]: partialResult,
        },
      };
      const decisionResult = createTopDeckPlacementDecision(
        nextState,
        entry,
        segment.effect,
        { decisionIdSuffix: `segment:${String(index)}` },
      );
      if (decisionResult.errors !== undefined) {
        return { ok: false };
      }
      const decision = decisionResult.state.pendingDecision;
      if (decision === undefined) {
        return { ok: false };
      }
      const frame = frameForPausedSequenceDecision({
        decision,
        entry,
        effectPath: [...effectPath],
        index,
        savedReferences: pausedLedgers.savedReferences,
        segmentResults: pausedLedgers.segmentResults,
        state: decisionResult.state,
      });
      return {
        events: [...events, ...decisionResult.events],
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(decisionResult.state, entry, frame),
      };
    }
    const partialResult: SequenceSegmentResult = {
      ...emptySegmentResult(),
      attempted: true,
    };
    const pausedLedgers: SegmentLedgers = {
      ...nextLedgers,
      segmentResults: {
        ...nextLedgers.segmentResults,
        [ledgerKey(segment, index)]: partialResult,
      },
    };
    if (segment.effect.type === "payCost") {
      const paySegment = segment as SupportedSequenceSegment & {
        effect: PayCostEffect;
      };
      const cost = paySegment.effect.cost;
      const paymentOptions = getSequenceOptionalPayCostOptions(
        nextState,
        entry,
        cost,
      );
      if (paymentOptions.length === 0) {
        nextLedgers = {
          ...nextLedgers,
          segmentResults: {
            ...nextLedgers.segmentResults,
            [ledgerKey(segment, index)]: {
              ...emptySegmentResult(),
              attempted: true,
            },
          },
        };
        continue;
      }
      const decisionResult = createPayCostDecisionForSequenceSegment(
        nextState,
        entry,
        cost,
        paymentOptions,
        index,
      );
      const decision = decisionResult.state.pendingDecision;
      if (decision === undefined) {
        return { ok: false };
      }
      const frame = frameForPausedSequenceDecision({
        decision,
        entry,
        effectPath: [...effectPath],
        index,
        savedReferences: pausedLedgers.savedReferences,
        segmentResults: pausedLedgers.segmentResults,
        state: decisionResult.state,
      });
      return {
        events: [...events, ...decisionResult.events],
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(decisionResult.state, entry, frame),
      };
    }
    if (segment.effect.type === "selectCards") {
      const decisionResult = createSupportedHandSelectionChoiceDecision(
        nextState,
        entry,
        segment.effect,
        index,
      );
      if (!decisionResult.ok) {
        nextLedgers = {
          ...nextLedgers,
          segmentResults: {
            ...nextLedgers.segmentResults,
            [ledgerKey(segment, index)]: {
              ...emptySegmentResult(),
              attempted: true,
            },
          },
        };
        continue;
      }
      const decision = decisionResult.state.pendingDecision;
      if (decision === undefined) {
        return { ok: false };
      }
      const frame = frameForPausedSequenceDecision({
        decision,
        entry,
        effectPath: [...effectPath],
        index,
        savedReferences: pausedLedgers.savedReferences,
        segmentResults: pausedLedgers.segmentResults,
        state: decisionResult.state,
      });
      return {
        events: [...events, ...decisionResult.events],
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(decisionResult.state, entry, frame),
      };
    }
    if (segment.effect.type === "selectFromSet") {
      const decisionResult = createSelectFromSetDecision({
        effect: segment.effect,
        entry,
        index,
        ledgers: nextLedgers,
        state: nextState,
      });
      if (!decisionResult.ok) {
        return { ok: false };
      }
      const decision = decisionResult.state.pendingDecision;
      if (decision === undefined) {
        return { ok: false };
      }
      const frame = frameForPausedSequenceDecision({
        decision,
        entry,
        effectPath: [...effectPath],
        index,
        savedReferences: pausedLedgers.savedReferences,
        segmentResults: pausedLedgers.segmentResults,
        state: decisionResult.state,
      });
      return {
        events: [...events, ...decisionResult.events],
        kind: "paused",
        ok: true,
        state: stateWithPausedSequenceFrame(decisionResult.state, entry, frame),
      };
    }
    if (segment.effect.type === "selectTargets") {
      const selectTargets = applySelectTargetsSequenceSegment({
        emptySegmentResult,
        entry,
        effectPath,
        events,
        index,
        nextLedgers,
        nextState,
        segmentKey,
        segment: segment as SupportedSequenceSegment & {
          effect: Extract<SequenceSegmentEffect, { type: "selectTargets" }>;
        },
      });
      if (!selectTargets.ok || selectTargets.kind === "paused") {
        return selectTargets;
      }
      nextState = selectTargets.state;
      nextLedgers = selectTargets.ledgers;
      continue;
    }
    if (segment.effect.type === "playSelected") {
      const played = applyPlaySelectedSequenceSegment({
        emptySegmentResult,
        entry,
        events,
        index,
        ledgers: nextLedgers,
        segment: segment as SupportedSequenceSegment & {
          effect: Extract<SequenceSegmentEffect, { type: "playSelected" }>;
        },
        segmentKey: ledgerKey,
        state: nextState,
      });
      if (played.kind === "paused") {
        return played;
      }
      nextState = played.state;
      nextLedgers = played.ledgers;
      continue;
    }
    if (segment.effect.type === "playSource") {
      const playSource = segment.effect;
      if (
        playSource.source.type !== "triggerCard" ||
        playSource.ignoreCost !== true
      ) {
        return { ok: false };
      }
      const played = applyRuntimePlaySource({
        state: nextState,
        entry,
        enterRested: playSource.enterRested === true,
        ignoreCost: true,
      });
      if (played.errors !== undefined || played.state.pendingDecision) {
        return { ok: false };
      }
      nextState = played.state;
      nextLedgers = {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [ledgerKey(segment, index)]: {
            ...emptySegmentResult(),
            attempted: true,
            succeeded: true,
            changedState: true,
            selectedCards: [entry.source],
          },
        },
      };
      events.push(...played.events);
      continue;
    }
    if (segment.effect.type === "moveSelected") {
      const moved = applyTrashToHandMoveSelectedSegment({
        effect: segment.effect,
        emptySegmentResult,
        entry,
        index,
        ledgers: nextLedgers,
        segment,
        segmentKey: ledgerKey,
        state: nextState,
      });
      if (!moved.ok) {
        return { ok: false };
      }
      nextState = moved.state;
      nextLedgers = moved.ledgers;
      events.push(...moved.events);
      continue;
    }
    if (
      segment.effect.type === "bounce" &&
      segment.effect.destination === "hand" &&
      segment.effect.target.type === "savedFieldObject"
    ) {
      const bounced = applyBounceToOwnerHandSequenceSegment({
        effect: segment.effect as BounceEffect,
        emptySegmentResult,
        entry,
        index,
        ledgers: nextLedgers,
        segment,
        segmentKey: ledgerKey,
        state: nextState,
      });
      if (!bounced.ok) {
        return { ok: false };
      }
      nextState = bounced.state;
      nextLedgers = bounced.ledgers;
      events.push(...bounced.events);
      continue;
    }
    if (segment.effect.type === "attachSelectedDon") {
      const attached = applyAttachSelectedDonSequenceSegment({
        effect: segment.effect,
        emptySegmentResult,
        entry,
        index,
        ledgers: nextLedgers,
        segment,
        segmentKey: ledgerKey,
        state: nextState,
      });
      if (!attached.ok) {
        return { ok: false };
      }
      nextState = attached.state;
      nextLedgers = attached.ledgers;
      events.push(...attached.events);
      continue;
    }
    if (segment.effect.type === "ko") {
      if (segment.effect.target.type === "all") {
        const resolvedKo = applyAllTargetKoSequenceSegment({
          effect: segment.effect as AllTargetKoEffect,
          emptySegmentResult,
          entry,
          index,
          ledgers: nextLedgers,
          segment,
          segmentKey: ledgerKey,
          state: nextState,
        });
        nextState = resolvedKo.state;
        nextLedgers = resolvedKo.ledgers;
        events.push(...resolvedKo.events);
        continue;
      }
      const resolvedKo = applySavedFieldObjectKoSequenceSegment({
        emptySegmentResult,
        entry,
        index,
        ledgers: nextLedgers,
        segment: segment as SupportedSequenceSegment & {
          effect: Extract<SequenceSegmentEffect, { type: "ko" }>;
        },
        segmentKey: ledgerKey,
        state: nextState,
      });
      nextState = resolvedKo.state;
      nextLedgers = resolvedKo.ledgers;
      events.push(...resolvedKo.events);
      continue;
    }
    if (
      segment.effect.type === "trash" &&
      segment.effect.target.type === "all"
    ) {
      const trashed = applyAllTargetTrashSequenceSegment({
        emptySegmentResult,
        entry,
        index,
        ledgers: nextLedgers,
        segment,
        segmentKey: ledgerKey,
        effect: segment.effect as TrashEffect,
        state: nextState,
      });
      nextState = trashed.state;
      nextLedgers = trashed.ledgers;
      events.push(...trashed.events);
      continue;
    }
    if (
      isContinuousResolvedEffect(segment.effect) &&
      !hasSavedFieldObjectContinuousTarget(segment.effect)
    ) {
      const request = continuousChooseTargetRequest(segment.effect);
      if (request !== undefined) {
        const candidates = resolvePublicTargetCandidatesForRequest(
          nextState,
          request,
          {
            sourceControllerId: entry.controllerId,
          },
        );
        const chooserId = resolvePlayerId(nextState, entry, request.chooser);
        if (!candidates.ok || chooserId === undefined) {
          return { ok: false };
        }
        const decision: SelectTargetsDecision = {
          id: toDecisionId(
            `decision:selectTargets:sequence:${String(entry.id)}:${String(index)}`,
          ),
          type: "selectTargets",
          playerId: chooserId,
          prompt: "Select targets.",
          causedBy: {
            type: "effect",
            queueEntryId: entry.id,
            effectId: entry.effectBlockId,
          },
          visibility: { type: "public" },
          request,
          candidates: candidates.candidates,
        };
        const decisionEvents: EngineEvent[] = [];
        appendEvent(
          nextState,
          decisionEvents,
          "decisionCreated",
          {
            decisionId: decision.id,
            decisionType: decision.type,
            playerId: decision.playerId,
          },
          { type: "public" },
        );
        const created = decisionEvents[0];
        if (created !== undefined) {
          created.causedBy = decision.causedBy;
        }
        const decisionState: GameState = {
          ...nextState,
          seq: toStateSeq(nextState.seq + 1),
          pendingDecision: decision,
          eventJournal: [...nextState.eventJournal, ...decisionEvents],
        };
        const frame = frameForPausedSequenceDecision({
          decision,
          entry,
          effectPath: [...effectPath],
          index,
          savedReferences: pausedLedgers.savedReferences,
          segmentResults: pausedLedgers.segmentResults,
          state: decisionState,
        });
        return {
          events: [...events, ...decisionEvents],
          kind: "paused",
          ok: true,
          state: stateWithPausedSequenceFrame(decisionState, entry, frame),
        };
      }
      const records = createContinuousRecordsForResolvedEffect(
        nextState,
        entry,
        segment.effect,
        undefined,
        { savedReferences: nextLedgers.savedReferences },
      );
      if (records === null) {
        return { ok: false };
      }
      nextState =
        records.length === 0
          ? nextState
          : {
              ...nextState,
              continuousEffects: [...nextState.continuousEffects, ...records],
            };
      nextLedgers = {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [ledgerKey(segment, index)]: {
            ...emptySegmentResult(),
            attempted: true,
            succeeded: true,
            changedState: records.length > 0,
          },
        },
      };
      continue;
    }
    if (segment.effect.type === "rest") {
      const rested = applySavedFieldObjectRestSequenceSegment({
        emptySegmentResult,
        entry,
        index,
        ledgers: nextLedgers,
        segment: segment as SupportedSequenceSegment & {
          effect: Extract<SequenceSegmentEffect, { type: "rest" }>;
        },
        segmentKey: ledgerKey,
        state: nextState,
      });
      nextState = rested.state;
      nextLedgers = rested.ledgers;
      continue;
    }
    if (segment.effect.type === "activate") {
      const activated = applySavedFieldObjectActivateSequenceSegment({
        emptySegmentResult,
        entry,
        index,
        ledgers: nextLedgers,
        segment: segment as SupportedSequenceSegment & {
          effect: Extract<SequenceSegmentEffect, { type: "activate" }>;
        },
        segmentKey: ledgerKey,
        state: nextState,
      });
      nextState = activated.state;
      nextLedgers = activated.ledgers;
      continue;
    }
    if (
      segment.effect.type === "cannotBecomeActive" ||
      segment.effect.type === "cannotAttack" ||
      segment.effect.type === "cannotBlock" ||
      segment.effect.type === "invalidateEffects"
    ) {
      const restricted = applySavedFieldObjectRestrictionSequenceSegment({
        emptySegmentResult,
        entry,
        index,
        ledgers: nextLedgers,
        segment: segment as SupportedSequenceSegment & {
          effect: Extract<
            SequenceSegmentEffect,
            {
              type:
                | "cannotBecomeActive"
                | "cannotAttack"
                | "cannotBlock"
                | "invalidateEffects";
            }
          >;
        },
        segmentKey: ledgerKey,
        state: nextState,
      });
      nextState = restricted.state;
      nextLedgers = restricted.ledgers;
      continue;
    }
    if (segment.effect.type === "conditional") {
      const condition = evaluateQueuedEffectCondition(
        nextState,
        entry,
        segment.effect.if,
      );
      if (!condition.supported) {
        return { ok: false };
      }
      if (!condition.passed) {
        nextLedgers = {
          ...nextLedgers,
          segmentResults: {
            ...nextLedgers.segmentResults,
            [ledgerKey(segment, index)]: {
              ...emptySegmentResult(),
              attempted: true,
            },
          },
        };
        continue;
      }
      let changedState = false;
      if (
        segment.effect.then.type === "sequence" ||
        !isContinuousResolvedEffect(segment.effect.then)
      ) {
        const thenSequence =
          segment.effect.then.type === "sequence"
            ? segment.effect.then
            : toSingleEffectSequence(segment.effect.then);
        const thenPath =
          segment.effect.then.type === "sequence"
            ? conditionalThenSequencePath(effectPath, index)
            : conditionalThenSingleEffectPath(effectPath, index);
        const nested = continueNoDecisionSegments(
          nextState,
          entry,
          thenSequence,
          0,
          nextLedgers,
          createTrashDecision,
          incrementStateSeqForDraw,
          thenPath,
        );
        if (!nested.ok) {
          return { ok: false };
        }
        if (nested.kind === "paused") {
          return {
            events: [...events, ...nested.events],
            kind: "paused",
            ok: true,
            state: nested.state,
          };
        }
        nextState = nested.state;
        nextLedgers = nested.ledgers;
        events.push(...nested.events);
        changedState = nested.events.length > 0;
      } else {
        const request = continuousChooseTargetRequest(segment.effect.then);
        if (request !== undefined) {
          const candidates = resolvePublicTargetCandidatesForRequest(
            nextState,
            request,
            {
              sourceControllerId: entry.controllerId,
            },
          );
          const chooserId = resolvePlayerId(nextState, entry, request.chooser);
          if (!candidates.ok || chooserId === undefined) {
            return { ok: false };
          }
          const decision: SelectTargetsDecision = {
            id: toDecisionId(
              `decision:selectTargets:sequence:${String(entry.id)}:${String(index)}`,
            ),
            type: "selectTargets",
            playerId: chooserId,
            prompt: "Select targets.",
            causedBy: {
              type: "effect",
              queueEntryId: entry.id,
              effectId: entry.effectBlockId,
            },
            visibility: { type: "public" },
            request,
            candidates: candidates.candidates,
          };
          const decisionEvents: EngineEvent[] = [];
          appendEvent(
            nextState,
            decisionEvents,
            "decisionCreated",
            {
              decisionId: decision.id,
              decisionType: decision.type,
              playerId: decision.playerId,
            },
            { type: "public" },
          );
          const created = decisionEvents[0];
          if (created !== undefined) {
            created.causedBy = decision.causedBy;
          }
          const decisionState: GameState = {
            ...nextState,
            seq: toStateSeq(nextState.seq + 1),
            pendingDecision: decision,
            eventJournal: [...nextState.eventJournal, ...decisionEvents],
          };
          const frame = frameForPausedSequenceDecision({
            decision,
            entry,
            effectPath: [...effectPath],
            index,
            savedReferences: pausedLedgers.savedReferences,
            segmentResults: pausedLedgers.segmentResults,
            state: decisionState,
          });
          return {
            events: [...events, ...decisionEvents],
            kind: "paused",
            ok: true,
            state: stateWithPausedSequenceFrame(decisionState, entry, frame),
          };
        }
        const records = createContinuousRecordsForResolvedEffect(
          nextState,
          entry,
          segment.effect.then,
          undefined,
          { savedReferences: nextLedgers.savedReferences },
        );
        if (records === null) {
          return { ok: false };
        }
        nextState =
          records.length === 0
            ? nextState
            : {
                ...nextState,
                continuousEffects: [...nextState.continuousEffects, ...records],
              };
        changedState = records.length > 0;
      }
      nextLedgers = {
        ...nextLedgers,
        segmentResults: {
          ...nextLedgers.segmentResults,
          [ledgerKey(segment, index)]: {
            ...emptySegmentResult(),
            attempted: true,
            succeeded: true,
            changedState,
          },
        },
      };
      continue;
    }
    const decisionResult = createTrashDecision(
      nextState,
      entry,
      segment.effect as TrashFromHandEffect,
    );
    if (!decisionResult.ok) {
      return { ok: false };
    }
    const decision = decisionResult.state.pendingDecision;
    if (decision === undefined) {
      return { ok: false };
    }
    const frame = frameForPausedSequenceDecision({
      decision,
      entry,
      effectPath: [...effectPath],
      index,
      savedReferences: pausedLedgers.savedReferences,
      segmentResults: pausedLedgers.segmentResults,
      state: decisionResult.state,
    });
    return {
      events: [...events, ...decisionResult.events],
      kind: "paused",
      ok: true,
      state: stateWithPausedSequenceFrame(decisionResult.state, entry, frame),
    };
  }
  return {
    events,
    kind: "completed",
    ledgers: nextLedgers,
    ok: true,
    state: nextState,
  };
};

export const createSupportedSequenceFrameDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  effectBlock: EffectDefinition["effects"][number] | undefined,
  createTrashDecision: CreateTrashFromHandSequenceDecision,
): SequenceFrameDecisionResult => {
  if (effectBlock?.effect.type !== "sequence") {
    return undefined;
  }
  const supportedBlock = toSupportedSequenceBlock(entry, effectBlock);
  if (supportedBlock === undefined) {
    return { ok: false };
  }

  let nextState = state;
  if (effectBlock.oncePerTurn === true) {
    const oncePerTurnKey = toOncePerTurnKey({
      cardInstanceId: entry.source.instanceId,
      effectId: entry.effectBlockId,
      turnNumber: nextState.turn.globalTurn,
    });
    if (isOncePerTurnUsed(nextState, oncePerTurnKey)) {
      return { ok: false };
    }
    nextState = consumeOncePerTurn(nextState, oncePerTurnKey);
  }

  const resolvingEntry = resolvingEntryFor(entry);
  nextState = replaceQueueEntry(nextState, resolvingEntry);
  const ledgers: SegmentLedgers = { savedReferences: {}, segmentResults: {} };

  const run = continueNoDecisionSegments(
    nextState,
    resolvingEntry,
    supportedBlock.effect,
    0,
    ledgers,
    createTrashDecision,
    true,
  );
  if (!run.ok) {
    return { ok: false };
  }
  if (run.kind === "completed") {
    return {
      events: run.events,
      ok: true,
      state: appendEffectResolvedForCompletedSequence(
        run.state,
        resolvingEntry,
        run.events,
      ),
    };
  }
  return { events: run.events, ok: true, state: run.state };
};

export const continueSupportedSequenceFrameFromSegment = (params: {
  completedSegmentResults: EffectExecutionFrame["segmentResults"];
  effectBlock: EffectDefinition["effects"][number];
  entry: EffectQueueEntry;
  resumePendingDecision?: NonNullable<GameState["pendingDecision"]>;
  startIndex: number;
  state: GameState;
}): SequenceFrameResumeResult => {
  const supportedBlock = toSupportedSequenceBlock(
    params.entry,
    params.effectBlock,
  );
  if (supportedBlock === undefined) {
    return {
      error: sequenceRuntimeError(
        params.entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }
  const stateWithEntry = params.state.effectQueue.some(
    (candidate) => candidate.id === params.entry.id,
  )
    ? params.state
    : {
        ...params.state,
        effectQueue: [...params.state.effectQueue, params.entry],
      };
  const resolvingEntry = resolvingEntryFor(params.entry);
  const run = continueNoDecisionSegments(
    replaceQueueEntry(stateWithEntry, resolvingEntry),
    resolvingEntry,
    supportedBlock.effect,
    params.startIndex,
    { savedReferences: {}, segmentResults: params.completedSegmentResults },
    createUnsupportedTrashDecision,
    false,
  );
  if (!run.ok) {
    return {
      error: sequenceRuntimeError(
        params.entry.effectBlockId,
        "segment-execution-failed",
      ),
      ok: false,
    };
  }
  if (run.kind === "paused") {
    const pendingDecision = run.state.pendingDecision;
    const entry = resolvingEntry;
    const resumePendingDecision = params.resumePendingDecision;
    const state =
      pendingDecision === undefined || resumePendingDecision === undefined
        ? run.state
        : {
            ...run.state,
            effectExecutionFrames: run.state.effectExecutionFrames.map(
              (frame) =>
                frame.queueEntryId === entry.id &&
                frame.pendingDecision.decisionId === pendingDecision.id
                  ? {
                      ...frame,
                      resumePendingDecision,
                    }
                  : frame,
            ),
          };
    return { events: run.events, ok: true, state };
  }
  const completed = appendEffectResolvedForCompletedSequence(
    run.state,
    resolvingEntry,
    run.events,
  );
  return {
    events: run.events,
    ok: true,
    state:
      completed.pendingDecision === undefined &&
      params.resumePendingDecision !== undefined
        ? { ...completed, pendingDecision: params.resumePendingDecision }
        : completed,
  };
};

export const resumeSequenceFrameAfterTrashFromHand = (
  state: GameState,
  decision: SelectCardsDecision,
  selectedCards: readonly CardRef[],
): SequenceFrameResumeResult => {
  return resumeSequenceFrameAfterTrashFromHandHelper({
    createUnsupportedTrashDecision,
    decision,
    emptySegmentResult,
    findFrameQueueEntry,
    findSequenceEffectBlock,
    resumeSequenceFrameFromLedgers: (params) =>
      resumeSequenceFrameFromLedgers(
        params as {
          createTrashDecision: CreateTrashFromHandSequenceDecision;
          effectBlock: SupportedSequenceBlock;
          entry: EffectQueueEntry;
          finalizeCompleted: boolean;
          frame: EffectExecutionFrame;
          ledgers: SegmentLedgers;
          state: GameState;
        },
      ),
    segmentKey,
    selectedCards,
    sequenceRuntimeError,
    state,
  });
};

export const resumeSequenceFrameAfterHandSelection = (
  state: GameState,
  decision: SelectCardsDecision,
  selectedCards: readonly CardRef[],
): SequenceFrameResumeResult => {
  return resumeSequenceFrameAfterHandSelectionHelper({
    createUnsupportedTrashDecision,
    decision,
    emptySegmentResult,
    findFrameQueueEntry,
    findSequenceEffectBlock,
    resumeSequenceFrameFromLedgers: (params) =>
      resumeSequenceFrameFromLedgers(
        params as {
          createTrashDecision: CreateTrashFromHandSequenceDecision;
          effectBlock: SupportedSequenceBlock;
          entry: EffectQueueEntry;
          finalizeCompleted: boolean;
          frame: EffectExecutionFrame;
          ledgers: SegmentLedgers;
          state: GameState;
        },
      ),
    segmentKey,
    selectedCards,
    sequenceRuntimeError,
    state,
  });
};

export const resumeSequenceFrameAfterSelectTargets = (
  state: GameState,
  decision: SelectTargetsDecision,
  selectedTargets: readonly CardRef[],
): SequenceFrameResumeResult => {
  return resumeSequenceFrameAfterSelectTargetsHelper({
    createUnsupportedTrashDecision,
    decision,
    emptySegmentResult,
    findFrameQueueEntry,
    findSequenceEffectBlock,
    resumeSequenceFrameFromLedgers: (params) =>
      resumeSequenceFrameFromLedgers(
        params as {
          createTrashDecision: CreateTrashFromHandSequenceDecision;
          effectBlock: SupportedSequenceBlock;
          entry: EffectQueueEntry;
          finalizeCompleted: boolean;
          frame: EffectExecutionFrame;
          ledgers: SegmentLedgers;
          state: GameState;
        },
      ),
    segmentKey,
    selectedTargets,
    sequenceRuntimeError,
    state,
  });
};

export const resumeSequenceFrameAfterSearchReveal = (
  state: GameState,
  decisionId: SelectCardsDecision["id"],
  selectedCards: readonly CardRef[],
  createTrashDecision: CreateTrashFromHandSequenceDecision,
): SequenceFrameResumeResult =>
  resumeSequenceFrameAfterSearchRevealHelper({
    createTrashDecision,
    decisionId,
    emptySegmentResult,
    findFrameQueueEntry,
    findSequenceEffectBlock,
    toSupportedSequenceBlock,
    resumeSequenceFrameFromLedgers: (params) =>
      resumeSequenceFrameFromLedgers(
        params as {
          createTrashDecision: CreateTrashFromHandSequenceDecision;
          effectBlock: SupportedSequenceBlock;
          entry: EffectQueueEntry;
          finalizeCompleted: boolean;
          frame: EffectExecutionFrame;
          ledgers: SegmentLedgers;
          state: GameState;
        },
      ),
    segmentKey,
    selectedCards,
    sequenceRuntimeError,
    state,
  });

export const resumeSequenceFrameAfterTopDeckPlacement = (
  state: GameState,
  decisionId: NonNullable<GameState["pendingDecision"]>["id"],
  createTrashDecision: CreateTrashFromHandSequenceDecision,
): SequenceFrameResumeResult => {
  const frame = findSequenceFrameByDecisionId(state, decisionId);
  if (frame === undefined) {
    return undefined;
  }
  const entry = findFrameQueueEntry(state, frame);
  if (entry === undefined) {
    return {
      error: sequenceRuntimeError(frame.effectBlockId, "missing-queue-entry"),
      ok: false,
    };
  }
  const effectBlock = findSequenceEffectBlock(state, entry);
  const supportedBlock = toSupportedSequenceBlock(entry, effectBlock);
  if (supportedBlock === undefined) {
    return {
      error: sequenceRuntimeError(entry.effectBlockId, "missing-effect-block"),
      ok: false,
    };
  }
  const pausedSegment =
    supportedBlock.effect.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (
    pausedSegment === undefined ||
    pausedSegment.effect.type !== "placeTopDeckCards"
  ) {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }
  return resumeSequenceFrameFromLedgers({
    createTrashDecision,
    effectBlock: supportedBlock,
    entry,
    finalizeCompleted: true,
    frame,
    ledgers: {
      savedReferences: frame.savedReferences,
      segmentResults: {
        ...frame.segmentResults,
        [segmentKey(pausedSegment, frame.pendingDecision.resumeAtSegmentIndex)]:
          {
            ...emptySegmentResult(),
            attempted: true,
            succeeded: true,
            changedState: true,
          },
      },
    },
    state,
  });
};

export const resumeSequenceFrameAfterOptionalActivation = (
  state: GameState,
  decision: ChooseOptionalActivationDecision,
  choice: "activate" | "decline",
  createTrashDecision: CreateTrashFromHandSequenceDecision,
): SequenceFrameResumeResult => {
  const frame = findSequenceFrameByDecisionId(state, decision.id);
  if (frame === undefined) {
    return undefined;
  }
  const entry = findFrameQueueEntry(state, frame);
  if (entry === undefined) {
    return {
      error: sequenceRuntimeError(frame.effectBlockId, "missing-queue-entry"),
      ok: false,
    };
  }
  const effectBlock = findSequenceEffectBlock(state, entry);
  const supportedBlock = toSupportedSequenceBlock(entry, effectBlock);
  if (supportedBlock === undefined) {
    return {
      error: sequenceRuntimeError(entry.effectBlockId, "missing-effect-block"),
      ok: false,
    };
  }
  const pausedSegment =
    supportedBlock.effect.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (
    pausedSegment === undefined ||
    (pausedSegment.effect.type !== "draw" &&
      pausedSegment.effect.type !== "trashFromHand") ||
    pausedSegment.optional !== true
  ) {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }

  let nextState = state;
  let events: EngineEvent[] = [];
  let ledgers: SegmentLedgers;
  if (choice === "activate") {
    if (pausedSegment.effect.type === "draw") {
      const drawn = applyDrawSegment(
        nextState,
        entry,
        pausedSegment as SupportedSequenceSegment & { effect: DrawEffect },
        frame.pendingDecision.resumeAtSegmentIndex,
        {
          savedReferences: frame.savedReferences,
          segmentResults: frame.segmentResults,
        },
        { incrementStateSeq: false },
        emptySegmentResult,
        segmentKey,
      );
      if (!drawn.ok) {
        return {
          error: sequenceRuntimeError(
            entry.effectBlockId,
            "segment-execution-failed",
          ),
          ok: false,
        };
      }
      nextState = drawn.state;
      events = drawn.events;
      ledgers = drawn.ledgers;
    } else {
      const decisionResult = createTrashDecision(
        nextState,
        entry,
        pausedSegment.effect,
      );
      if (!decisionResult.ok) {
        return {
          error: sequenceRuntimeError(
            entry.effectBlockId,
            "segment-execution-failed",
          ),
          ok: false,
        };
      }
      const nextDecision = decisionResult.state.pendingDecision;
      if (nextDecision === undefined) {
        return {
          error: sequenceRuntimeError(
            entry.effectBlockId,
            "segment-execution-failed",
          ),
          ok: false,
        };
      }
      const nextFrame = frameForPausedSequenceDecision({
        decision: nextDecision,
        entry,
        index: frame.pendingDecision.resumeAtSegmentIndex,
        savedReferences: frame.savedReferences,
        segmentResults: frame.segmentResults,
        state: decisionResult.state,
      });
      return {
        events: decisionResult.events,
        ok: true,
        state: stateWithPausedSequenceFrame(
          decisionResult.state,
          entry,
          nextFrame,
        ),
      };
    }
  } else {
    const declinedResult: SequenceSegmentResult = {
      ...emptySegmentResult(),
      attempted: true,
      playerDeclined: true,
    };
    ledgers = {
      savedReferences: frame.savedReferences,
      segmentResults: {
        ...frame.segmentResults,
        [segmentKey(pausedSegment, frame.pendingDecision.resumeAtSegmentIndex)]:
          declinedResult,
      },
    };
  }

  const resumed = resumeSequenceFrameFromLedgers({
    createTrashDecision,
    effectBlock: supportedBlock,
    entry,
    finalizeCompleted: true,
    frame,
    ledgers,
    state: nextState,
  });
  if (resumed === undefined) {
    return undefined;
  }
  if (!resumed.ok) {
    return resumed;
  }
  return {
    events: [...events, ...resumed.events],
    ok: true,
    state:
      events.length === 0
        ? resumed.state
        : {
            ...resumed.state,
            eventJournal: [...nextState.eventJournal, ...resumed.events],
          },
  };
};

export const resumeSequenceFrameAfterOptionalCost = (
  state: GameState,
  decision: PayCostDecision | OptionalPayCostDecision,
  paidCost: boolean,
  createTrashDecision: CreateTrashFromHandSequenceDecision,
): SequenceFrameResumeResult => {
  const frame = findSequenceFrameByDecisionId(state, decision.id);
  if (frame === undefined) {
    return undefined;
  }
  const entry = findFrameQueueEntry(state, frame);
  if (entry === undefined) {
    return {
      error: sequenceRuntimeError(frame.effectBlockId, "missing-queue-entry"),
      ok: false,
    };
  }
  const effectBlock = findSequenceEffectBlock(state, entry);
  const supportedBlock = toSupportedSequenceBlock(entry, effectBlock);
  if (supportedBlock === undefined) {
    return {
      error: sequenceRuntimeError(entry.effectBlockId, "missing-effect-block"),
      ok: false,
    };
  }
  const pausedSegment =
    supportedBlock.effect.effects[frame.pendingDecision.resumeAtSegmentIndex];
  if (pausedSegment === undefined || pausedSegment.effect.type !== "payCost") {
    return {
      error: sequenceRuntimeError(
        entry.effectBlockId,
        "unsupported-sequence-shape",
      ),
      ok: false,
    };
  }
  const segmentResult: SequenceSegmentResult = paidCost
    ? {
        ...emptySegmentResult(),
        attempted: true,
        succeeded: true,
        changedState: true,
        paidCost: true,
      }
    : {
        ...emptySegmentResult(),
        attempted: true,
        playerDeclined: true,
      };
  const savedReferences =
    paidCost && pausedSegment.saveResultAs !== undefined
      ? saveReference(frame.savedReferences, pausedSegment, {
          kind: "paidCost",
          paidCost: true,
        })
      : frame.savedReferences;
  return resumeSequenceFrameFromLedgers({
    createTrashDecision,
    effectBlock: supportedBlock,
    entry,
    finalizeCompleted: true,
    frame,
    ledgers: {
      savedReferences,
      segmentResults: {
        ...frame.segmentResults,
        [segmentKey(pausedSegment, frame.pendingDecision.resumeAtSegmentIndex)]:
          segmentResult,
      },
    },
    state,
  });
};

export const resumeSequenceFrameAfterPlaySelectedOverflow = (
  state: GameState,
  decisionId: SelectCardsDecision["id"],
): SequenceFrameResumeResult => {
  const frame = state.effectExecutionFrames.find(
    (candidate) => candidate.pendingDecision.decisionId === decisionId,
  );
  if (frame === undefined) {
    return undefined;
  }
  const entry = findFrameQueueEntry(state, frame);
  if (entry === undefined) {
    return {
      error: sequenceRuntimeError(frame.effectBlockId, "missing-queue-entry"),
      ok: false,
    };
  }
  const effectBlock = findSequenceEffectBlock(state, entry);
  const supportedBlock = toSupportedSequenceBlock(entry, effectBlock);
  if (supportedBlock === undefined) {
    return {
      error: sequenceRuntimeError(entry.effectBlockId, "missing-effect-block"),
      ok: false,
    };
  }
  return resumePlaySelectedOverflowFrame({
    createUnsupportedTrashDecision,
    effectBlock: supportedBlock,
    emptySegmentResult,
    entry,
    frame,
    resumeSequenceFrameFromLedgers,
    segmentKey,
    sequenceRuntimeError,
    state,
  });
};

export const resumeSequenceFrameAfterChooseQuantity = (
  state: GameState,
): SequenceFrameResumeResult => {
  return resumeDrawUpToQuantitySequenceFrame({
    emptySegmentResult,
    findFrameQueueEntry,
    findSequenceEffectBlock,
    resumeSequenceFrameFromLedgers: (params) =>
      resumeSequenceFrameFromLedgers(
        params as {
          createTrashDecision: CreateTrashFromHandSequenceDecision;
          effectBlock: SupportedSequenceBlock;
          entry: EffectQueueEntry;
          finalizeCompleted: boolean;
          frame: EffectExecutionFrame;
          ledgers: SegmentLedgers;
          state: GameState;
        },
      ),
    segmentKey,
    sequenceRuntimeError,
    state,
    unsupportedTrashDecision: createUnsupportedTrashDecision,
  });
};
