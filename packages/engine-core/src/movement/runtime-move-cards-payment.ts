import type {
  CardInstance,
  EngineEvent,
  GameState,
  PaymentOption,
  PlayerId,
  PlayerState,
} from "@optcg/types";

import { appendEvent } from "../action-results.js";
import {
  addCardsToHand,
  cardMatchesHandSelectionFilter,
  reindexZoneCards,
} from "../actions/state.js";
import { moveFieldCardToOwnerDeckBottom } from "./field-to-deck.js";

export type MoveCardsPaymentOption = Extract<
  PaymentOption,
  { type: "moveCards" }
>;

export const isSupportedMoveCardsPaymentRoute = (
  option: MoveCardsPaymentOption,
): boolean => {
  if (option.from.player !== "self" || option.to.player !== "self") {
    return false;
  }
  if (
    option.from.zone === "trash" &&
    option.from.position === undefined &&
    option.to.zone === "deck" &&
    option.to.position === "bottom"
  ) {
    return true;
  }
  if (
    option.from.zone === "hand" &&
    option.from.position === undefined &&
    option.to.zone === "deck" &&
    option.to.position === "top"
  ) {
    return option.count === 1;
  }
  if (
    (option.from.zone === "characterArea" ||
      option.from.zone === "stageArea") &&
    option.from.position === undefined &&
    option.to.zone === "deck" &&
    option.to.position === "bottom"
  ) {
    return true;
  }
  return (
    (option.from.zone === "deck" &&
      option.from.position === "top" &&
      option.to.zone === "trash" &&
      option.to.position === undefined) ||
    (option.from.zone === "life" &&
      option.from.position === "top" &&
      option.to.zone === "trash" &&
      option.to.position === undefined) ||
    (option.from.zone === "life" &&
      (option.from.position === "top" || option.from.position === "bottom") &&
      option.to.zone === "hand" &&
      option.to.position === undefined)
  );
};

