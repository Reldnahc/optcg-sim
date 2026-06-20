import type {
  Action,
  CardRef,
  Effect,
  EffectQueueEntry,
  EngineError,
  EngineEvent,
  EngineResult,
  GameState,
  LegalAction,
  SelectCardMax,
  SelectCardsDecision,
} from "@optcg/types";

import {
  appendEvent,
  type EngineResultOptions,
  toDecisionId,
  toEngineResult,
  toStateSeq,
} from "./action-results.js";
import {
  cardMatchesHandSelectionFilter,
  getOpponentId,
  isSupportedHandSelectionCardFilter,
  toCardRef,
  zonesEqual,
} from "./actions/state.js";
import { clearPendingDecision } from "./decisions/continuation-gate.js";
import { resumeSequenceFrameAfterHandSelection } from "./effect-runtime-sequence/frames.js";
import { createSupportedTrashFromHandChoiceDecision } from "./runtime/primitives/trash-from-hand.js";

type SequenceSelectCardsEffect = Extract<Effect, { type: "selectCards" }>;

const handDecisionIdPrefix = "decision:selectCards:hand-selection:";
const deckDecisionIdPrefix = "decision:selectCards:deck-selection:";
const trashDecisionIdPrefix = "decision:selectCards:trash-selection:";
const lifeDecisionIdPrefix = "decision:selectCards:life-selection:";
const costAreaDecisionIdPrefix = "decision:selectCards:cost-area-selection:";
const multiZoneDecisionIdPrefix = "decision:selectCards:multi-zone-selection:";

const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

const isSupportedSelectionMax = (max: SelectCardMax): boolean =>
  max === "available" || Number.isInteger(max);

const selectionMaxValue = (
  max: SelectCardMax,
  candidates: readonly unknown[],
): number => (max === "available" ? candidates.length : max);

const hasSupportedSelectionCardinality = (
  min: number,
  max: SelectCardMax,
): boolean =>
  Number.isInteger(min) &&
  isSupportedSelectionMax(max) &&
  min >= 0 &&
  (max === "available" || max >= min);

export const isSupportedSequenceHandSelectCardsEffect = (
  effect: Effect,
): effect is SequenceSelectCardsEffect =>
  effect.type === "selectCards" &&
  effect.zone === "hand" &&
  (effect.player === "self" || effect.player === "opponent") &&
  (effect.chooser === "self" || effect.chooser === "opponent") &&
  effect.visibility === "chooserOnly" &&
  String(effect.saveAs).startsWith("handSelection:") &&
  isSupportedHandSelectionCardFilter(effect.filter) &&
  hasSupportedSelectionCardinality(effect.min, effect.max);

const isSupportedSequenceTrashSelectCardsEffect = (
  effect: Effect,
): effect is SequenceSelectCardsEffect =>
  effect.type === "selectCards" &&
  effect.zone === "trash" &&
  (effect.player === "self" || effect.player === "opponent") &&
  (effect.chooser === "self" || effect.chooser === "opponent") &&
  effect.visibility === "bothPlayers" &&
  String(effect.saveAs).startsWith("trashSelection:") &&
  isSupportedHandSelectionCardFilter(effect.filter) &&
  hasSupportedSelectionCardinality(effect.min, effect.max);

const isSupportedSequenceLifeSelectCardsEffect = (
  effect: Effect,
): effect is SequenceSelectCardsEffect =>
  effect.type === "selectCards" &&
  effect.zone === "life" &&
  (effect.player === "self" || effect.player === "opponent") &&
  (effect.chooser === "self" || effect.chooser === "opponent") &&
  effect.visibility === "chooserOnly" &&
  String(effect.saveAs).startsWith("lifeSelection:") &&
  isSupportedHandSelectionCardFilter(effect.filter) &&
  hasSupportedSelectionCardinality(effect.min, effect.max);

const isSupportedSequenceDeckSelectCardsEffect = (
  effect: Effect,
): effect is SequenceSelectCardsEffect =>
  effect.type === "selectCards" &&
  effect.zone === "deck" &&
  effect.player === effect.chooser &&
  effect.player === "self" &&
  effect.visibility === "chooserOnly" &&
  isSupportedHandSelectionCardFilter(effect.filter) &&
  hasSupportedSelectionCardinality(effect.min, effect.max);

