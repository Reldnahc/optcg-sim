import type {
  CardInstance,
  DynamicNumberValue,
  Effect,
  EffectQueueEntry,
  EngineEvent,
  EngineResult,
  GameState,
  PlayerId,
} from "@optcg/types";

import { toEngineResult, toStateSeq } from "../action-results.js";
import { reindexZoneCards } from "../actions/state.js";

export type MoveCardsEffect = Extract<Effect, { type: "moveCards" }>;

const isPositiveIntegerCount = (
  count: MoveCardsEffect["count"],
): count is number =>
  typeof count === "number" && Number.isInteger(count) && count > 0;

const isSupportedAllHandCardCount = (
  count: MoveCardsEffect["count"],
): count is Extract<DynamicNumberValue, { type: "countMatchingZoneCards" }> =>
  typeof count !== "number" &&
  count.type === "countMatchingZoneCards" &&
  (count.player === "self" || count.player === "opponent") &&
  count.zone === "hand" &&
  count.filter === undefined &&
  count.per === 1 &&
  count.multiplier === 1 &&
  count.offset === undefined &&
  count.minimum === undefined;

export const isSupportedHandToDeckEffect = (
  effect: Effect,
): effect is MoveCardsEffect =>
  effect.type === "moveCards" &&
  effect.min === undefined &&
  (isSupportedAllHandCardCount(effect.count) ||
    isPositiveIntegerCount(effect.count)) &&
  (typeof effect.count === "number" ||
    effect.from.player === effect.count.player) &&
  effect.from.zone === "hand" &&
  effect.from.position === undefined &&
  effect.to.player === effect.from.player &&
  effect.to.zone === "deck" &&
  effect.to.position === undefined &&
  effect.destinationState === undefined;

export const executeHandToDeckMove = (
  state: GameState,
  entry: EffectQueueEntry,
  effect: MoveCardsEffect & { count: number },
  playerId: PlayerId,
  player: NonNullable<GameState["players"][PlayerId]>,
  options: { incrementStateSeq?: boolean },
): EngineResult => {
  const movedCount = Math.min(effect.count, player.hand.length);
  if (movedCount === 0) {
    return toEngineResult(state, []);
  }

  const moved = player.hand.slice(0, movedCount);
  const remainingHand = reindexZoneCards(
    player.hand.slice(movedCount),
    "hand",
    playerId,
    "hand",
  );
  const deckStartIndex = player.deck.length;
  const movedToDeck = moved.map(
    (card, index): CardInstance => ({
      ...card,
      state: "active",
      attachedDon: [],
      zone: {
        zone: "deck",
        playerId,
        slot: "deck",
        index: deckStartIndex + index,
      },
    }),
  );
  const nextDeck = reindexZoneCards(
    [...player.deck, ...movedToDeck],
    "deck",
    playerId,
    "deck",
  );
  const events = moved.flatMap((card, index): EngineEvent[] =>
    handToDeckEvents({
      card,
      deckStartIndex,
      effectBlockId: entry.effectBlockId,
      index,
      playerId,
      queueEntryId: entry.id,
      state,
    }),
  );
  const shouldIncrementStateSeq = options.incrementStateSeq ?? true;

  return toEngineResult(
    {
      ...state,
      ...(shouldIncrementStateSeq ? { seq: toStateSeq(state.seq + 1) } : {}),
      players: {
        ...state.players,
        [playerId]: {
          ...player,
          hand: remainingHand,
          deck: nextDeck,
        },
      },
      eventJournal: [...state.eventJournal, ...events],
    },
    events,
  );
};

function handToDeckEvents(options: {
  readonly card: CardInstance;
  readonly deckStartIndex: number;
  readonly effectBlockId: EffectQueueEntry["effectBlockId"];
  readonly index: number;
  readonly playerId: PlayerId;
  readonly queueEntryId: EffectQueueEntry["id"];
  readonly state: GameState;
}): EngineEvent[] {
  const from = {
    zone: "hand" as const,
    playerId: options.playerId,
    slot: "hand" as const,
    index: options.index,
  };
  const to = {
    zone: "deck" as const,
    playerId: options.playerId,
    slot: "deck" as const,
    index: options.deckStartIndex + options.index,
  };
  return [
    {
      id: `event:${String(options.state.seq)}:${String(
        options.index * 2 + 1,
      )}:cardMoved` as EngineEvent["id"],
      seq: options.state.eventJournal.length + options.index * 2 + 1,
      type: "cardMoved",
      payload: { from, to, reason: "moveCards" },
      visibility: { type: "public" },
      causedBy: {
        type: "effect",
        queueEntryId: options.queueEntryId,
        effectId: options.effectBlockId,
      },
      createdAtStateSeq: options.state.seq,
    },
    {
      id: `event:${String(options.state.seq)}:${String(
        options.index * 2 + 2,
      )}:cardMoved` as EngineEvent["id"],
      seq: options.state.eventJournal.length + options.index * 2 + 2,
      type: "cardMoved",
      payload: {
        instanceId: options.card.instanceId,
        cardId: options.card.cardId,
        from,
        to,
        reason: "moveCards",
      },
      visibility: { type: "private", playerId: options.playerId },
      causedBy: {
        type: "effect",
        queueEntryId: options.queueEntryId,
        effectId: options.effectBlockId,
      },
      createdAtStateSeq: options.state.seq,
    },
  ];
}