export const applyMoveCardsPayment = (params: {
  decisionId: NonNullable<GameState["pendingDecision"]>["id"];
  events: EngineEvent[];
  player: PlayerState;
  playerId: PlayerId;
  selected: readonly CardInstance["instanceId"][];
  selectedOption: MoveCardsPaymentOption;
  state: GameState;
}): PlayerState | null => {
  if (
    params.selectedOption.from.zone === "trash" &&
    params.selectedOption.to.zone === "deck" &&
    params.selectedOption.to.position === "bottom"
  ) {
    const selectedCards: CardInstance[] = [];
    for (const selectedId of params.selected) {
      const card = params.player.trash.find(
        (candidate) => candidate.instanceId === selectedId,
      );
      if (
        card === undefined ||
        !cardMatchesHandSelectionFilter(
          params.state,
          params.playerId,
          card,
          params.selectedOption.filter,
        )
      ) {
        return null;
      }
      selectedCards.push(card);
    }
    const selectedSet = new Set(params.selected);
    const movedCards = selectedCards.map((card, index) => ({
      ...card,
      attachedDon: [],
      zone: {
        zone: "deck" as const,
        playerId: params.playerId,
        slot: "deck" as const,
        index: params.player.deck.length + index,
      },
    }));
    for (let index = 0; index < selectedCards.length; index += 1) {
      appendEvent(
        params.state,
        params.events,
        "cardMoved",
        {
          from: "trash",
          to: "deck",
          playerId: params.playerId,
          reason: "moveCardsCost",
        },
        { type: "public" },
      );
      const moved = params.events[params.events.length - 1];
      if (moved !== undefined) {
        moved.causedBy = { type: "decision", decisionId: params.decisionId };
      }
    }
    return {
      ...params.player,
      trash: reindexZoneCards(
        params.player.trash.filter((card) => !selectedSet.has(card.instanceId)),
        "trash",
        params.playerId,
        "trash",
      ),
      deck: reindexZoneCards(
        [...params.player.deck, ...movedCards],
        "deck",
        params.playerId,
        "deck",
      ),
    };
  }

  if (
    params.selectedOption.from.zone === "hand" &&
    params.selectedOption.from.position === undefined &&
    params.selectedOption.to.zone === "deck" &&
    params.selectedOption.to.position === "top" &&
    params.selectedOption.count === 1
  ) {
    const selectedCards: CardInstance[] = [];
    for (const selectedId of params.selected) {
      const card = params.player.hand.find(
        (candidate) => candidate.instanceId === selectedId,
      );
      if (
        card === undefined ||
        !cardMatchesHandSelectionFilter(
          params.state,
          params.playerId,
          card,
          params.selectedOption.filter,
        )
      ) {
        return null;
      }
      selectedCards.push(card);
    }
    const selectedSet = new Set(params.selected);
    const movedCards = selectedCards.map((card, index) => ({
      ...card,
      attachedDon: [],
      zone: {
        zone: "deck" as const,
        playerId: params.playerId,
        slot: "deck" as const,
        index,
      },
    }));
    for (const [index, movedCard] of movedCards.entries()) {
      const originalCard = selectedCards[index];
      if (originalCard === undefined) {
        return null;
      }
      appendEvent(
        params.state,
        params.events,
        "cardMoved",
        {
          from: "hand",
          to: "deck",
          playerId: params.playerId,
          reason: "moveCardsCost",
        },
        { type: "public" },
      );
      const publicMoved = params.events[params.events.length - 1];
      if (publicMoved !== undefined) {
        publicMoved.causedBy = {
          type: "decision",
          decisionId: params.decisionId,
        };
      }
      appendEvent(
        params.state,
        params.events,
        "cardMoved",
        {
          instanceId: movedCard.instanceId,
          cardId: movedCard.cardId,
          from: originalCard.zone,
          to: movedCard.zone,
          reason: "moveCardsCost",
        },
        { type: "private", playerId: params.playerId },
      );
      const privateMoved = params.events[params.events.length - 1];
      if (privateMoved !== undefined) {
        privateMoved.causedBy = {
          type: "decision",
          decisionId: params.decisionId,
        };
      }
    }
    return {
      ...params.player,
      hand: reindexZoneCards(
        params.player.hand.filter((card) => !selectedSet.has(card.instanceId)),
        "hand",
        params.playerId,
        "hand",
      ),
      deck: reindexZoneCards(
        [...movedCards, ...params.player.deck],
        "deck",
        params.playerId,
        "deck",
      ),
    };
  }

  if (
    (params.selectedOption.from.zone === "characterArea" ||
      params.selectedOption.from.zone === "stageArea") &&
    params.selectedOption.from.position === undefined &&
    params.selectedOption.to.zone === "deck" &&
    params.selectedOption.to.position === "bottom"
  ) {
    let nextState = params.state;
    for (const selectedId of params.selected) {
      const nextPlayer = nextState.players[params.playerId];
      if (nextPlayer === undefined) {
        return null;
      }
      const selectedCard =
        params.selectedOption.from.zone === "characterArea"
          ? nextPlayer.characters.find(
              (candidate) => candidate.instanceId === selectedId,
            )
          : nextPlayer.stage?.instanceId === selectedId
            ? nextPlayer.stage
            : undefined;
      if (
        selectedCard === undefined ||
        !cardMatchesHandSelectionFilter(
          nextState,
          params.playerId,
          selectedCard,
          params.selectedOption.filter,
        )
      ) {
        return null;
      }
      const moved = moveFieldCardToOwnerDeckBottom({
        card: selectedCard,
        causedBy: { type: "decision", decisionId: params.decisionId },
        events: params.events,
        playerId: params.playerId,
        reason: "moveCardsCost",
        sourceZone: params.selectedOption.from.zone,
        state: nextState,
      });
      nextState = moved.state;
    }
    return nextState.players[params.playerId] ?? null;
  }

  if (
    params.selectedOption.from.zone === "deck" &&
    params.selectedOption.from.position === "top" &&
    params.selectedOption.to.zone === "trash" &&
    params.selectedOption.to.position === undefined
  ) {
    const selectedCards = params.player.deck.slice(0, params.selected.length);
    if (
      selectedCards.length !== params.selectedOption.count ||
      selectedCards.some(
        (card, index) =>
          card.instanceId !== params.selected[index] ||
          !cardMatchesHandSelectionFilter(
            params.state,
            params.playerId,
            card,
            params.selectedOption.filter,
          ),
      )
    ) {
      return null;
    }
    const selectedSet = new Set(params.selected);
    const movedCards = selectedCards.map((card, index) => ({
      ...card,
      attachedDon: [],
      zone: {
        zone: "trash" as const,
        playerId: params.playerId,
        slot: "trash" as const,
        index,
      },
    }));
    for (const movedCard of movedCards) {
      appendEvent(
        params.state,
        params.events,
        "cardMoved",
        {
          instanceId: movedCard.instanceId,
          cardId: movedCard.cardId,
          from: "deck",
          to: "trash",
          playerId: params.playerId,
          reason: "moveCardsCost",
        },
        { type: "public" },
      );
      const moved = params.events[params.events.length - 1];
      if (moved !== undefined) {
        moved.causedBy = { type: "decision", decisionId: params.decisionId };
      }
      appendEvent(
        params.state,
        params.events,
        "cardTrashed",
        {
          instanceId: movedCard.instanceId,
          cardId: movedCard.cardId,
          playerId: params.playerId,
          reason: "moveCardsCost",
        },
        { type: "public" },
      );
      const trashed = params.events[params.events.length - 1];
      if (trashed !== undefined) {
        trashed.causedBy = {
          type: "decision",
          decisionId: params.decisionId,
        };
      }
    }
    return {
      ...params.player,
      deck: reindexZoneCards(
        params.player.deck.filter((card) => !selectedSet.has(card.instanceId)),
        "deck",
        params.playerId,
        "deck",
      ),
      trash: reindexZoneCards(
        [...movedCards, ...params.player.trash],
        "trash",
        params.playerId,
        "trash",
      ),
    };
  }

  if (
    params.selectedOption.from.zone === "life" &&
    params.selectedOption.from.position === "top" &&
    params.selectedOption.to.zone === "trash" &&
    params.selectedOption.to.position === undefined
  ) {
    const selectedLife = params.player.life.slice(0, params.selected.length);
    if (
      selectedLife.length !== params.selectedOption.count ||
      selectedLife.some(
        (lifeCard, index) =>
          lifeCard.card.instanceId !== params.selected[index],
      )
    ) {
      return null;
    }
    const selectedSet = new Set(params.selected);
    const movedCards = selectedLife.map((lifeCard, index) => ({
      ...lifeCard.card,
      attachedDon: [],
      zone: {
        zone: "trash" as const,
        playerId: params.playerId,
        slot: "trash" as const,
        index,
      },
    }));
    for (const movedCard of movedCards) {
      appendEvent(
        params.state,
        params.events,
        "cardMoved",
        {
          instanceId: movedCard.instanceId,
          cardId: movedCard.cardId,
          from: "life",
          to: "trash",
          playerId: params.playerId,
          reason: "moveCardsCost",
        },
        { type: "public" },
      );
      const moved = params.events[params.events.length - 1];
      if (moved !== undefined) {
        moved.causedBy = { type: "decision", decisionId: params.decisionId };
      }
      appendEvent(
        params.state,
        params.events,
        "cardTrashed",
        {
          instanceId: movedCard.instanceId,
          cardId: movedCard.cardId,
          playerId: params.playerId,
          reason: "moveCardsCost",
        },
        { type: "public" },
      );
      const trashed = params.events[params.events.length - 1];
      if (trashed !== undefined) {
        trashed.causedBy = {
          type: "decision",
          decisionId: params.decisionId,
        };
      }
    }
    return {
      ...params.player,
      life: params.player.life
        .filter((lifeCard) => !selectedSet.has(lifeCard.card.instanceId))
        .map((entry, index) => ({
          ...entry,
          card: {
            ...entry.card,
            zone: {
              zone: "life" as const,
              playerId: params.playerId,
              slot: "life" as const,
              index,
            },
          },
        })),
      trash: reindexZoneCards(
        [...movedCards, ...params.player.trash],
        "trash",
        params.playerId,
        "trash",
      ),
    };
  }

  if (
    params.selectedOption.from.zone !== "life" ||
    params.selectedOption.to.zone !== "hand" ||
    params.selectedOption.to.position !== undefined ||
    params.selected.length !== 1
  ) {
    return null;
  }
  const lifeIndex =
    params.selectedOption.from.position === "top"
      ? 0
      : params.player.life.length - 1;
  const lifeCard = params.player.life[lifeIndex];
  if (
    lifeCard === undefined ||
    lifeCard.card.instanceId !== params.selected[0]
  ) {
    return null;
  }
  const movedCard: CardInstance = {
    ...lifeCard.card,
    zone: {
      zone: "hand",
      playerId: params.playerId,
      slot: "hand",
      index: params.player.hand.length,
    },
  };
  appendEvent(
    params.state,
    params.events,
    "cardMoved",
    {
      from: {
        zone: "life",
        playerId: params.playerId,
        slot: "life",
        index: lifeIndex,
      },
      to: movedCard.zone,
      reason: "moveCardsCost",
    },
    { type: "public" },
  );
  const publicMoved = params.events[params.events.length - 1];
  if (publicMoved !== undefined) {
    publicMoved.causedBy = { type: "decision", decisionId: params.decisionId };
  }
  appendEvent(
    params.state,
    params.events,
    "cardMoved",
    {
      instanceId: movedCard.instanceId,
      cardId: movedCard.cardId,
      from: {
        zone: "life",
        playerId: params.playerId,
        slot: "life",
        index: lifeIndex,
      },
      to: movedCard.zone,
      reason: "moveCardsCost",
    },
    { type: "private", playerId: params.playerId },
  );
  const privateMoved = params.events[params.events.length - 1];
  if (privateMoved !== undefined) {
    privateMoved.causedBy = {
      type: "decision",
      decisionId: params.decisionId,
    };
  }
  return {
    ...params.player,
    life: params.player.life
      .filter((_, index) => index !== lifeIndex)
      .map((entry, index) => ({
        ...entry,
        card: {
          ...entry.card,
          zone: {
            zone: "life" as const,
            playerId: params.playerId,
            slot: "life" as const,
            index,
          },
        },
      })),
    hand: addCardsToHand(params.player.hand, [movedCard], params.playerId),
  };
};
