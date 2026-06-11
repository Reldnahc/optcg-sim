import type {
  CardInstance,
  CardSelectionCandidate,
  CardRef,
  GameState,
  InstanceId,
  LegalAction,
  OpponentVisibleState,
  PlayerId,
  PlayerState,
  PlayerView,
  PublicChooseTriggerOrderDecision,
  PublicDecision,
  PublicLegalAction,
  PublicPendingDecision,
  PublicRevealRecord,
  PublicSelectCardsDecision,
  VisiblePlayerState,
} from "@optcg/types";

import { getLegalActions } from "../actions.js";
import { toCardRef, zonesEqual } from "../actions/state.js";
import {
  isEventVisibleToPlayer,
  isVisibleToPlayer,
  toPlayerEventForView,
} from "./filter-state-events.js";
import {
  computedBoardCardStatsByInstance,
  toBoardPublicCardView,
  toPublicCardView,
  toPublicLifeView,
} from "./public-card-view.js";
import type { ComputedBoardCardStats } from "./public-card-view.js";
import {
  publicDecisionActiveEffectTextFromEffectQueue,
  publicDecisionSourceFromEffectQueue,
} from "./public-decision-source.js";
import { publicDecisionPresentation } from "./public-decision-presentation.js";
import { toPublicTimerState } from "./public-timers.js";
import { playerRestrictionLabels } from "./player-restrictions.js";

const toVisiblePlayerState = (
  state: GameState,
  player: PlayerState,
  computedStatsByInstance:
    | ReadonlyMap<InstanceId, ComputedBoardCardStats>
    | undefined,
): VisiblePlayerState => {
  const restrictions = playerRestrictionLabels(state, player.playerId);
  return {
    playerId: player.playerId,
    deckCount: player.deck.length,
    donDeckCount: player.donDeck.length,
    hand: player.hand.map((card) => toPublicCardView(card)),
    trash: player.trash.map((card) => toPublicCardView(card)),
    leader: toBoardPublicCardView(
      player.leader,
      state,
      computedStatsByInstance,
    ),
    characters: player.characters.map((card) =>
      toBoardPublicCardView(card, state, computedStatsByInstance),
    ),
    ...(player.stage === undefined
      ? {}
      : { stage: toPublicCardView(player.stage) }),
    costArea: player.costArea.map((card) => toPublicCardView(card)),
    life: toPublicLifeView(player),
    hasMulliganed: player.hasMulliganed,
    turnCount: player.turnCount,
    ...(restrictions.length === 0 ? {} : { restrictions }),
  };
};