const isSupportedSequenceCostAreaSelectCardsEffect = (
  effect: Effect,
): effect is SequenceSelectCardsEffect =>
  effect.type === "selectCards" &&
  effect.zone === "costArea" &&
  effect.player === "self" &&
  effect.chooser === "self" &&
  effect.visibility === "bothPlayers" &&
  String(effect.saveAs).startsWith("donSelection:") &&
  isSupportedHandSelectionCardFilter(effect.filter) &&
  hasSupportedSelectionCardinality(effect.min, effect.max);

const isSupportedSequenceMultiZoneSelectCardsEffect = (
  effect: Effect,
): effect is SequenceSelectCardsEffect =>
  effect.type === "selectCards" &&
  effect.zones !== undefined &&
  effect.zones.length > 0 &&
  effect.zones.every((zone) => zone === "hand" || zone === "trash") &&
  effect.player === effect.chooser &&
  (effect.player === "self" || effect.player === "opponent") &&
  (effect.visibility === "chooserOnly" ||
    effect.visibility === "bothPlayers") &&
  isSupportedHandSelectionCardFilter(effect.filter) &&
  hasSupportedSelectionCardinality(effect.min, effect.max);

export const isSupportedSequenceSelectCardsEffect = (
  effect: Effect,
): effect is SequenceSelectCardsEffect =>
  isSupportedSequenceHandSelectCardsEffect(effect) ||
  isSupportedSequenceDeckSelectCardsEffect(effect) ||
  isSupportedSequenceTrashSelectCardsEffect(effect) ||
  isSupportedSequenceLifeSelectCardsEffect(effect) ||
  isSupportedSequenceCostAreaSelectCardsEffect(effect) ||
  isSupportedSequenceMultiZoneSelectCardsEffect(effect);

const isSupportedRelativePlayer = (
  player: SelectCardsDecision["request"]["player"],
): player is "self" | "opponent" => player === "self" || player === "opponent";

const isSupportedRelativeChooser = (
  chooser: SelectCardsDecision["request"]["chooser"],
): chooser is "self" | "opponent" =>
  chooser === "self" || chooser === "opponent";

const isCardRef = (value: unknown): value is CardRef => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  const zone = candidate["zone"];
  return (
    typeof candidate["instanceId"] === "string" &&
    typeof candidate["cardId"] === "string" &&
    typeof candidate["playerId"] === "string" &&
    (zone === undefined || (typeof zone === "object" && zone !== null))
  );
};

const cardRefMatches = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId &&
  ((left.zone === undefined && right.zone === undefined) ||
    (left.zone !== undefined &&
      right.zone !== undefined &&
      zonesEqual(left.zone, right.zone)));

const hiddenLifeCardRefMatches = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.playerId === right.playerId &&
  left.zone !== undefined &&
  right.zone !== undefined &&
  zonesEqual(left.zone, right.zone);

const hasDuplicateInstanceIds = (cards: readonly CardRef[]): boolean =>
  new Set(cards.map((card) => card.instanceId)).size !== cards.length;

