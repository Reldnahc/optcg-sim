import type {
  CardInstance,
  DecisionId,
  EngineEvent,
  GameState,
  PaymentOption,
  PaymentResponse,
  PlayerId,
} from "@optcg/types";

import {
  cardMatchesHandSelectionFilter,
  toCardRef,
} from "../../actions/state.js";
import { moveFieldCardToOwnerLife } from "../../movement/field-to-life.js";

export type MoveFieldToLifePaymentOption = Extract<
  PaymentOption,
  { type: "moveFieldToLife" }
>;

export const moveFieldToLifePaymentOptions = (cost: {
  readonly count: number;
  readonly faceUp?: boolean;
  readonly filter?: MoveFieldToLifePaymentOption["filter"];
  readonly player: "opponent" | "anyPlayer";
  readonly position: "top" | "bottom" | "topOrBottom";
}): MoveFieldToLifePaymentOption[] => {
  const positions =
    cost.position === "topOrBottom"
      ? (["top", "bottom"] as const)
      : ([cost.position] as const);
  return positions.map((position) => ({
    id: `moveFieldToLife:${position}`,
    type: "moveFieldToLife",
    count: cost.count,
    player: cost.player,
    ...(cost.filter === undefined ? {} : { filter: cost.filter }),
    position,
    ...(cost.faceUp === undefined ? {} : { faceUp: cost.faceUp }),
  }));
};

export const moveFieldToLifeCandidateCards = (
  state: GameState,
  chooserId: PlayerId,
  option: MoveFieldToLifePaymentOption,
): readonly CardInstance[] => {
  const players = moveFieldToLifeCandidatePlayers(state, chooserId, option);
  return players.flatMap(({ playerId, cards }) =>
    cards
      .filter((card) =>
        cardMatchesHandSelectionFilter(state, chooserId, card, option.filter),
      )
      .map((card) => ({ ...card, controller: playerId })),
  );
};

export const applyMoveFieldToLifePayment = (params: {
  readonly decisionId: DecisionId;
  readonly events: EngineEvent[];
  readonly option: MoveFieldToLifePaymentOption;
  readonly selected: readonly CardInstance["instanceId"][];
  readonly state: GameState;
  readonly chooserId: PlayerId;
}):
  | { ok: true; state: GameState; selectedCards: CardInstance[] }
  | { ok: false; message: string } => {
  if (
    params.selected.length !== params.option.count ||
    new Set(params.selected).size !== params.selected.length
  ) {
    return { ok: false, message: "Payment card selection count mismatch." };
  }

  let nextState = params.state;
  const selectedCards: CardInstance[] = [];
  for (const selectedId of params.selected) {
    const located = locateMoveFieldToLifeCandidate(
      nextState,
      params.chooserId,
      params.option,
      selectedId,
    );
    if (located === undefined) {
      return { ok: false, message: "Payment card selection is invalid." };
    }
    selectedCards.push(located.card);
    const moved = moveFieldCardToOwnerLife({
      card: located.card,
      causedBy: { type: "decision", decisionId: params.decisionId },
      events: params.events,
      ...(params.option.faceUp === undefined
        ? {}
        : { faceUp: params.option.faceUp }),
      playerId: located.playerId,
      position: params.option.position,
      sourceZone: located.zone,
      state: nextState,
    });
    nextState = moved.state;
  }

  return { ok: true, state: nextState, selectedCards };
};

export const applyMoveFieldToLifePaymentResponse = (params: {
  readonly chooserId: PlayerId;
  readonly decisionId: DecisionId;
  readonly events: EngineEvent[];
  readonly option: MoveFieldToLifePaymentOption;
  readonly response: PaymentResponse;
  readonly state: GameState;
}):
  | {
      readonly ok: true;
      readonly costPaidPayload: {
        readonly playerId: PlayerId;
        readonly optionId: "moveFieldToLife";
        readonly selectedCardInstanceIds: NonNullable<
          PaymentResponse["selectedCardInstanceIds"]
        >;
      };
      readonly selectedCardRefs: ReturnType<typeof toCardRef>[];
      readonly state: GameState;
    }
  | { readonly ok: false; readonly message: string } => {
  if (params.response.selectedDonInstanceIds !== undefined) {
    return {
      ok: false,
      message: "Payment card selection must not include DON!!.",
    };
  }
  const selected = params.response.selectedCardInstanceIds;
  if (selected === undefined) {
    return { ok: false, message: "Payment card selection count mismatch." };
  }
  const paid = applyMoveFieldToLifePayment({
    chooserId: params.chooserId,
    decisionId: params.decisionId,
    events: params.events,
    option: params.option,
    selected,
    state: params.state,
  });
  if (!paid.ok) {
    return paid;
  }
  return {
    ok: true,
    costPaidPayload: {
      playerId: params.chooserId,
      optionId: "moveFieldToLife",
      selectedCardInstanceIds: selected,
    },
    selectedCardRefs: moveFieldToLifeSelectedRefs(paid.selectedCards),
    state: paid.state,
  };
};

const moveFieldToLifeCandidatePlayers = (
  state: GameState,
  chooserId: PlayerId,
  option: MoveFieldToLifePaymentOption,
): readonly {
  readonly cards: readonly CardInstance[];
  readonly playerId: PlayerId;
}[] => {
  const entries = Object.entries(state.players) as [
    PlayerId,
    NonNullable<GameState["players"][PlayerId]>,
  ][];
  return entries
    .filter(([playerId]) => {
      if (option.player === "anyPlayer") {
        return true;
      }
      return playerId !== chooserId;
    })
    .map(([playerId, player]) => ({
      playerId,
      cards: player.characters,
    }));
};

const locateMoveFieldToLifeCandidate = (
  state: GameState,
  chooserId: PlayerId,
  option: MoveFieldToLifePaymentOption,
  instanceId: CardInstance["instanceId"],
):
  | { card: CardInstance; playerId: PlayerId; zone: "characterArea" }
  | undefined => {
  for (const { cards, playerId } of moveFieldToLifeCandidatePlayers(
    state,
    chooserId,
    option,
  )) {
    const card = cards.find((candidate) => candidate.instanceId === instanceId);
    if (
      card !== undefined &&
      cardMatchesHandSelectionFilter(state, chooserId, card, option.filter)
    ) {
      return { card, playerId, zone: "characterArea" };
    }
  }
  return undefined;
};

export const moveFieldToLifeSelectedRefs = (
  selectedCards: readonly CardInstance[],
): ReturnType<typeof toCardRef>[] =>
  selectedCards.map((card) => toCardRef(card, card.controller));
