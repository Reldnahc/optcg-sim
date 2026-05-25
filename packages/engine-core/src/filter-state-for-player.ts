import type {
  CardInstance,
  CardSelectionCandidate,
  CardRef,
  ComputedGameView,
  EngineEvent,
  EventVisibility,
  GameState,
  InstanceId,
  LegalAction,
  OpponentVisibleState,
  PlayerId,
  PlayerState,
  PlayerView,
  PublicCardView,
  PublicDecision,
  PublicLegalAction,
  PublicPendingDecision,
  PublicRevealRecord,
  VisiblePlayerState,
} from "@optcg/types";

import { getLegalActions } from "./actions.js";
import { toCardRef, zonesEqual } from "./action-state.js";
import { computeView } from "./compute-view.js";

const toPublicCardView = (card: CardInstance): PublicCardView => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  owner: card.owner,
  controller: card.controller,
  zone: card.zone,
  attachedDonCount: card.attachedDon.length,
  ...(card.state === undefined ? {} : { state: card.state }),
  ...(card.turnPlayed === undefined ? {} : { turnPlayed: card.turnPlayed }),
});

const toBoardPublicCardView = (card: CardInstance): PublicCardView =>
  toPublicCardView(card);

const toPublicLifeView = (player: PlayerState) => ({
  count: player.life.length,
  faceUpCards: player.life
    .filter((lifeCard) => lifeCard.faceUp)
    .map((lifeCard) => toPublicCardView(lifeCard.card)),
});

const boardCardsForState = (state: GameState): CardInstance[] =>
  Object.values(state.players).flatMap((player) => [
    player.leader,
    ...player.characters,
  ]);

const viewPowerUnsupportedKeywords = new Set(["doubleAttack", "unblockable"]);

const hasComputableBoardPowerMetadata = (state: GameState): boolean => {
  const effectDefinitions = Object.values(
    state.cardManifest.effectDefinitions ?? {},
  );
  return boardCardsForState(state).every((card) => {
    const resolved = state.cardManifest.cards[card.cardId];
    if (resolved === undefined) return false;
    if (resolved.category !== "leader" && resolved.category !== "character") {
      return false;
    }
    if (resolved.power === undefined) return false;
    if (
      resolved.support.status !== "vanilla-confirmed" &&
      resolved.support.status !== "implemented-dsl"
    ) {
      return false;
    }
    if (
      resolved.printedKeywords.some((keyword) =>
        viewPowerUnsupportedKeywords.has(keyword),
      )
    ) {
      return false;
    }
    if (resolved.support.effectDefinitionId !== undefined) return false;
    return !effectDefinitions.some(
      (definition) => definition.cardId === card.cardId,
    );
  });
};

const computedPowerByInstance = (
  state: GameState,
): ReadonlyMap<InstanceId, number> | undefined => {
  if (!hasComputableBoardPowerMetadata(state)) {
    return undefined;
  }
  const view: ComputedGameView = computeView(state);
  return new Map<InstanceId, number>(
    Object.values(view.cards).flatMap((card) =>
      card.currentPower === undefined
        ? []
        : [[card.instanceId, card.currentPower] as const],
    ),
  );
};

const toVisiblePlayerState = (player: PlayerState): VisiblePlayerState => ({
  playerId: player.playerId,
  deckCount: player.deck.length,
  donDeckCount: player.donDeck.length,
  hand: player.hand.map((card) => toPublicCardView(card)),
  trash: player.trash.map((card) => toPublicCardView(card)),
  leader: toBoardPublicCardView(player.leader),
  characters: player.characters.map((card) => toBoardPublicCardView(card)),
  ...(player.stage === undefined
    ? {}
    : { stage: toPublicCardView(player.stage) }),
  costArea: player.costArea.map((card) => toPublicCardView(card)),
  life: toPublicLifeView(player),
  hasMulliganed: player.hasMulliganed,
  turnCount: player.turnCount,
});

const toOpponentVisibleState = (player: PlayerState): OpponentVisibleState => ({
  playerId: player.playerId,
  deckCount: player.deck.length,
  donDeckCount: player.donDeck.length,
  handCount: player.hand.length,
  trash: player.trash.map((card) => toPublicCardView(card)),
  leader: toBoardPublicCardView(player.leader),
  characters: player.characters.map((card) => toBoardPublicCardView(card)),
  ...(player.stage === undefined
    ? {}
    : { stage: toPublicCardView(player.stage) }),
  costArea: player.costArea.map((card) => toPublicCardView(card)),
  life: toPublicLifeView(player),
  hasMulliganed: player.hasMulliganed,
  turnCount: player.turnCount,
});

