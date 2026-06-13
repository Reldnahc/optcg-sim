import type {
  Action,
  CardInstance,
  CardRef,
  Effect,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EventVisibility,
  GameState,
  OrderCardsDecision,
  SelectCardsDecision,
  SequenceSegmentResult,
} from "@optcg/types";

import {
  cardMatchesHandSelectionFilter,
  reindexZoneCards,
} from "../actions/state.js";
import { appendEvent, toDecisionId, toStateSeq } from "../action-results.js";
import { applyDonAttachment } from "../runtime/primitives/don-attachment.js";
import {
  applySetToLifeSelectedCardMoveSegment,
  applyTrashToLifeSelectedCardMoveSegment,
} from "./selected-trash-to-life.js";
import { applyHandToLifeSelectedCardMoveSegment } from "./selected-hand-to-life.js";
import {
  applySetToHandSelectedCardMoveSegment,
  applyTrashToHandSelectedCardMoveSegment,
} from "./selected-to-hand.js";

type SequenceEffect = Extract<Effect, { type: "sequence" }>;
type MoveSelectedEffect = Extract<Effect, { type: "moveSelected" }>;
type AttachSelectedDonEffect = Extract<Effect, { type: "attachSelectedDon" }>;
type SelectFromSetEffect = Extract<Effect, { type: "selectFromSet" }>;
type SegmentLedgers = {
  savedReferences: NonNullable<
    GameState["effectExecutionFrames"][number]
  >["savedReferences"];
  segmentResults: NonNullable<
    GameState["effectExecutionFrames"][number]
  >["segmentResults"];
};

const selectedHandDeckPlacementDecisionPrefix =
  "decision:orderCards:selected-hand-to-deck:";

const zoneNames = new Set<string>([
  "hand",
  "deck",
  "trash",
  "life",
  "costArea",
  "characterArea",
  "stageArea",
  "leaderArea",
  "donDeck",
  "noZone",
]);