const toOpponentVisibleState = (
  state: GameState,
  player: PlayerState,
  computedStatsByInstance:
    | ReadonlyMap<InstanceId, ComputedBoardCardStats>
    | undefined,
): OpponentVisibleState => {
  const restrictions = playerRestrictionLabels(state, player.playerId);
  return {
    playerId: player.playerId,
    deckCount: player.deck.length,
    donDeckCount: player.donDeck.length,
    handCount: player.hand.length,
    trash: player.trash.map((card) => toPublicCardView(card)),
    leader: toBoardPublicCardView(
      player.leader,
      state,
      computedStatsByInstance,
    ),
    characters: player.characters.map((card) =>
      toBoardPublicCardView(card, state, computedStatsByInstance),
    ),
    ...(player.stage === undefined
      ? {}
      : { stage: toPublicCardView(player.stage) }),
    costArea: player.costArea.map((card) => toPublicCardView(card)),
    life: toPublicLifeView(player),
    hasMulliganed: player.hasMulliganed,
    turnCount: player.turnCount,
    ...(restrictions.length === 0 ? {} : { restrictions }),
  };
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

const toPublicCardCandidates = (
  candidates: readonly CardSelectionCandidate[],
  playerId: PlayerId,
): Array<Pick<CardSelectionCandidate, "card">> =>
  candidates
    .filter((candidate) => isVisibleToPlayer(candidate.visibility, playerId))
    .map((candidate) => ({ card: candidate.card }));

const revealRecordForSelectionSet = (state: GameState, setId: string) => {
  for (let index = state.revealedCards.length - 1; index >= 0; index -= 1) {
    const record = state.revealedCards[index];
    if (record?.selectionSetId === setId) {
      return record;
    }
  }
  return undefined;
};

const cardRefKey = (card: CardRef): string => String(card.instanceId);

const visibleChoiceCardsForSelectDecision = (
  state: GameState,
  playerId: PlayerId,
  pending: Extract<
    NonNullable<GameState["pendingDecision"]>,
    { type: "selectCards" }
  >,
): CardRef[] => {
  const set = pending.request.set;
  if (set !== undefined) {
    const reveal = revealRecordForSelectionSet(state, String(set));
    if (
      reveal !== undefined &&
      isVisibleToPlayer(reveal.visibility, playerId)
    ) {
      return [...reveal.cards];
    }
  }
  return pending.candidates
    .filter((candidate) => isVisibleToPlayer(candidate.visibility, playerId))
    .map((candidate) => candidate.card);
};

const toPublicCardChoices = (
  state: GameState,
  playerId: PlayerId,
  pending: Extract<
    NonNullable<GameState["pendingDecision"]>,
    { type: "selectCards" }
  >,
): Array<Pick<CardSelectionCandidate, "card"> & { selectable: boolean }> => {
  const legalCardKeys = new Set(
    pending.candidates
      .filter((candidate) => isVisibleToPlayer(candidate.visibility, playerId))
      .map((candidate) => cardRefKey(candidate.card)),
  );
  return visibleChoiceCardsForSelectDecision(state, playerId, pending).map(
    (card) => ({ card, selectable: legalCardKeys.has(cardRefKey(card)) }),
  );
};

const toPublicSelectCardsSelectionConstraint = (
  state: GameState,
  playerId: PlayerId,
  pending: Extract<
    NonNullable<GameState["pendingDecision"]>,
    { type: "selectCards" }
  >,
): PublicSelectCardsDecision["selectionConstraint"] | undefined => {
  if (pending.request.filter?.custom !== "differentNames") {
    return undefined;
  }
  return {
    type: "differentNames",
    groupKeysByInstanceId: Object.fromEntries(
      visibleChoiceCardsForSelectDecision(state, playerId, pending).map(
        (card) => [
          String(card.instanceId),
          state.cardManifest.cards[card.cardId]?.name ?? String(card.cardId),
        ],
      ),
    ),
  };
};

const toPublicDecision = (
  state: GameState,
  playerId: PlayerId,
): PublicPendingDecision | undefined => {
  const pending = state.pendingDecision;
  if (pending === undefined || pending.playerId !== playerId) {
    return undefined;
  }
  const visibleCards = visibleCardsForPlayer(state, playerId);
  const source = publicDecisionSourceFromEffectQueue({
    state,
    pending,
    visibleCards,
  });
  const activeEffectText = publicDecisionActiveEffectTextFromEffectQueue({
    state,
    pending,
    visibleCards,
  });
  const presentation = publicDecisionPresentation({
    pending,
    ...(source === undefined ? {} : { source }),
    ...(activeEffectText === undefined ? {} : { activeEffectText }),
  });
  const defaultResponseLabel =
    pending.type === "selectCards" &&
    String(pending.id).startsWith("decision:counterStep:pass:") &&
    pending.defaultResponse?.type === "cards" &&
    pending.defaultResponse.cards.length === 0 &&
    pending.request.min === 0 &&
    pending.request.max === 0
      ? "End step"
      : undefined;
  const publicPresentation =
    defaultResponseLabel === undefined
      ? presentation
      : {
          ...presentation,
          choices: [
            ...(presentation.choices ?? []),
            {
              responseKey: "default",
              label: defaultResponseLabel,
            },
          ],
        };
  const base = {
    id: pending.id,
    type: pending.type,
    playerId: pending.playerId,
    prompt: pending.prompt,
    causedBy: toPublicDecisionCausedBy(pending),
    presentation: publicPresentation,
    ...(source === undefined ? {} : { source }),
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
      choices: toPublicCardChoices(state, playerId, pending),
      ...(() => {
        const selectionConstraint = toPublicSelectCardsSelectionConstraint(
          state,
          playerId,
          pending,
        );
        return selectionConstraint === undefined ? {} : { selectionConstraint };
      })(),
    };
  }
  if (pending.type === "selectTargets") {
    return {
      ...base,
      type: "selectTargets",
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
      ...(pending.placement === undefined
        ? {}
        : { placement: pending.placement }),
    };
  }
  if (pending.type === "confirmLifeTrigger") {
    return {
      ...base,
      type: "confirmLifeTrigger",
      card: pending.card,
    };
  }
  if (pending.type === "chooseTriggerOrder") {
    const visibleByInstanceId = new Map(
      visibleCardsForPlayer(state, playerId).map((visible) => [
        visible.card.instanceId,
        visible,
      ]),
    );
    const queueById = new Map(
      state.effectQueue.map((entry) => [String(entry.id), entry]),
    );
    return {
      ...base,
      type: "chooseTriggerOrder",
      choices: pending.triggerIds.map((triggerId) => {
        const entry = queueById.get(triggerId);
        const visible =
          entry === undefined
            ? undefined
            : visibleByInstanceId.get(entry.source.instanceId);
        return {
          triggerId,
          ...(visible === undefined
            ? {}
            : { source: toCardRef(visible.card, visible.playerId) }),
        };
      }),
    } satisfies PublicChooseTriggerOrderDecision;
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
      return {
        type: "respondToDecision",
        decisionId: action.decisionId,
        ...(() => {
          const responseKey = responseKeyForDecisionAction(action);
          return responseKey === undefined ? {} : { responseKey };
        })(),
      };
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

const responseKeyForDecisionAction = (
  action: Extract<LegalAction, { type: "respondToDecision" }>,
): string | undefined => {
  const response = action.response;
  switch (response.type) {
    case "payment":
      return response.optionId;
    case "paymentDeclined":
      return "decline";
    case "optionalActivation":
      return response.choice;
    case "lifeTrigger":
      return response.choice;
    case "replacement":
      return response.replacementId ?? "decline";
    case "chooseQuantity":
      return String(response.quantity);
    case "effectOption":
      return response.optionId;
    case "effectOptionDeclined":
      return "decline";
    case "mulligan":
      return response.keep ? "keep" : "mulligan";
    case "loopCount":
      return String(response.count);
    case "rollbackConsent":
      return response.allow ? "allow" : "deny";
    case "cards":
    case "targets":
    case "orderedIds":
    case "topBottomPlacement":
      return undefined;
  }
};

const publicLegalActionKey = (action: PublicLegalAction): string => {
  if (action.type === "respondToDecision") {
    return `${action.type}:${String(action.decisionId)}:${
      action.responseKey ?? ""
    }`;
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
  options: { readonly includeLegalActions?: boolean } = {},
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

  const pendingDecision = toPublicDecision(state, playerId);
  const visibleDecisionCards = visibleCardsForPlayer(state, playerId);
  const activeEffectSource = state.pendingDecision
    ? publicDecisionSourceFromEffectQueue({
        state,
        pending: state.pendingDecision,
        visibleCards: visibleDecisionCards,
      })
    : undefined;
  const activeEffectText = state.pendingDecision
    ? publicDecisionActiveEffectTextFromEffectQueue({
        state,
        pending: state.pendingDecision,
        visibleCards: visibleDecisionCards,
      })
    : undefined;
  // Keep computeView validation fail-closed for unsupported board-power metadata.
  const computedStatsByInstance = computedBoardCardStatsByInstance(state);

  return {
    matchId: state.matchId,
    playerId,
    stateSeq: state.seq,
    actionSeq: state.actionSeq,
    turn,
    self: toVisiblePlayerState(state, selfState, computedStatsByInstance),
    opponent: toOpponentVisibleState(
      state,
      opponentState,
      computedStatsByInstance,
    ),
    ...(battle === undefined ? {} : { battle }),
    ...(pendingDecision === undefined ? {} : { pendingDecision }),
    ...(activeEffectSource === undefined
      ? {}
      : { activeEffectSources: [activeEffectSource] }),
    ...(activeEffectText === undefined ? {} : { activeEffectText }),
    legalActions:
      options.includeLegalActions === false
        ? []
        : dedupePublicLegalActions([
            ...getLegalActions(state, playerId)
              .map((action) => toPublicLegalAction(state, playerId, action))
              .filter(
                (action): action is PublicLegalAction => action !== undefined,
              ),
          ]),
    revealedCards: toPublicRevealRecord(state, playerId),
    events: state.eventJournal
      .filter((event) => isEventVisibleToPlayer(event, playerId))
      .map((event) => toPlayerEventForView(state, event)),
    timers: toPublicTimerState(state),
  };
};