const isEventVisibleToPlayer = (
  event: EngineEvent,
  playerId: PlayerId,
): boolean =>
  event.visibility.type === "public" ||
  (event.visibility.type === "private" &&
    event.visibility.playerId === playerId);

const toPlayerEventCausedBy = (
  causedBy: EngineEvent["causedBy"],
): EngineEvent["causedBy"] | undefined => {
  if (
    causedBy === undefined ||
    causedBy.type === "effect" ||
    "queueEntryId" in causedBy
  ) {
    return undefined;
  }
  return causedBy;
};

const toPublicDecisionCausedBy = (
  pending: NonNullable<GameState["pendingDecision"]>,
): PublicDecision["causedBy"] => {
  const causedBy = pending.causedBy;
  if (
    pending.type !== "selectTargets" &&
    pending.type !== "selectCards" &&
    pending.type !== "chooseOptionalActivation" &&
    pending.type !== "chooseReplacement" &&
    pending.type !== "chooseQuantity" &&
    pending.type !== "orderCards"
  ) {
    return causedBy;
  }
  if (causedBy.type === "effect" || "queueEntryId" in causedBy) {
    return { type: "ruleProcess", name: "privateCausality" };
  }
  return causedBy;
};

const isVisibleToPlayer = (
  visibility: EventVisibility,
  playerId: PlayerId,
): boolean =>
  visibility.type === "public" ||
  (visibility.type === "private" && visibility.playerId === playerId);

const toPublicCardCandidates = (
  candidates: readonly CardSelectionCandidate[],
  playerId: PlayerId,
): Array<Pick<CardSelectionCandidate, "card">> =>
  candidates
    .filter((candidate) => isVisibleToPlayer(candidate.visibility, playerId))
    .map((candidate) => ({ card: candidate.card }));

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;

const toAllowedZoneRef = (
  value: unknown,
): Record<string, string | number> | undefined => {
  const zoneRef = asRecord(value);
  if (zoneRef === undefined || typeof zoneRef["zone"] !== "string") {
    return undefined;
  }
  const playerId = zoneRef["playerId"];
  const index = zoneRef["index"];
  const slot = zoneRef["slot"];
  return {
    zone: zoneRef["zone"],
    ...(typeof playerId === "string" ? { playerId } : {}),
    ...(typeof index === "number" ? { index } : {}),
    ...(typeof slot === "string" ? { slot } : {}),
  };
};

const toAllowedRevealCard = (
  value: unknown,
): Record<string, unknown> | null => {
  const card = asRecord(value);
  if (card === undefined) {
    return null;
  }
  const instanceId = card["instanceId"];
  const cardId = card["cardId"];
  const playerId = card["playerId"];
  if (
    typeof instanceId !== "string" ||
    typeof cardId !== "string" ||
    typeof playerId !== "string"
  ) {
    return null;
  }
  const zone = toAllowedZoneRef(card["zone"]);
  return {
    instanceId,
    cardId,
    playerId,
    ...(zone === undefined ? {} : { zone }),
  };
};

const pickStringPayloadFields = (
  payload: Record<string, unknown>,
  fields: readonly string[],
): Record<string, string> =>
  Object.fromEntries(
    fields.flatMap((field) => {
      const value = payload[field];
      return typeof value === "string" ? [[field, value] as const] : [];
    }),
  );

const toAllowedPlayerEventPayload = (event: EngineEvent): unknown => {
  const payload = asRecord(event.payload);
  if (payload === undefined) {
    return {};
  }
  if (event.type === "decisionCreated") {
    return pickStringPayloadFields(payload, [
      "decisionId",
      "decisionType",
      "playerId",
      "prompt",
    ]);
  }
  if (event.type === "decisionResolved") {
    const base = pickStringPayloadFields(payload, [
      "decisionId",
      "decisionType",
      "playerId",
      "responseType",
      "status",
    ]);
    const selectedCount = payload["selectedCount"];
    return {
      ...base,
      ...(typeof selectedCount === "number" ? { selectedCount } : {}),
    };
  }
  if (event.type === "damageDealt") {
    return typeof payload["amount"] === "number"
      ? { amount: payload["amount"] }
      : {};
  }
  if (event.type === "cardRevealed") {
    const revealCards = payload["cards"];
    if (Array.isArray(revealCards)) {
      const cards = revealCards.flatMap((card) => {
        const allowed = toAllowedRevealCard(card);
        return allowed === null ? [] : [allowed];
      });
      const revealId = payload["revealId"];
      const origin = payload["origin"];
      const selectionSetId = payload["selectionSetId"];
      return {
        ...(typeof revealId === "string" ? { revealId } : {}),
        cards,
        ...(typeof origin === "string" ? { origin } : {}),
        ...(typeof selectionSetId === "string" ? { selectionSetId } : {}),
      };
    }
    const playerId = payload["playerId"];
    const instanceId = payload["instanceId"];
    const cardId = payload["cardId"];
    if (
      typeof playerId === "string" &&
      typeof instanceId === "string" &&
      typeof cardId === "string"
    ) {
      return { playerId, instanceId, cardId };
    }
    return {};
  }
  return {};
};

