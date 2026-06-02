import type {
  EffectQueueEntry,
  EngineEvent,
  GameState,
  SelectCardsDecision,
} from "@optcg/types";

import { appendEvent, toStateSeq } from "../action-results.js";
import { cardMatchesSearchFilter } from "../action-state.js";
import { hashCanonicalStateValue } from "../state/canonical-state.js";
import {
  createSearchRevealOrderCardsDecision,
  hasSupportedTrashRemainingCardsPolicy,
  moveSearchRevealRemainderToTrash,
} from "./remainder.js";
import {
  cardRefsForPrivateSearchReveal,
  decisionIdForEntry,
  hasExpectedTransientSetShape,
  revealIdForEntry,
} from "./decision-helpers.js";
import { failChoiceClosed, validateSupportedSearchEffect } from "./support.js";
import { createSupportedSearchRevealTransientSet } from "./transient.js";
import type {
  EngineInternalTransientCardSet,
  SearchEffect,
  SearchRevealChoiceDecisionResult,
} from "./types.js";

export const createSupportedSearchRevealChoiceDecisionFromTransientSet = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: SearchEffect,
  transientSet: EngineInternalTransientCardSet,
): SearchRevealChoiceDecisionResult => {
  const supported = validateSupportedSearchEffect(state, entry, effect);
  if (!supported.ok) {
    return failChoiceClosed(state, entry, supported.reason);
  }
  if (
    !hasExpectedTransientSetShape(
      state,
      supported.playerId,
      entry,
      transientSet,
    )
  ) {
    return failChoiceClosed(state, entry, "unsupported-transient-set-state");
  }

  const causedBy = {
    type: "effect",
    queueEntryId: entry.id,
    effectId: entry.effectBlockId,
  } as const;
  const visibility = { type: "private", playerId: supported.playerId } as const;
  const cards = cardRefsForPrivateSearchReveal(transientSet.cards);
  const candidates = cards.filter((card) =>
    cardMatchesSearchFilter(
      state.cardManifest.cards[card.cardId],
      effect.request.filter,
    ),
  );

  const events: EngineEvent[] = [];
  const revealId = revealIdForEntry(entry);
  appendEvent(
    state,
    events,
    "cardRevealed",
    {
      revealId,
      cards,
      origin: "topOfDeck",
      selectionSetId: transientSet.id,
    },
    visibility,
  );

  if (candidates.length === 0) {
    if (hasSupportedTrashRemainingCardsPolicy(effect.request)) {
      const player = state.players[supported.playerId];
      if (player === undefined) {
        return failChoiceClosed(state, entry, "unsupported-player-ref");
      }
      const lookedDeckCards = player.deck.slice(0, cards.length);
      const movement = moveSearchRevealRemainderToTrash(state, events, {
        cards: lookedDeckCards,
        causedBy,
        playerId: supported.playerId,
        selectionSetId: transientSet.id,
      });
      for (const event of events) {
        event.causedBy = causedBy;
      }
      const nextSeq = toStateSeq(state.seq + 1);
      const nextState: GameState = {
        ...movement.state,
        seq: nextSeq,
        eventJournal: [...state.eventJournal, ...events],
      };
      return {
        events,
        kind: "noEligibleCandidate",
        ok: true,
        state: nextState,
      };
    }
    if (cards.length <= 1) {
      for (const event of events) {
        event.causedBy = causedBy;
      }
      const nextState: GameState = {
        ...state,
        seq: toStateSeq(state.seq + 1),
        eventJournal: [...state.eventJournal, ...events],
      };
      return {
        events,
        kind: "noEligibleCandidate",
        ok: true,
        state: nextState,
      };
    }
    const pendingDecision = createSearchRevealOrderCardsDecision(
      String(entry.id),
      entry.effectBlockId,
      supported.playerId,
      cards,
    );
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
    for (const event of events) {
      event.causedBy = causedBy;
    }
    const nextSeq = toStateSeq(state.seq + 1);
    const nextState: GameState = {
      ...state,
      seq: nextSeq,
      pendingDecision,
      revealedCards: [
        ...state.revealedCards,
        {
          id: revealId,
          cards,
          visibility,
          origin: "topOfDeck",
          createdAtStateSeq: nextSeq,
          cleanupPolicy: transientSet.cleanupPolicy,
        },
      ],
      eventJournal: [...state.eventJournal, ...events],
    };
    return {
      events,
      kind: "decisionCreated",
      ok: true,
      state: nextState,
      transientSet,
      transientSetHash: hashCanonicalStateValue(transientSet),
    };
  }

  const pendingDecision: SelectCardsDecision = {
    id: decisionIdForEntry(entry),
    type: "selectCards",
    playerId: supported.playerId,
    prompt:
      effect.request.revealTo === "bothPlayers"
        ? "Choose a revealed card to reveal, or decline."
        : "Choose a revealed card or decline.",
    causedBy,
    visibility,
    request: {
      timing: "onResolution",
      chooser: "self",
      set: transientSet.id as NonNullable<
        SelectCardsDecision["request"]["set"]
      >,
      filter: effect.request.filter,
      min: 0,
      max: 1,
      allowFewerIfUnavailable: true,
      visibility:
        effect.request.revealTo === "bothPlayers"
          ? "public"
          : "privateToChooser",
      ...(effect.request.remainingCards !== undefined
        ? { remainingCards: effect.request.remainingCards }
        : {}),
    },
    candidates: cards
      .map((card) => ({
        card,
        visibility,
      }))
      .filter((candidate) =>
        cardMatchesSearchFilter(
          state.cardManifest.cards[candidate.card.cardId],
          effect.request.filter,
        ),
      ),
    defaultResponse: { type: "cards", cards: [] },
  };
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
  for (const event of events) {
    event.causedBy = causedBy;
  }

  const nextSeq = toStateSeq(state.seq + 1);
  const nextState: GameState = {
    ...state,
    seq: nextSeq,
    pendingDecision,
    revealedCards: [
      ...state.revealedCards,
      {
        id: revealId,
        cards,
        visibility,
        origin: "topOfDeck",
        createdAtStateSeq: nextSeq,
        cleanupPolicy: transientSet.cleanupPolicy,
      },
    ],
    eventJournal: [...state.eventJournal, ...events],
  };

  return {
    events,
    kind: "decisionCreated",
    ok: true,
    state: nextState,
    transientSet,
    transientSetHash: hashCanonicalStateValue(transientSet),
  };
};

export const createSupportedSearchRevealChoiceDecision = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: SearchEffect,
): SearchRevealChoiceDecisionResult => {
  const transient = createSupportedSearchRevealTransientSet(
    state,
    entry,
    effect,
  );
  if (!transient.ok) {
    return transient;
  }
  if (transient.kind === "noEligibleCandidate") {
    return transient;
  }
  return createSupportedSearchRevealChoiceDecisionFromTransientSet(
    state,
    entry,
    effect,
    transient.transientSet,
  );
};
