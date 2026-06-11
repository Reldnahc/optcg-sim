import type {
  CardInstance,
  CardRef,
  CausalityRef,
  EffectQueueEntry,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
} from "@optcg/types";

import {
  appendEvent,
  createEvent,
  illegalAction,
  toEngineResult,
  toStateSeq,
} from "../action-results.js";
import { reindexZoneCards, toCardRef } from "../actions/state.js";
import { moveConcreteCardsToTrash } from "../concrete-card-movement.js";
import { assertGameStateInvariants } from "../state/invariants.js";
import { getCharacterOverflowDecisionId } from "./legal-actions.js";
import { applyRuleProcessingCheckpoint } from "../rules/rule-processing.js";
import {
  consumeMatchingPlayCostModifiers,
  type SupportedPlayMetadata,
} from "./support.js";

type ResolvePlayCardEffectRuntime = (
  previousState: GameState,
  nextState: GameState,
  events: EngineEvent[],
  sourceCard: CardInstance,
  supported: SupportedPlayMetadata,
) => EngineResult;

const createCharacterOverflowDecisionResult = (params: {
  state: GameState;
  events: EngineEvent[];
  playerId: PlayerId;
  player: GameState["players"][PlayerId];
  enteringCard: CardInstance;
  incrementActionSeq?: boolean;
  decisionIdOverride?: NonNullable<GameState["pendingDecision"]>["id"];
  causedBy?: CausalityRef;
  runtimePlaySelectedEnterRested?: boolean;
  runtimePlaySourceOverflow?: {
    source: CardRef;
    enterRested: boolean;
    queueEntryId: EffectQueueEntry["id"];
  };
}): EngineResult => {
  const {
    state,
    events,
    playerId,
    player,
    enteringCard,
    incrementActionSeq = true,
    decisionIdOverride,
    causedBy = {
      type: "playerAction",
      actionId: `action:${String(state.actionSeq + 1)}`,
    },
    runtimePlaySelectedEnterRested,
    runtimePlaySourceOverflow,
  } = params;
  const decisionId =
    decisionIdOverride ?? getCharacterOverflowDecisionId(state, enteringCard);
  const pendingDecision: NonNullable<GameState["pendingDecision"]> = {
    id: decisionId,
    type: "selectCards",
    playerId,
    prompt: `Choose a Character to trash for ${String(enteringCard.cardId)}`,
    causedBy,
    visibility: { type: "public" },
    request: {
      timing: "onActivation",
      chooser: "turnPlayer",
      player: "turnPlayer",
      zone: "characterArea",
      filter: { categories: ["character"] },
      min: 1,
      max: 1,
      allowFewerIfUnavailable: false,
      visibility: "public",
    },
    candidates: player.characters.map((character) => ({
      card: toCardRef(character, playerId),
      visibility: { type: "public" },
    })),
    ...(runtimePlaySelectedEnterRested === undefined &&
    runtimePlaySourceOverflow === undefined
      ? {}
      : {
          runtime: {
            ...(runtimePlaySelectedEnterRested === undefined
              ? {}
              : {
                  playSelectedOverflow: {
                    enterRested: runtimePlaySelectedEnterRested,
                  },
                }),
            ...(runtimePlaySourceOverflow === undefined
              ? {}
              : { playSourceOverflow: runtimePlaySourceOverflow }),
          },
        }),
  };
  appendEvent(
    state,
    events,
    "decisionCreated",
    { decisionId, decisionType: "selectCards", playerId },
    { type: "public" },
  );
  const nextState: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: incrementActionSeq ? state.actionSeq + 1 : state.actionSeq,
    pendingDecision,
    players: { ...state.players, [playerId]: player },
    eventJournal: [...state.eventJournal, ...events],
  };
  assertGameStateInvariants(nextState);
  return toEngineResult(nextState, events);
};

const createPlayedCard = (params: {
  state: GameState;
  handCard: CardInstance;
  playerId: PlayerId;
  category: Exclude<SupportedPlayMetadata["category"], "event">;
  characterIndex: number;
  enterRested?: boolean;
}): CardInstance => {
  const { state, handCard, playerId, category, characterIndex, enterRested } =
    params;
  const playedCardBase = {
    ...handCard,
    attachedDon: [] as CardInstance["attachedDon"],
  };
  return category === "character"
    ? {
        ...playedCardBase,
        turnPlayed: state.turn.globalTurn,
        zone: {
          zone: "characterArea",
          playerId,
          slot: "character",
          index: characterIndex,
        },
        state: enterRested === true ? "rested" : "active",
      }
    : {
        ...playedCardBase,
        zone: { zone: "stageArea", playerId, slot: "stage", index: 0 },
        state: enterRested === true ? "rested" : "active",
      };
};

