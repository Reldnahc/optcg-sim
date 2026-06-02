import type {
  CardInstance,
  CardRef,
  Effect,
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SelectCardsDecision,
  SequenceSegmentResult,
  Target,
} from "@optcg/types";

import {
  addCardsToHand,
  cardMatchesHandSelectionFilter,
  reindexZoneCards,
} from "../actions/state.js";
import { appendEvent, toDecisionId, toStateSeq } from "../action-results.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type MoveSelectedEffect = Extract<Effect, { type: "moveSelected" }>;
type AttachSelectedDonEffect = Extract<Effect, { type: "attachSelectedDon" }>;
type SelectFromSetEffect = Extract<Effect, { type: "selectFromSet" }>;
type BounceEffect = Extract<Effect, { type: "bounce" }> & {
  target: Extract<Target, { type: "savedFieldObject" }>;
  destination: "hand";
};
type SegmentLedgers = {
  savedReferences: NonNullable<
    GameState["effectExecutionFrames"][number]
  >["savedReferences"];
  segmentResults: NonNullable<
    GameState["effectExecutionFrames"][number]
  >["segmentResults"];
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

export const applyAttachSelectedDonSequenceSegment = (params: {
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

export const createSelectFromSetDecision = (params: {
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

const selectedRefsPlayerId = (
  selected: readonly CardRef[],
): CardRef["playerId"] | null => {
  const first = selected[0]?.playerId;
  if (first === undefined) {
    return null;
  }
  return selected.every((card) => card.playerId === first) ? first : null;
};

type SelectedCardMoveSegmentParams = {
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
};

export const applySelectedCardMoveSegment = (
  params: SelectedCardMoveSegmentParams,
):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | { ok: false } => {
  const selected = selectedCardRefsForMove(params.ledgers, params.effect);
  if (selected === null) {
    return { ok: false };
  }
  if (
    params.effect.from === "trash" &&
    params.effect.to === "hand" &&
    params.effect.position === undefined
  ) {
    return applyTrashToHandSelectedCardMoveSegment(params, selected);
  }
  if (
    params.effect.from === "hand" &&
    params.effect.to === "deck" &&
    params.effect.position === "bottom"
  ) {
    return applyHandToDeckBottomSelectedCardMoveSegment(params, selected);
  }
  return { ok: false };
};

const applyTrashToHandSelectedCardMoveSegment = (
  params: SelectedCardMoveSegmentParams,
  selected: readonly CardRef[],
):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | { ok: false } => {
  const playerId = selectedRefsPlayerId(selected);
  const player = playerId === null ? undefined : params.state.players[playerId];
  if (playerId === null || player === undefined) {
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
    playerId,
    "trash",
  );
  const nextHand = addCardsToHand(player.hand, movedCards, playerId);
  const eventBaseState: GameState = {
    ...params.state,
    players: {
      ...params.state.players,
      [playerId]: {
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

const applyHandToDeckBottomSelectedCardMoveSegment = (
  params: SelectedCardMoveSegmentParams,
  selected: readonly CardRef[],
):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      state: GameState;
    }
  | { ok: false } => {
  const playerId = selectedRefsPlayerId(selected);
  const player = playerId === null ? undefined : params.state.players[playerId];
  if (playerId === null || player === undefined) {
    return { ok: false };
  }
  const selectedIds = new Set(selected.map((card) => card.instanceId));
  const movedCards: CardInstance[] = [];
  for (const selectedCard of selected) {
    const current = player.hand.find(
      (card) =>
        card.instanceId === selectedCard.instanceId &&
        card.cardId === selectedCard.cardId,
    );
    if (current === undefined) {
      return { ok: false };
    }
    movedCards.push(current);
  }
  const nextHand = reindexZoneCards(
    player.hand.filter((card) => !selectedIds.has(card.instanceId)),
    "hand",
    playerId,
    "hand",
  );
  const nextDeck = reindexZoneCards(
    [...player.deck, ...movedCards],
    "deck",
    playerId,
    "deck",
  );
  const eventBaseState: GameState = {
    ...params.state,
    players: {
      ...params.state.players,
      [playerId]: {
        ...player,
        deck: nextDeck,
        hand: nextHand,
      },
    },
  };
  const events: EngineEvent[] = [];
  for (const card of movedCards) {
    const moved = nextDeck.find(
      (candidate) => candidate.instanceId === card.instanceId,
    );
    appendEvent(
      eventBaseState,
      events,
      "cardMoved",
      {
        from: { zone: "hand", playerId, slot: "hand" },
        to: { zone: "deck", playerId, slot: "deck", position: "bottom" },
        reason: "effect",
      },
      { type: "public" },
    );
    const publicEvent = events[events.length - 1];
    if (publicEvent !== undefined) {
      publicEvent.causedBy = {
        type: "effect",
        queueEntryId: params.entry.id,
        effectId: params.entry.effectBlockId,
      };
    }
    appendEvent(
      eventBaseState,
      events,
      "cardMoved",
      {
        instanceId: card.instanceId,
        cardId: card.cardId,
        from: card.zone,
        to: moved?.zone,
        reason: "effect",
      },
      { type: "private", playerId },
    );
    const privateEvent = events[events.length - 1];
    if (privateEvent !== undefined) {
      privateEvent.causedBy = {
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

export const applyBounceToOwnerHandSequenceSegment = (params: {
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
    const nextHand = addCardsToHand(
      player.hand,
      [{ ...card, attachedDon: [] }],
      target.playerId,
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
