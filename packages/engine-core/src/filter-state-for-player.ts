import type {
  CardInstance,
  CardRef,
  ComputedGameView,
  EngineEvent,
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
  PublicRevealRecord,
  VisiblePlayerState,
} from "@optcg/types";

import { getLegalActions } from "./actions.js";
import { toCardRef, zonesEqual } from "./action-state.js";
import { computeView } from "./compute-view.js";

type PublicChooseReplacementDecision = PublicDecision &
  Pick<
    Extract<
      NonNullable<GameState["pendingDecision"]>,
      { type: "chooseReplacement" }
    >,
    "processId" | "replacementIds" | "mandatory"
  >;

const toPublicCardView = (
  card: CardInstance,
  currentPower?: number,
): PublicCardView => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  owner: card.owner,
  controller: card.controller,
  zone: card.zone,
  attachedDonCount: card.attachedDon.length,
  ...(card.state === undefined ? {} : { state: card.state }),
  ...(currentPower === undefined ? {} : { currentPower }),
  ...(card.turnPlayed === undefined ? {} : { turnPlayed: card.turnPlayed }),
});

const toBoardPublicCardView = (
  card: CardInstance,
  computedPowerByInstance: ReadonlyMap<InstanceId, number> | undefined,
): PublicCardView =>
  toPublicCardView(card, computedPowerByInstance?.get(card.instanceId));

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

const hasComputableBoardPowerMetadata = (state: GameState): boolean => {
  if (state.continuousEffects.length > 0) {
    return true;
  }

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

const toVisiblePlayerState = (
  player: PlayerState,
  computedPowers: ReadonlyMap<InstanceId, number> | undefined,
): VisiblePlayerState => ({
  playerId: player.playerId,
  deckCount: player.deck.length,
  donDeckCount: player.donDeck.length,
  hand: player.hand.map((card) => toPublicCardView(card)),
  trash: player.trash.map((card) => toPublicCardView(card)),
  leader: toBoardPublicCardView(player.leader, computedPowers),
  characters: player.characters.map((card) =>
    toBoardPublicCardView(card, computedPowers),
  ),
  ...(player.stage === undefined
    ? {}
    : { stage: toPublicCardView(player.stage) }),
  costArea: player.costArea.map((card) => toPublicCardView(card)),
  life: toPublicLifeView(player),
  hasMulliganed: player.hasMulliganed,
  turnCount: player.turnCount,
});

const toOpponentVisibleState = (
  player: PlayerState,
  computedPowers: ReadonlyMap<InstanceId, number> | undefined,
): OpponentVisibleState => ({
  playerId: player.playerId,
  deckCount: player.deck.length,
  donDeckCount: player.donDeck.length,
  handCount: player.hand.length,
  trash: player.trash.map((card) => toPublicCardView(card)),
  leader: toBoardPublicCardView(player.leader, computedPowers),
  characters: player.characters.map((card) =>
    toBoardPublicCardView(card, computedPowers),
  ),
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
    pending.type !== "chooseOptionalActivation" &&
    pending.type !== "chooseReplacement"
  ) {
    return causedBy;
  }
  if (causedBy.type === "effect" || "queueEntryId" in causedBy) {
    return { type: "ruleProcess", name: "privateCausality" };
  }
  return causedBy;
};

const playerEventPayloadForbiddenKeys = new Set([
  "queueEntryId",
  "effectBlockId",
  "triggerIds",
  "sourceSnapshot",
  "orderedIds",
  "sourcePresencePolicy",
  "orderingGroup",
  "generation",
]);

const toPlayerEventPayload = (payload: unknown): unknown => {
  if (payload === null || payload === undefined) {
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map(toPlayerEventPayload);
  }
  if (typeof payload !== "object") {
    return payload;
  }

  const publicEntries = Object.entries(payload).flatMap(([key, value]) =>
    playerEventPayloadForbiddenKeys.has(key)
      ? []
      : [[key, toPlayerEventPayload(value)] as const],
  );
  return Object.fromEntries(publicEntries);
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
  return { ...base, payload: toPlayerEventPayload(event.payload) };
};

const toPublicDecision = (
  state: GameState,
  playerId: PlayerId,
): PublicDecision | PublicChooseReplacementDecision | undefined => {
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
  if (pending.type === "chooseReplacement") {
    return {
      ...base,
      processId: pending.processId,
      replacementIds: [...pending.replacementIds],
      mandatory: pending.mandatory,
    };
  }
  return base;
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
): PublicRevealRecord[] =>
  state.revealedCards
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
  const computedPowers = computedPowerByInstance(state);

  return {
    matchId: state.matchId,
    playerId,
    stateSeq: state.seq,
    actionSeq: state.actionSeq,
    turn,
    self: toVisiblePlayerState(selfState, computedPowers),
    opponent: toOpponentVisibleState(opponentState, computedPowers),
    ...(battle === undefined ? {} : { battle }),
    ...(pendingDecision === undefined ? {} : { pendingDecision }),
    legalActions: dedupePublicLegalActions(
      getLegalActions(state, playerId)
        .map((action) => toPublicLegalAction(state, playerId, action))
        .filter((action): action is PublicLegalAction => action !== undefined),
    ),
    revealedCards: toPublicRevealRecord(state, playerId),
    events: state.eventJournal
      .filter((event) => isEventVisibleToPlayer(event, playerId))
      .map(toPlayerEvent),
    timers,
  };
};