const isSupportedSelectCardsDecision = (
  decision: SelectCardsDecision,
): boolean =>
  decision.request.timing === "onResolution" &&
  isSupportedRelativeChooser(decision.request.chooser) &&
  (decision.request.player === undefined ||
    isSupportedRelativePlayer(decision.request.player)) &&
  decision.request.set === undefined &&
  isSupportedHandSelectionCardFilter(decision.request.filter) &&
  ((String(decision.id).startsWith(handDecisionIdPrefix) &&
    decision.request.zone === "hand" &&
    isSupportedRelativePlayer(decision.request.player) &&
    !decision.request.allowFewerIfUnavailable &&
    decision.request.visibility === "privateToChooser" &&
    decision.visibility.type === "private" &&
    decision.visibility.playerId === decision.playerId) ||
    (String(decision.id).startsWith(deckDecisionIdPrefix) &&
      decision.request.zone === "deck" &&
      decision.request.player === decision.request.chooser &&
      !decision.request.allowFewerIfUnavailable &&
      decision.request.visibility === "privateToChooser" &&
      decision.visibility.type === "private" &&
      decision.visibility.playerId === decision.playerId) ||
    (String(decision.id).startsWith(trashDecisionIdPrefix) &&
      decision.request.zone === "trash" &&
      isSupportedRelativePlayer(decision.request.player) &&
      decision.request.allowFewerIfUnavailable &&
      decision.request.visibility === "public" &&
      decision.visibility.type === "public") ||
    (String(decision.id).startsWith(lifeDecisionIdPrefix) &&
      decision.request.zone === "life" &&
      isSupportedRelativePlayer(decision.request.player) &&
      decision.request.allowFewerIfUnavailable &&
      decision.request.visibility === "privateToChooser" &&
      decision.visibility.type === "private" &&
      decision.visibility.playerId === decision.playerId) ||
    (String(decision.id).startsWith(costAreaDecisionIdPrefix) &&
      decision.request.zone === "costArea" &&
      decision.request.chooser === "self" &&
      decision.request.player === "self" &&
      decision.request.allowFewerIfUnavailable &&
      decision.request.visibility === "public" &&
      decision.visibility.type === "public") ||
    (String(decision.id).startsWith(multiZoneDecisionIdPrefix) &&
      decision.request.zone === undefined &&
      decision.request.zones !== undefined &&
      decision.request.zones.length > 0 &&
      decision.request.zones.every(
        (zone) => zone === "hand" || zone === "trash",
      ) &&
      decision.request.player === decision.request.chooser &&
      !decision.request.allowFewerIfUnavailable &&
      decision.request.visibility === "privateToChooser" &&
      decision.visibility.type === "private" &&
      decision.visibility.playerId === decision.playerId));

const hasMalformedRespondToDecisionPlayerId = (
  action: Extract<Action, { type: "respondToDecision" }>,
): boolean =>
  "playerId" in action &&
  typeof (action as { playerId?: unknown }).playerId !== "string";

const getRespondingPlayerId = (
  action: Extract<Action, { type: "respondToDecision" }>,
  decisionPlayerId: SelectCardsDecision["playerId"],
): SelectCardsDecision["playerId"] => {
  if (
    "playerId" in action &&
    typeof (action as { playerId?: unknown }).playerId === "string"
  ) {
    return (action as { playerId: SelectCardsDecision["playerId"] }).playerId;
  }
  return decisionPlayerId;
};

const resolveEffectPlayerId = (
  state: GameState,
  entry: EffectQueueEntry,
  player: SequenceSelectCardsEffect["player"],
): SelectCardsDecision["playerId"] | undefined => {
  if (player === "self") {
    return entry.controllerId;
  }
  if (player === "opponent") {
    return getOpponentId(state, entry.controllerId) ?? undefined;
  }
  return undefined;
};

export const isHandSelectionSelectCardsDecision = (
  decision: NonNullable<GameState["pendingDecision"]>,
): decision is SelectCardsDecision =>
  decision.type === "selectCards" && isSupportedSelectCardsDecision(decision);

const cardsInPlayerZone = (
  state: GameState,
  playerId: CardRef["playerId"],
  zone: NonNullable<SelectCardsDecision["request"]["zone"]>,
) => {
  const player = state.players[playerId];
  if (player === undefined) {
    return null;
  }
  return zone === "hand"
    ? player.hand
    : zone === "deck"
      ? player.deck
      : zone === "trash"
        ? player.trash
        : zone === "life"
          ? player.life.map((lifeCard) => lifeCard.card)
          : zone === "costArea"
            ? player.costArea
            : undefined;
};

const requestZones = (
  request: SelectCardsDecision["request"],
): readonly NonNullable<SelectCardsDecision["request"]["zone"]>[] | null => {
  if (request.zones !== undefined) {
    return request.zones;
  }
  return request.zone === undefined ? null : [request.zone];
};