const isSelectionSetSource = (source: MoveSelectedEffect["from"]): boolean =>
  !zoneNames.has(source);

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
  if (selected?.kind === "selectedCards") {
    return selected.cards;
  }
  if (selected?.kind === "selectedTargets") {
    return selected.targets.map((target) => target.object);
  }
  return null;
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
  if (selectedDon === null || target === null) {
    return { ok: false };
  }
  const selectedDonPlayerId = selectedRefsPlayerId(selectedDon);
  const sourcePlayer =
    selectedDonPlayerId === null
      ? undefined
      : params.state.players[selectedDonPlayerId];
  const targetPlayer = params.state.players[target.playerId];
  if (
    selectedDonPlayerId === null ||
    sourcePlayer === undefined ||
    targetPlayer === undefined ||
    (params.effect.targetOwner === "selectedDonOwner" &&
      target.playerId !== selectedDonPlayerId)
  ) {
    return { ok: false };
  }
  const attached = applyDonAttachment({
    causedBy: {
      type: "effect",
      queueEntryId: params.entry.id,
      effectId: params.entry.effectBlockId,
    },
    requireTargetOwnerMatchesSource:
      params.effect.targetOwner === "selectedDonOwner",
    selectedDonInstanceIds: selectedDon.map((card) => card.instanceId),
    sourcePlayerId: selectedDonPlayerId,
    state: params.state,
    target,
    ...(params.effect.sourceState === undefined
      ? {}
      : { sourceState: params.effect.sourceState }),
  });
  if (!attached.ok) {
    return { ok: false };
  }
  const nextState: GameState = {
    ...params.state,
    seq: toStateSeq(params.state.seq + 1),
    players: attached.players,
  };
  return {
    events: [...attached.events],
    ledgers: {
      ...params.ledgers,
      segmentResults: {
        ...params.ledgers.segmentResults,
        [params.segmentKey(params.segment, params.index)]: {
          ...params.emptySegmentResult(),
          attempted: true,
          succeeded: true,
          changedState: attached.selectedDon.length > 0,
          selectedCards: [...selectedDon],
          selectedTargets: [target],
        },
      },
    },
    ok: true,
    state: {
      ...nextState,
      eventJournal: [...params.state.eventJournal, ...attached.events],
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
  const selectionSetId = String(params.effect.set);
  let revealVisibility: EventVisibility | undefined;
  for (
    let recordIndex = params.state.revealedCards.length - 1;
    recordIndex >= 0;
    recordIndex -= 1
  ) {
    const record = params.state.revealedCards[recordIndex];
    if (record?.selectionSetId === selectionSetId) {
      revealVisibility = record.visibility;
      break;
    }
  }
  const visibility =
    revealVisibility ?? ({ type: "public" } satisfies EventVisibility);
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
    visibility,
    request: {
      timing: "onResolution",
      chooser: "self",
      set: params.effect.set,
      min: params.effect.min,
      max: params.effect.max,
      allowFewerIfUnavailable: true,
      visibility: visibility.type === "private" ? "privateToChooser" : "public",
      ...(params.effect.filter === undefined
        ? {}
        : { filter: params.effect.filter }),
    },
    candidates: candidates.map((card) => ({
      card,
      visibility,
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
    visibility,
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
      paused?: false;
      state: GameState;
    }
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      paused: true;
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
    params.effect.from === "trash" &&
    params.effect.to === "life" &&
    (params.effect.position === "top" || params.effect.position === "bottom")
  ) {
    return applyTrashToLifeSelectedCardMoveSegment(params, selected);
  }
  if (
    params.effect.from === "trash" &&
    params.effect.to === "deck" &&
    params.effect.position === "bottom"
  ) {
    return applyTrashToDeckBottomSelectedCardMoveSegment(params, selected);
  }
  if (
    params.effect.from === "hand" &&
    params.effect.to === "deck" &&
    (params.effect.position === "top" ||
      params.effect.position === "bottom" ||
      params.effect.position === "topOrBottom")
  ) {
    return applyHandToDeckSelectedCardMoveSegment(params, selected);
  }
  if (
    params.effect.from === "hand" &&
    params.effect.to === "life" &&
    (params.effect.position === "top" || params.effect.position === "bottom")
  ) {
    return applyHandToLifeSelectedCardMoveSegment(params, selected);
  }
  if (
    isSelectionSetSource(params.effect.from) &&
    params.effect.to === "hand" &&
    params.effect.position === undefined &&
    params.effect.destinationFaceUp === undefined
  ) {
    return applySetToHandSelectedCardMoveSegment(params, selected);
  }
  if (
    isSelectionSetSource(params.effect.from) &&
    params.effect.to === "life" &&
    (params.effect.position === "top" || params.effect.position === "bottom")
  ) {
    return applySetToLifeSelectedCardMoveSegment(params, selected);
  }
  return { ok: false };
};

const applyTrashToDeckBottomSelectedCardMoveSegment = (
  params: SelectedCardMoveSegmentParams,
  selected: readonly CardRef[],
):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      paused?: false;
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
        trash: nextTrash,
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
        instanceId: card.instanceId,
        cardId: card.cardId,
        from: card.zone,
        to: moved?.zone,
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

const applyHandToDeckSelectedCardMoveSegment = (
  params: SelectedCardMoveSegmentParams,
  selected: readonly CardRef[],
):
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      paused?: false;
      state: GameState;
    }
  | {
      events: EngineEvent[];
      ledgers: SegmentLedgers;
      ok: true;
      paused: true;
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
  if (params.effect.position === "topOrBottom") {
    const decision: OrderCardsDecision = {
      id: toDecisionId(
        `${selectedHandDeckPlacementDecisionPrefix}${String(params.entry.id)}:${String(params.index)}`,
      ),
      type: "orderCards",
      playerId,
      prompt: "Place selected cards at the top or bottom of your deck.",
      causedBy: {
        type: "effect",
        queueEntryId: params.entry.id,
        effectId: params.entry.effectBlockId,
      },
      visibility: { type: "private", playerId },
      cards: movedCards.map((card) => ({
        instanceId: card.instanceId,
        cardId: card.cardId,
        playerId,
        zone: card.zone,
      })),
      destination: "deck",
      placement: { type: "topOrBottom" },
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
      decision.visibility,
    );
    const event = events[0];
    if (event !== undefined) {
      event.causedBy = decision.causedBy;
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
            selectedCards: [...selected],
          },
        },
      },
      ok: true,
      paused: true,
      state: {
        ...params.state,
        seq: toStateSeq(params.state.seq + 1),
        pendingDecision: decision,
        eventJournal: [...params.state.eventJournal, ...events],
      },
    };
  }
  const nextHand = reindexZoneCards(
    player.hand.filter((card) => !selectedIds.has(card.instanceId)),
    "hand",
    playerId,
    "hand",
  );
  const position = params.effect.position;
  if (position !== "top" && position !== "bottom") {
    return { ok: false };
  }
  const nextDeck = reindexZoneCards(
    position === "top"
      ? [...movedCards, ...player.deck]
      : [...player.deck, ...movedCards],
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
        to: { zone: "deck", playerId, slot: "deck", position },
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

const hasDuplicateIds = (ids: readonly string[]): boolean =>
  ids.some((id, index) => ids.slice(index + 1).includes(id));

const orderedCardsFromIds = (
  activeCards: readonly CardInstance[],
  ids: readonly string[],
): CardInstance[] =>
  ids.flatMap((id) => {
    const card = activeCards.find(
      (candidate) => String(candidate.instanceId) === id,
    );
    return card === undefined ? [] : [card];
  });

const isSelectedHandDeckPlacementDecision = (
  decision: NonNullable<GameState["pendingDecision"]>,
): decision is OrderCardsDecision =>
  decision.type === "orderCards" &&
  String(decision.id).startsWith(selectedHandDeckPlacementDecisionPrefix);

export { applyBounceSequenceSegment } from "./selected-bounce.js";

export const applySelectedHandDeckPlacementDecisionResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
):
  | {
      events: EngineEvent[];
      ok: true;
      state: GameState;
    }
  | { errors: readonly [EngineError, ...EngineError[]]; ok: false }
  | null => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    !isSelectedHandDeckPlacementDecision(decision)
  ) {
    return null;
  }
  const fail = (reason: string) => ({
    errors: [{ type: "invalidDecisionResponse" as const, reason }] as const,
    ok: false as const,
  });
  if (action.response.type !== "topBottomPlacement") {
    return fail(
      "Response type must be topBottomPlacement for selected hand placement.",
    );
  }
  const expectedIds = decision.cards.map((card) => String(card.instanceId));
  const topIds = action.response.topIds;
  const bottomIds = action.response.bottomIds;
  const placedOnTop = topIds.length === expectedIds.length;
  const placedOnBottom = bottomIds.length === expectedIds.length;
  if (!placedOnTop && !placedOnBottom) {
    return fail("Selected cards must all be placed on top or all on bottom.");
  }
  const responseIds = [...topIds, ...bottomIds];
  if (
    hasDuplicateIds(responseIds) ||
    responseIds.length !== expectedIds.length ||
    !responseIds.every((id) => expectedIds.includes(id))
  ) {
    return fail("Top and bottom ids must partition the selected cards.");
  }
  const player = state.players[decision.playerId];
  if (player === undefined) {
    return fail("Selected hand placement player is missing.");
  }
  const selectedIds = new Set(expectedIds);
  const selectedCards: CardInstance[] = [];
  for (const cardRef of decision.cards) {
    const current = player.hand.find(
      (card) =>
        card.instanceId === cardRef.instanceId &&
        card.cardId === cardRef.cardId,
    );
    if (current === undefined) {
      return fail("Selected hand placement decision is stale.");
    }
    selectedCards.push(current);
  }
  const orderedCards = orderedCardsFromIds(
    selectedCards,
    placedOnTop ? topIds : bottomIds,
  );
  const nextHand = reindexZoneCards(
    player.hand.filter((card) => !selectedIds.has(String(card.instanceId))),
    "hand",
    decision.playerId,
    "hand",
  );
  const position = placedOnTop ? "top" : "bottom";
  const nextDeck = reindexZoneCards(
    position === "top"
      ? [...orderedCards, ...player.deck]
      : [...player.deck, ...orderedCards],
    "deck",
    decision.playerId,
    "deck",
  );
  const eventBaseState: GameState = {
    ...state,
    players: {
      ...state.players,
      [decision.playerId]: {
        ...player,
        deck: nextDeck,
        hand: nextHand,
      },
    },
  };
  const events: EngineEvent[] = [];
  appendEvent(
    eventBaseState,
    events,
    "decisionResolved",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
      responseType: action.response.type,
      orderedCount: responseIds.length,
    },
    decision.visibility,
  );
  for (const card of orderedCards) {
    const moved = nextDeck.find(
      (candidate) => candidate.instanceId === card.instanceId,
    );
    appendEvent(
      eventBaseState,
      events,
      "cardMoved",
      {
        from: { zone: "hand", playerId: decision.playerId, slot: "hand" },
        to: {
          zone: "deck",
          playerId: decision.playerId,
          slot: "deck",
          position,
        },
        reason: "effect",
      },
      { type: "public" },
    );
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
      { type: "private", playerId: decision.playerId },
    );
  }
  for (const event of events) {
    event.causedBy = { type: "decision", decisionId: decision.id };
  }
  const nextState: GameState = {
    ...eventBaseState,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    eventJournal: [...state.eventJournal, ...events],
  };
  delete nextState.pendingDecision;
  return { events, ok: true, state: nextState };
};