const toPlayerEvent = (event: EngineEvent): EngineEvent => {
  const causedBy = toPlayerEventCausedBy(event.causedBy);
  const base = {
    id: event.id,
    seq: event.seq,
    type: event.type,
    ...(event.actor === undefined ? {} : { actor: event.actor }),
    ...(event.source === undefined ? {} : { source: event.source }),
    ...(event.affected === undefined ? {} : { affected: event.affected }),
    visibility: event.visibility,
    createdAtStateSeq: event.createdAtStateSeq,
    ...(causedBy === undefined ? {} : { causedBy }),
  };

  if (event.type === "effectQueued") {
    return { ...base, payload: { status: "queued" } };
  }
  if (event.type === "effectResolved") {
    return { ...base, payload: { status: "resolved" } };
  }
  return { ...base, payload: toAllowedPlayerEventPayload(event) };
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const shouldIncludePlayerEvent = (
  state: GameState,
  event: EngineEvent,
): boolean => {
  if (event.type !== "cardRevealed" || !isObjectRecord(event.payload)) {
    return true;
  }
  const revealId = event.payload["revealId"];
  const selectionSetId = event.payload["selectionSetId"];
  if (
    typeof revealId !== "string" ||
    typeof selectionSetId !== "string" ||
    !selectionSetId.startsWith("set:search-reveal:")
  ) {
    return true;
  }
  return state.revealedCards.some((record) => record.id === revealId);
};

const toPublicDecision = (
  state: GameState,
  playerId: PlayerId,
): PublicPendingDecision | undefined => {
  const pending = state.pendingDecision;
  if (pending === undefined || pending.playerId !== playerId) {
    return undefined;
  }
  const base = {
    id: pending.id,
    type: pending.type,
    playerId: pending.playerId,
    prompt: pending.prompt,
    causedBy: toPublicDecisionCausedBy(pending),
    ...(pending.timeoutMs === undefined
      ? {}
      : { timeoutMs: pending.timeoutMs }),
  };
  if (pending.type === "chooseQuantity") {
    return {
      ...base,
      type: "chooseQuantity",
      mode: pending.mode,
      min: pending.min,
      max: pending.max,
    };
  }
  if (pending.type === "selectCards") {
    return {
      ...base,
      type: "selectCards",
      min: pending.request.min,
      max: pending.request.max,
      candidates: toPublicCardCandidates(pending.candidates, playerId),
    };
  }
  if (pending.type === "orderCards") {
    return {
      ...base,
      type: "orderCards",
      cards: [...pending.cards],
      destination: pending.destination,
    };
  }
  return { ...base, type: pending.type };
};

type LocatedVisibleCard = {
  card: CardInstance;
  playerId: PlayerId;
};

const visibleCardsForPlayer = (
  state: GameState,
  playerId: PlayerId,
): LocatedVisibleCard[] => {
  const self = state.players[playerId];
  if (self === undefined) {
    return [];
  }
  const opponentId = (Object.keys(state.players) as PlayerId[]).find(
    (id) => id !== playerId,
  );
  const opponent =
    opponentId === undefined ? undefined : state.players[opponentId];

  const visible: LocatedVisibleCard[] = [
    ...self.hand.map((card) => ({ card, playerId: self.playerId })),
    ...self.trash.map((card) => ({ card, playerId: self.playerId })),
    { card: self.leader, playerId: self.playerId },
    ...self.characters.map((card) => ({ card, playerId: self.playerId })),
    ...self.costArea.map((card) => ({ card, playerId: self.playerId })),
    ...self.life
      .filter((lifeCard) => lifeCard.faceUp)
      .map((lifeCard) => ({ card: lifeCard.card, playerId: self.playerId })),
  ];

  if (self.stage !== undefined) {
    visible.push({ card: self.stage, playerId: self.playerId });
  }

  if (opponent !== undefined) {
    visible.push(
      ...opponent.trash.map((card) => ({ card, playerId: opponent.playerId })),
      { card: opponent.leader, playerId: opponent.playerId },
      ...opponent.characters.map((card) => ({
        card,
        playerId: opponent.playerId,
      })),
      ...opponent.costArea.map((card) => ({
        card,
        playerId: opponent.playerId,
      })),
      ...opponent.life
        .filter((lifeCard) => lifeCard.faceUp)
        .map((lifeCard) => ({
          card: lifeCard.card,
          playerId: opponent.playerId,
        })),
    );
    if (opponent.stage !== undefined) {
      visible.push({ card: opponent.stage, playerId: opponent.playerId });
    }
  }

  return visible;
};

const findSelfHandCardRef = (
  state: GameState,
  playerId: PlayerId,
  instanceId: CardInstance["instanceId"],
): CardRef | undefined => {
  const player = state.players[playerId];
  const card = player?.hand.find(
    (candidate) => candidate.instanceId === instanceId,
  );
  return card === undefined ? undefined : toCardRef(card, playerId);
};

const findSelfCostAreaCardRef = (
  state: GameState,
  playerId: PlayerId,
  instanceId: CardInstance["instanceId"],
): CardRef | undefined => {
  const player = state.players[playerId];
  const card = player?.costArea.find(
    (candidate) => candidate.instanceId === instanceId,
  );
  return card === undefined ? undefined : toCardRef(card, playerId);
};

const zoneMatchesIfPresent = (
  expected: CardRef["zone"],
  actual: CardRef["zone"],
): boolean =>
  expected === undefined ||
  (actual !== undefined && zonesEqual(actual, expected));

const isCardRefVisibleToPlayer = (
  state: GameState,
  playerId: PlayerId,
  ref: CardRef,
): boolean =>
  visibleCardsForPlayer(state, playerId).some(
    ({ card, playerId: visiblePlayerId }) =>
      ref.instanceId === card.instanceId &&
      ref.cardId === card.cardId &&
      ref.playerId === visiblePlayerId &&
      zoneMatchesIfPresent(ref.zone, card.zone),
  );

const toPublicLegalAction = (
  state: GameState,
  playerId: PlayerId,
  action: LegalAction,
): PublicLegalAction | undefined => {
  switch (action.type) {
    case "concede":
      return action;
    case "endMainPhase":
      return action;
    case "respondToDecision":
      return { type: "respondToDecision", decisionId: action.decisionId };
    case "declareAttack":
      if (
        !isCardRefVisibleToPlayer(state, playerId, action.attacker) ||
        !isCardRefVisibleToPlayer(state, playerId, action.target)
      ) {
        return undefined;
      }
      return {
        type: "declareAttack",
        attacker: action.attacker,
        target: action.target,
      };
    case "activateBlocker":
      if (!isCardRefVisibleToPlayer(state, playerId, action.blocker)) {
        return undefined;
      }
      return { type: "activateBlocker", blocker: action.blocker };
    case "activateEffect":
      if (!isCardRefVisibleToPlayer(state, playerId, action.source)) {
        return undefined;
      }
      return {
        type: "activateEffect",
        source: action.source,
        effectId: action.effectId,
      };
    case "attachDon": {
      const don = findSelfCostAreaCardRef(
        state,
        playerId,
        action.donInstanceId,
      );
      if (don === undefined) return undefined;
      if (!isCardRefVisibleToPlayer(state, playerId, action.target)) {
        return undefined;
      }
      return { type: "attachDon", don, target: action.target };
    }
    case "useCounter": {
      const card = findSelfHandCardRef(state, playerId, action.cardInstanceId);
      if (card === undefined) return undefined;
      if (!isCardRefVisibleToPlayer(state, playerId, action.target)) {
        return undefined;
      }
      return { type: "useCounter", card, target: action.target };
    }
    case "playCard": {
      const card = findSelfHandCardRef(state, playerId, action.cardInstanceId);
      if (card === undefined) return undefined;
      return {
        type: "playCard",
        card,
        costPaymentRequired: action.costPayment !== undefined,
      };
    }
    default:
      return undefined;
  }
};

const publicLegalActionKey = (action: PublicLegalAction): string => {
  if (action.type === "respondToDecision") {
    return `${action.type}:${String(action.decisionId)}`;
  }
  return JSON.stringify(action);
};

const dedupePublicLegalActions = (
  actions: PublicLegalAction[],
): PublicLegalAction[] => {
  const seen = new Set<string>();
  const deduped: PublicLegalAction[] = [];
  for (const action of actions) {
    const key = publicLegalActionKey(action);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(action);
  }
  return deduped;
};

const toPublicRevealRecord = (
  state: GameState,
  playerId: PlayerId,
): PublicRevealRecord[] => {
  const runtimeRecords: PublicRevealRecord[] = state.revealedCards
    .filter(
      (record) =>
        record.visibility.type === "public" ||
        (record.visibility.type === "private" &&
          record.visibility.playerId === playerId),
    )
    .map((record) => ({
      id: record.id,
      cards: [...record.cards],
      visibility:
        record.visibility.type === "public" ? "public" : "privateToRecipient",
      origin: record.origin,
      createdAtStateSeq: record.createdAtStateSeq,
      cleanupPolicy: record.cleanupPolicy,
    }));
  const pending = state.pendingDecision;
  const setupCandidateRecord: PublicRevealRecord[] =
    pending !== undefined &&
    pending.type === "selectCards" &&
    pending.playerId === playerId &&
    pending.request.set !== undefined &&
    String(pending.request.set).startsWith("set:setup-start-of-game:")
      ? [
          {
            id: `reveal:setup-start-of-game:${String(pending.id)}`,
            cards: pending.candidates
              .filter(
                (candidate) =>
                  candidate.visibility.type === "private" &&
                  candidate.visibility.playerId === playerId,
              )
              .map((candidate) => candidate.card),
            visibility: "privateToRecipient",
            origin: "topOfDeck" as const,
            createdAtStateSeq: state.seq,
            cleanupPolicy: "none",
          },
        ]
      : [];
  return [...runtimeRecords, ...setupCandidateRecord];
};

export const filterStateForPlayer = (
  state: GameState,
  playerId: PlayerId,
): PlayerView => {
  const selfState = state.players[playerId];
  if (selfState === undefined) {
    throw new TypeError(`Player ${String(playerId)} not found in state.`);
  }
  const opponentId = (Object.keys(state.players) as PlayerId[]).find(
    (id) => id !== playerId,
  );
  if (opponentId === undefined) {
    throw new TypeError("Expected exactly two players in state.");
  }
  const opponentState = state.players[opponentId];
  if (opponentState === undefined) {
    throw new TypeError(`Opponent ${String(opponentId)} not found in state.`);
  }

  const turn: PlayerView["turn"] = {
    globalTurn: state.turn.globalTurn,
    playerTurnCounts: state.turn.playerTurnCounts,
    turnPlayerId: state.turn.turnPlayerId,
    phase: state.turn.phase,
    ...(state.turn.step === undefined ? {} : { step: state.turn.step }),
  };

  const battle: PlayerView["battle"] =
    state.battle === undefined
      ? undefined
      : {
          attacker: state.battle.attacker,
          originalTarget: state.battle.originalTarget,
          currentTarget: state.battle.currentTarget,
          ...(state.battle.blocker === undefined
            ? {}
            : { blocker: state.battle.blocker }),
          step: state.battle.step,
          damageCount: state.battle.damageCount,
        };

  const timers: PlayerView["timers"] = {
    players: Object.fromEntries(
      (Object.keys(state.timers.players) as PlayerId[]).map((id) => {
        const timer = state.timers.players[id];
        if (timer === undefined) {
          throw new TypeError(`Missing timer for player ${String(id)}.`);
        }
        return [
          id,
          { remainingMs: timer.remainingMs, isRunning: timer.isRunning },
        ];
      }),
    ),
    ...(state.timers.drainingPlayerId === undefined
      ? {}
      : { activePlayerId: state.timers.drainingPlayerId }),
  };

  const pendingDecision = toPublicDecision(state, playerId);
  // Keep computeView validation fail-closed for unsupported board-power metadata.
  computedPowerByInstance(state);

  return {
    matchId: state.matchId,
    playerId,
    stateSeq: state.seq,
    actionSeq: state.actionSeq,
    turn,
    self: toVisiblePlayerState(selfState),
    opponent: toOpponentVisibleState(opponentState),
    ...(battle === undefined ? {} : { battle }),
    ...(pendingDecision === undefined ? {} : { pendingDecision }),
    legalActions: dedupePublicLegalActions([
      ...getLegalActions(state, playerId)
        .map((action) => toPublicLegalAction(state, playerId, action))
        .filter((action): action is PublicLegalAction => action !== undefined),
    ]),
    revealedCards: toPublicRevealRecord(state, playerId),
    events: state.eventJournal
      .filter((event) => isEventVisibleToPlayer(event, playerId))
      .filter((event) => shouldIncludePlayerEvent(state, event))
      .map(toPlayerEvent),
    timers,
  };
};