const currentCandidateRefsForDecision = (
  state: GameState,
  decision: SelectCardsDecision,
): CardRef[] | null => {
  const zones = requestZones(decision.request);
  if (zones === null) {
    return null;
  }
  const currentRefs: CardRef[] = [];
  for (const candidate of decision.candidates) {
    const candidateZone = candidate.card.zone?.zone;
    if (candidateZone === undefined || !zones.includes(candidateZone)) {
      return null;
    }
    const cards = cardsInPlayerZone(
      state,
      candidate.card.playerId,
      candidateZone,
    );
    if (cards === null || cards === undefined) {
      return null;
    }
    const current = cards.find(
      (card) =>
        card.instanceId === candidate.card.instanceId &&
        card.cardId === candidate.card.cardId,
    );
    if (
      current === undefined ||
      !cardMatchesHandSelectionFilter(
        state,
        candidate.card.playerId,
        current,
        decision.request.filter,
      )
    ) {
      return null;
    }
    currentRefs.push(toCardRef(current, candidate.card.playerId));
  }
  return currentRefs;
};

const candidateVisibilityForDecision = (
  decision: SelectCardsDecision,
  candidate: CardRef,
): SelectCardsDecision["candidates"][number]["visibility"] =>
  candidate.zone?.zone === "trash"
    ? { type: "public" }
    : candidate.zone?.zone === "costArea"
      ? { type: "public" }
      : { type: "private", playerId: decision.playerId };

const hasCurrentCandidateEnvelope = (
  state: GameState,
  decision: SelectCardsDecision,
): boolean => {
  const filteredCards = currentCandidateRefsForDecision(state, decision);
  if (filteredCards === null) {
    return false;
  }
  if (decision.candidates.length !== filteredCards.length) {
    return false;
  }
  return decision.candidates.every((candidate, index) => {
    const current = filteredCards[index];
    const expectedVisibility = candidateVisibilityForDecision(
      decision,
      candidate.card,
    );
    return (
      current !== undefined &&
      candidate.visibility.type === expectedVisibility.type &&
      ("playerId" in expectedVisibility
        ? "playerId" in candidate.visibility &&
          candidate.visibility.playerId === expectedVisibility.playerId
        : !("playerId" in candidate.visibility)) &&
      cardRefMatches(candidate.card, current)
    );
  });
};

const findCurrentCards = (
  state: GameState,
  decision: SelectCardsDecision,
  selected: readonly CardRef[],
): CardRef[] | null => {
  const candidateRefs = currentCandidateRefsForDecision(state, decision);
  if (candidateRefs === null) {
    return null;
  }
  const selectedRefs: CardRef[] = [];
  for (const ref of selected) {
    const match = candidateRefs.find((candidate) =>
      candidate.zone?.zone === "life"
        ? hiddenLifeCardRefMatches(ref, candidate)
        : cardRefMatches(ref, candidate),
    );
    if (match === undefined) {
      return null;
    }
    selectedRefs.push(match);
  }
  return selectedRefs;
};

const selectedCardsHaveDifferentNames = (
  state: GameState,
  selected: readonly CardRef[],
): boolean => {
  const names = selected.map(
    (card) => state.cardManifest.cards[card.cardId]?.name,
  );
  return (
    names.every((name): name is string => name !== undefined) &&
    new Set(names).size === names.length
  );
};

export const createSupportedHandSelectionChoiceDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: SequenceSelectCardsEffect,
  segmentIndex: number,
):
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
    } => {
  if (!isSupportedSequenceSelectCardsEffect(effect)) {
    return {
      error: {
        type: "effectRuntimeError",
        effectId: entry.effectBlockId,
        details: { reason: "unsupported-hand-selection-shape" },
      },
      events: [],
      ok: false,
      state,
    };
  }
  const resolvedFilter = effect.filter;
  if (!hasSupportedSelectionCardinality(effect.min, effect.max)) {
    return {
      error: {
        type: "effectRuntimeError",
        effectId: entry.effectBlockId,
        details: { reason: "unsupported-hand-selection-cardinality" },
      },
      events: [],
      ok: false,
      state,
    };
  }
  const zoneOwnerId = resolveEffectPlayerId(state, entry, effect.player);
  const chooserId = resolveEffectPlayerId(state, entry, effect.chooser);
  const zoneOwner =
    zoneOwnerId === undefined ? undefined : state.players[zoneOwnerId];
  if (
    zoneOwnerId === undefined ||
    chooserId === undefined ||
    zoneOwner === undefined ||
    state.players[chooserId] === undefined
  ) {
    return {
      error: {
        type: "effectRuntimeError",
        effectId: entry.effectBlockId,
        details: { reason: "unsupported-hand-selection-player" },
      },
      events: [],
      ok: false,
      state,
    };
  }

  const zones =
    effect.zones === undefined ? [effect.zone] : [...new Set(effect.zones)];
  const candidateVisibilityForZone = (
    zone: NonNullable<SequenceSelectCardsEffect["zone"]>,
  ) =>
    zone === "trash" || zone === "costArea"
      ? { type: "public" as const }
      : ({ type: "private" as const, playerId: chooserId } as const);

  const candidates = zones.flatMap((zone) => {
    const cards =
      zone === "hand"
        ? zoneOwner.hand
        : zone === "deck"
          ? zoneOwner.deck
          : zone === "trash"
            ? zoneOwner.trash
            : zone === "life"
              ? zoneOwner.life.map((lifeCard) => lifeCard.card)
              : zoneOwner.costArea;
    const candidateVisibility = candidateVisibilityForZone(zone);
    return cards
      .filter((card) =>
        cardMatchesHandSelectionFilter(
          state,
          zoneOwnerId,
          card,
          resolvedFilter,
        ),
      )
      .map((card) => ({
        card: toCardRef(card, zoneOwnerId),
        visibility: candidateVisibility,
      }));
  });

  if (candidates.length < effect.min) {
    return {
      error: {
        type: "effectRuntimeError",
        effectId: entry.effectBlockId,
        details: { reason: "insufficient-hand-selection-candidates" },
      },
      events: [],
      ok: false,
      state,
    };
  }
  const max = selectionMaxValue(effect.max, candidates);

  const causedBy = {
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  } as const;
  const visibility =
    effect.zones !== undefined
      ? ({ type: "private", playerId: chooserId } as const)
      : effect.zone === "trash" || effect.zone === "costArea"
        ? ({ type: "public" } as const)
        : ({ type: "private", playerId: chooserId } as const);
  const idPrefix =
    effect.zones !== undefined
      ? multiZoneDecisionIdPrefix
      : effect.zone === "trash"
        ? trashDecisionIdPrefix
        : effect.zone === "life"
          ? lifeDecisionIdPrefix
          : effect.zone === "costArea"
            ? costAreaDecisionIdPrefix
            : effect.zone === "deck"
              ? deckDecisionIdPrefix
              : handDecisionIdPrefix;
  const pendingDecision: SelectCardsDecision = {
    id: toDecisionId(`${idPrefix}${String(entry.id)}:${String(segmentIndex)}`),
    type: "selectCards",
    playerId: chooserId,
    prompt:
      effect.zones !== undefined
        ? "Choose cards."
        : effect.zone === "trash"
          ? "Choose cards from trash."
          : effect.zone === "life"
            ? "Choose Life cards."
            : effect.zone === "costArea"
              ? "Choose DON!! cards."
              : "Choose cards from hand.",
    causedBy,
    visibility,
    request: {
      timing: "onResolution",
      chooser: effect.chooser,
      player: effect.player,
      ...(effect.zones === undefined
        ? { zone: effect.zone }
        : { zones: effect.zones }),
      min: effect.min,
      max,
      allowFewerIfUnavailable:
        effect.zones === undefined &&
        (effect.zone === "trash" ||
          effect.zone === "life" ||
          effect.zone === "costArea"),
      visibility:
        effect.zones === undefined &&
        (effect.zone === "trash" || effect.zone === "costArea")
          ? "public"
          : "privateToChooser",
      ...(resolvedFilter === undefined ? {} : { filter: resolvedFilter }),
    },
    candidates,
  };
  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionCreated",
    {
      decisionId: pendingDecision.id,
      decisionType: pendingDecision.type,
      playerId: pendingDecision.playerId,
    },
    visibility,
  );
  const created = events[0];
  if (created !== undefined) {
    created.causedBy = causedBy;
  }
  return {
    events,
    ok: true,
    state: {
      ...state,
      seq: toStateSeq(state.seq + 1),
      pendingDecision,
      eventJournal: [...state.eventJournal, ...events],
    },
  };
};

