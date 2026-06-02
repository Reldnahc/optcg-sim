import type {
  Action,
  CardInstance,
  CardRef,
  EffectQueueEntry,
  EngineError,
  GameState,
  SelectCardsDecision,
} from "@optcg/types";

import { toDecisionId } from "./action-results.js";
import { isSupportedSearchCardFilter, zonesEqual } from "./action-state.js";
import { toCardRefForPlayer } from "./effect-runtime-search-reveal-remainder.js";
import type { EngineInternalTransientCardSet } from "./effect-runtime-search-reveal-types.js";

export const revealIdForEntry = (entry: EffectQueueEntry): string =>
  `reveal:search-reveal:${String(entry.id)}`;

export const decisionIdForEntry = (entry: EffectQueueEntry) =>
  toDecisionId(`decision:selectCards:search-reveal:${String(entry.id)}`);

export const transientSetIdForEntry = (entry: EffectQueueEntry) =>
  `set:search-reveal:${String(entry.id)}`;

export const invalidDecision = (reason: string): readonly [EngineError] => [
  { type: "invalidDecisionResponse", reason },
];

export const hasMalformedRespondToDecisionPlayerId = (
  action: Extract<Action, { type: "respondToDecision" }>,
): boolean =>
  "playerId" in action &&
  typeof (action as { playerId?: unknown }).playerId !== "string";

export const getRespondingPlayerId = (
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

export const cardRefMatches = (left: CardRef, right: CardRef): boolean =>
  left.instanceId === right.instanceId &&
  left.cardId === right.cardId &&
  left.playerId === right.playerId &&
  ((left.zone === undefined && right.zone === undefined) ||
    (left.zone !== undefined && zonesEqual(left.zone, right.zone)));

export const isCardRef = (value: unknown): value is CardRef => {
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

export const hasDuplicateCardRefs = (cards: readonly CardRef[]): boolean =>
  cards.some((card, index) =>
    cards.slice(index + 1).some((candidate) => cardRefMatches(card, candidate)),
  );

export const revealIdForSetId = (setId: string): string | undefined => {
  const prefix = "set:search-reveal:";
  if (!setId.startsWith(prefix)) {
    return undefined;
  }
  return `reveal:search-reveal:${setId.slice(prefix.length)}`;
};

export const queueEntryIdFromSearchRevealSetId = (
  setId: string,
): string | undefined => {
  const prefix = "set:search-reveal:";
  return setId.startsWith(prefix) ? setId.slice(prefix.length) : undefined;
};

export const isExpectedSearchRevealDecisionEnvelope = (
  decision: SelectCardsDecision,
): boolean => {
  const setId = decision.request.set;
  const filter = decision.request.filter;
  if (
    setId === undefined ||
    filter === undefined ||
    !String(setId).startsWith("set:search-reveal:")
  ) {
    return false;
  }
  const queueEntryId = String(setId).slice("set:search-reveal:".length);
  if (
    decision.id ===
      toDecisionId(`decision:selectCards:search-reveal:${queueEntryId}`) &&
    decision.request.min === 0 &&
    decision.request.max === 1 &&
    decision.request.allowFewerIfUnavailable &&
    decision.request.chooser === "self" &&
    (decision.request.visibility === "privateToChooser" ||
      decision.request.visibility === "public") &&
    isSupportedSearchCardFilter(filter) &&
    decision.visibility.type === "private" &&
    decision.visibility.playerId === decision.playerId
  ) {
    return decision.candidates.every(
      (candidate) =>
        candidate.visibility.type === "private" &&
        candidate.visibility.playerId === decision.playerId,
    );
  }
  return false;
};

export const toHandCard = (
  card: CardInstance,
  playerId: CardInstance["controller"],
  index: number,
): CardInstance => ({
  ...card,
  zone: { zone: "hand", playerId, slot: "hand", index },
});

export const getQueuedEntryForSearchDecision = (
  state: GameState,
  causedBy: NonNullable<GameState["pendingDecision"]>["causedBy"],
): EffectQueueEntry | undefined =>
  causedBy.type === "effect"
    ? state.effectQueue.find(
        (entry) =>
          entry.id === causedBy.queueEntryId &&
          entry.effectBlockId === causedBy.effectId,
      )
    : undefined;

export const hasExpectedTransientSetShape = (
  state: GameState,
  playerId: EffectQueueEntry["controllerId"],
  entry: EffectQueueEntry,
  transientSet: EngineInternalTransientCardSet,
): boolean => {
  if (
    state.pendingDecision !== undefined ||
    transientSet.id !== transientSetIdForEntry(entry) ||
    transientSet.cards.length < 1 ||
    transientSet.origin !== "topOfDeck" ||
    transientSet.ownerId !== playerId ||
    transientSet.controllerId !== playerId ||
    transientSet.visibility.type !== "private" ||
    transientSet.visibility.playerId !== playerId
  ) {
    return false;
  }

  const player = state.players[playerId];
  if (player === undefined) {
    return false;
  }
  const lookedDeckCards = player.deck.slice(0, transientSet.cards.length);
  return transientSet.cards.every((card, index) => {
    const deckCard = lookedDeckCards[index];
    return (
      deckCard !== undefined &&
      card.instanceId === deckCard.instanceId &&
      card.cardId === deckCard.cardId &&
      card.playerId === playerId &&
      card.zone !== undefined &&
      zonesEqual(card.zone, deckCard.zone)
    );
  });
};

export const cardRefsForPrivateSearchReveal = (
  cards: readonly CardRef[],
): CardRef[] => cards.map((card) => ({ ...card }));

export const cardRefForDeckCard = (
  card: CardInstance,
  playerId: CardInstance["controller"],
): CardRef => toCardRefForPlayer(card, playerId);