export const placePlayedCardResult = (params: {
  state: GameState;
  events: EngineEvent[];
  playerId: PlayerId;
  player: GameState["players"][PlayerId];
  sourceIndex: number;
  sourceCard: CardInstance;
  sourceZone?: "hand" | "trash" | "deck" | "noZone";
  supported: SupportedPlayMetadata;
  costArea: CardInstance[];
  selectedOverflowCharacterIndex?: number;
  characterOverflowDecisionIdOverride?: NonNullable<
    GameState["pendingDecision"]
  >["id"];
  characterOverflowCausedBy?: CausalityRef;
  enterRested?: boolean;
  runtimePlaySelectedEnterRested?: boolean;
  runtimePlaySourceOverflow?: {
    source: CardRef;
    enterRested: boolean;
    queueEntryId: EffectQueueEntry["id"];
  };
  resolveOnPlayRuntime?: boolean;
  resolvePlayCardEffectRuntime?: ResolvePlayCardEffectRuntime;
  incrementActionSeq?: boolean;
}): EngineResult => {
  const {
    state,
    events,
    playerId,
    player,
    sourceIndex,
    sourceCard,
    sourceZone = "hand",
    supported,
    costArea,
    selectedOverflowCharacterIndex,
    characterOverflowDecisionIdOverride,
    characterOverflowCausedBy,
    enterRested,
    runtimePlaySelectedEnterRested,
    runtimePlaySourceOverflow,
    resolveOnPlayRuntime = true,
    resolvePlayCardEffectRuntime,
    incrementActionSeq = true,
  } = params;
  if (
    supported.category === "character" &&
    selectedOverflowCharacterIndex === undefined &&
    player.characters.length >= 5
  ) {
    return createCharacterOverflowDecisionResult({
      state,
      events,
      playerId,
      player,
      enteringCard: sourceCard,
      incrementActionSeq,
      ...(characterOverflowDecisionIdOverride === undefined
        ? {}
        : { decisionIdOverride: characterOverflowDecisionIdOverride }),
      ...(characterOverflowCausedBy === undefined
        ? {}
        : { causedBy: characterOverflowCausedBy }),
      ...(runtimePlaySelectedEnterRested === undefined
        ? {}
        : { runtimePlaySelectedEnterRested }),
      ...(runtimePlaySourceOverflow === undefined
        ? {}
        : { runtimePlaySourceOverflow }),
    });
  }

  const nextHand =
    sourceZone === "hand"
      ? reindexZoneCards(
          player.hand.filter((_, index) => index !== sourceIndex),
          "hand",
          playerId,
          "hand",
        )
      : player.hand;
  const nextDeck =
    sourceZone === "deck"
      ? reindexZoneCards(
          player.deck.filter((_, index) => index !== sourceIndex),
          "deck",
          playerId,
          "deck",
        )
      : player.deck;

  let nextCharacters = player.characters;
  let nextTrash =
    sourceZone === "trash"
      ? reindexZoneCards(
          player.trash.filter((_, index) => index !== sourceIndex),
          "trash",
          playerId,
          "trash",
        )
      : player.trash;
  let nextCostArea = costArea;
  if (supported.category === "event") {
    const movedResult = moveConcreteCardsToTrash(state, events, [sourceCard], {
      cardMovedPayloadShape: "zoneRefs",
      cardMovedVisibility: { type: "public" },
      cardTrashedVisibility: { type: "public" },
      clearAttachedDon: true,
      emitCardTrashed: true,
      includeCardIdentityInCardMoved: true,
      playerId,
      reason: "playCard",
      sourceZone: "hand",
    });
    const movedPlayer = movedResult.state.players[playerId];
    if (movedPlayer === undefined) {
      return illegalAction(state, "playCard player does not exist.");
    }
    const nextPlayer = {
      ...movedPlayer,
      costArea: nextCostArea,
    };
    appendEvent(
      state,
      events,
      "cardPlayed",
      {
        playerId,
        instanceId: sourceCard.instanceId,
        cardId: sourceCard.cardId,
        category: supported.category,
        sourceZone,
      },
      { type: "public" },
    );
    const nextStateBase: GameState = {
      ...movedResult.state,
      seq: toStateSeq(state.seq + 1),
      actionSeq: state.actionSeq + 1,
      players: { ...state.players, [playerId]: nextPlayer },
      continuousEffects: consumeMatchingPlayCostModifiers(
        state,
        playerId,
        sourceCard,
      ),
    };
    delete nextStateBase.pendingDecision;
    const nextState = applyRuleProcessingCheckpoint({
      state: nextStateBase,
      events,
      phase: "main",
      createEvent: (seqOffset, type, payload, visibility) =>
        createEvent(state, seqOffset, type, payload, visibility),
    });
    nextState.eventJournal = [...state.eventJournal, ...events];
    assertGameStateInvariants(nextState);
    if (resolvePlayCardEffectRuntime === undefined) {
      return illegalAction(
        state,
        "playCard runtime resolver is required for Event runtime.",
      );
    }
    return resolvePlayCardEffectRuntime(
      state,
      nextState,
      events,
      sourceCard,
      supported,
    );
  }

  if (
    supported.category === "character" &&
    selectedOverflowCharacterIndex !== undefined
  ) {
    const overflowCharacter = player.characters[selectedOverflowCharacterIndex];
    if (overflowCharacter === undefined) {
      return illegalAction(state, "Overflow Character selection is stale.");
    }
    const attachedDonIds = new Set(overflowCharacter.attachedDon);
    nextCostArea = costArea.map((card) =>
      attachedDonIds.has(card.instanceId)
        ? { ...card, state: "rested" as const }
        : card,
    );
    const movedResult = moveConcreteCardsToTrash(
      {
        ...state,
        players: {
          ...state.players,
          [playerId]: {
            ...player,
            costArea: nextCostArea,
            hand: nextHand,
            deck: nextDeck,
            trash: nextTrash,
          },
        },
      },
      events,
      [overflowCharacter],
      {
        cardMovedPayloadShape: "zoneRefs",
        cardMovedVisibility: { type: "public" },
        cardTrashedVisibility: { type: "public" },
        clearAttachedDon: true,
        emitCardTrashed: true,
        includeCardIdentityInCardMoved: true,
        playerId,
        reason: "ruleProcessCharacterOverflow",
        sourceZone: "characterArea",
      },
    );
    const movedPlayer = movedResult.state.players[playerId];
    if (movedPlayer === undefined) {
      return illegalAction(state, "Overflow player does not exist.");
    }
    nextCharacters = movedPlayer.characters;
    nextTrash = movedPlayer.trash;
    for (const donId of overflowCharacter.attachedDon) {
      appendEvent(
        state,
        events,
        "donReturned",
        { playerId, donInstanceId: donId, state: "rested" },
        { type: "replayOnly" },
      );
    }
  }

  if (supported.category === "stage" && player.stage !== undefined) {
    if (player.stage.attachedDon.length > 0) {
      return illegalAction(
        state,
        "Stage replacement with attached DON!! is unsupported.",
      );
    }
    const movedResult = moveConcreteCardsToTrash(
      {
        ...state,
        players: {
          ...state.players,
          [playerId]: {
            ...player,
            costArea: nextCostArea,
            hand: nextHand,
            deck: nextDeck,
            trash: nextTrash,
          },
        },
      },
      events,
      [player.stage],
      {
        cardMovedPayloadShape: "zoneRefs",
        cardMovedVisibility: { type: "public" },
        cardTrashedVisibility: { type: "public" },
        emitCardTrashed: true,
        includeCardIdentityInCardMoved: true,
        playerId,
        reason: "ruleProcessStageReplacement",
        sourceZone: "stageArea",
      },
    );
    const movedPlayer = movedResult.state.players[playerId];
    if (movedPlayer === undefined) {
      return illegalAction(state, "Stage replacement player does not exist.");
    }
    nextTrash = movedPlayer.trash;
  }

  const playedCard = createPlayedCard({
    state,
    handCard: sourceCard,
    playerId,
    category: supported.category,
    characterIndex: nextCharacters.length,
    ...(enterRested === undefined ? {} : { enterRested }),
  });
  const nextPlayer =
    supported.category === "character"
      ? {
          ...player,
          costArea: nextCostArea,
          hand: nextHand,
          deck: nextDeck,
          characters: [...nextCharacters, playedCard],
          trash: nextTrash,
        }
      : {
          ...player,
          costArea: nextCostArea,
          hand: nextHand,
          deck: nextDeck,
          stage: playedCard,
          trash: nextTrash,
        };
  appendEvent(
    state,
    events,
    "cardMoved",
    {
      instanceId: sourceCard.instanceId,
      cardId: sourceCard.cardId,
      from: sourceCard.zone,
      to: playedCard.zone,
      reason: "playCard",
    },
    { type: "public" },
  );
  appendEvent(
    state,
    events,
    "cardPlayed",
    {
      playerId,
      instanceId: sourceCard.instanceId,
      cardId: sourceCard.cardId,
      category: supported.category,
      sourceZone,
    },
    { type: "public" },
  );
  const nextStateBase: GameState = {
    ...state,
    seq: toStateSeq(state.seq + 1),
    actionSeq: incrementActionSeq ? state.actionSeq + 1 : state.actionSeq,
    players: { ...state.players, [playerId]: nextPlayer },
    continuousEffects: consumeMatchingPlayCostModifiers(
      state,
      playerId,
      sourceCard,
    ),
    revealedCards:
      sourceZone === "noZone"
        ? state.revealedCards.filter(
            (record) =>
              !record.cards.some(
                (card) => card.instanceId === sourceCard.instanceId,
              ),
          )
        : state.revealedCards,
  };
  delete nextStateBase.pendingDecision;
  const nextState = applyRuleProcessingCheckpoint({
    state: nextStateBase,
    events,
    phase: "main",
    createEvent: (seqOffset, type, payload, visibility) =>
      createEvent(state, seqOffset, type, payload, visibility),
  });
  nextState.eventJournal = [...state.eventJournal, ...events];
  assertGameStateInvariants(nextState);
  if (!resolveOnPlayRuntime) {
    return toEngineResult(nextState, events);
  }
  if (resolvePlayCardEffectRuntime === undefined) {
    return illegalAction(
      state,
      "playCard runtime resolver is required for On Play runtime.",
    );
  }
  return resolvePlayCardEffectRuntime(
    state,
    nextState,
    events,
    sourceCard,
    supported,
  );
};