export const getHandSelectionDecisionLegalActions = (
  state: GameState,
  playerId: EffectQueueEntry["controllerId"],
): LegalAction[] => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    decision.playerId !== playerId ||
    !isSupportedSelectCardsDecision(decision)
  ) {
    return [];
  }
  const cards = decision.candidates
    .slice(0, decision.request.min)
    .map((candidate) => candidate.card);
  return [
    {
      type: "respondToDecision",
      decisionId: decision.id,
      response: { type: "cards", cards },
    },
  ];
};

export const applySupportedHandSelectionChoiceResponse = (
  state: GameState,
  action: Extract<Action, { type: "respondToDecision" }>,
  options: EngineResultOptions = {},
): EngineResult | null => {
  const decision = state.pendingDecision;
  if (
    decision === undefined ||
    decision.type !== "selectCards" ||
    !isSupportedSelectCardsDecision(decision)
  ) {
    return null;
  }
  if (decision.id !== action.decisionId) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "Decision id does not match current hand-selection decision.",
      ),
      options,
    );
  }
  if (hasMalformedRespondToDecisionPlayerId(action)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Player does not match current hand-selection decision."),
      options,
    );
  }
  if (getRespondingPlayerId(action, decision.playerId) !== decision.playerId) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Player does not match current hand-selection decision."),
      options,
    );
  }
  if (action.response.type !== "cards") {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "Response type must be cards for hand-selection choices.",
      ),
      options,
    );
  }
  const responseCards = (action.response as { cards?: unknown }).cards;
  if (!Array.isArray(responseCards) || !responseCards.every(isCardRef)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Response cards must be CardRef values."),
      options,
    );
  }
  if (
    responseCards.length < decision.request.min ||
    responseCards.length > decision.request.max
  ) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "Selected card count must be within hand-selection bounds.",
      ),
      options,
    );
  }
  if (hasDuplicateInstanceIds(responseCards)) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Selected cards must not contain duplicates."),
      options,
    );
  }
  if (!hasCurrentCandidateEnvelope(state, decision)) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        "hand-selection decision envelope is stale or unsupported.",
      ),
      options,
    );
  }
  const selectedCards = findCurrentCards(state, decision, responseCards);
  if (selectedCards === null) {
    return toEngineResult(
      state,
      [],
      invalidDecision(
        `Selected cards must be active cards in the choosing player's ${String(decision.request.zone)}.`,
      ),
      options,
    );
  }
  if (
    decision.request.filter?.custom === "differentNames" &&
    !selectedCardsHaveDifferentNames(state, selectedCards)
  ) {
    return toEngineResult(
      state,
      [],
      invalidDecision("Selected cards must have different names."),
      options,
    );
  }

  const events: EngineEvent[] = [];
  appendEvent(
    state,
    events,
    "decisionResolved",
    {
      decisionId: decision.id,
      decisionType: decision.type,
      playerId: decision.playerId,
      responseType: action.response.type,
      selectedCount: selectedCards.length,
    },
    decision.visibility,
  );
  const resolved = events[0];
  if (resolved !== undefined) {
    resolved.causedBy = { type: "decision", decisionId: decision.id };
  }
  let nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: state.actionSeq + 1,
    eventJournal: [...state.eventJournal, ...events],
  };
  nextState = clearPendingDecision(nextState);

  const resumed = resumeSequenceFrameAfterHandSelection(
    nextState,
    decision,
    selectedCards,
    createSupportedTrashFromHandChoiceDecision,
  );
  if (resumed === undefined) {
    return null;
  }
  if (!resumed.ok) {
    return toEngineResult(state, [], [resumed.error], options);
  }
  return toEngineResult(
    resumed.state,
    [...events, ...resumed.events],
    undefined,
    options,
  );
};
