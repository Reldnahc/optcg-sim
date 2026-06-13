import type {
  CardInstance,
  EngineEvent,
  GameState,
  PaymentOption,
  PlayerId,
  PlayerState,
} from "@optcg/types";

import { appendEvent } from "../../action-results.js";

export type TurnLifeFaceUpPaymentOption = Extract<
  PaymentOption,
  { type: "turnLifeFaceUp" }
>;
export type SetLifeFaceUpPaymentOption = Extract<
  PaymentOption,
  { type: "setLifeFaceUp" }
>;

type LifeFaceUpPaymentOption =
  | TurnLifeFaceUpPaymentOption
  | SetLifeFaceUpPaymentOption;

export const applyTurnLifeFaceUpPayment = (params: {
  decisionId: NonNullable<GameState["pendingDecision"]>["id"];
  events: EngineEvent[];
  player: PlayerState;
  playerId: PlayerId;
  selectedOption: TurnLifeFaceUpPaymentOption;
  state: GameState;
}): PlayerState | null =>
  applySetLifeFaceUpPayment({
    ...params,
    selectedOption: {
      ...params.selectedOption,
      type: "setLifeFaceUp",
      faceUp: true,
    },
  });

export const applySetLifeFaceUpPayment = (params: {
  decisionId: NonNullable<GameState["pendingDecision"]>["id"];
  events: EngineEvent[];
  player: PlayerState;
  playerId: PlayerId;
  selectedOption: LifeFaceUpPaymentOption;
  state: GameState;
}): PlayerState | null => {
  if (
    params.selectedOption.player !== "self" ||
    !Number.isInteger(params.selectedOption.count) ||
    params.selectedOption.count <= 0
  ) {
    return null;
  }
  const count = params.selectedOption.count;
  const startIndex =
    params.selectedOption.position === "top"
      ? 0
      : params.player.life.length - count;
  const selected = params.player.life.slice(startIndex, startIndex + count);
  if (
    startIndex < 0 ||
    selected.length !== count ||
    selected.some(
      (lifeCard) => lifeCard.faceUp === targetFaceUp(params.selectedOption),
    )
  ) {
    return null;
  }

  const selectedIndexes = new Set(
    selected.map((_, index) => startIndex + index),
  );
  const faceUp = targetFaceUp(params.selectedOption);
  const nextLife = params.player.life.map((lifeCard, index) =>
    selectedIndexes.has(index) ? { ...lifeCard, faceUp } : lifeCard,
  );
  if (faceUp) {
    appendEvent(
      params.state,
      params.events,
      "cardRevealed",
      {
        revealId: `reveal:life-face-up:${String(params.decisionId)}`,
        cards: selected.map((lifeCard, offset) =>
          toLifeCardRef(lifeCard.card, params.playerId, startIndex + offset),
        ),
        origin: "life",
        reason: "turnLifeFaceUpCost",
      },
      { type: "public" },
    );
    const revealed = params.events[params.events.length - 1];
    if (revealed !== undefined) {
      revealed.causedBy = { type: "decision", decisionId: params.decisionId };
    }
  }
  return { ...params.player, life: nextLife };
};

const targetFaceUp = (option: LifeFaceUpPaymentOption): boolean =>
  option.type === "turnLifeFaceUp" ? true : option.faceUp;

const toLifeCardRef = (
  card: CardInstance,
  playerId: PlayerId,
  index: number,
) => ({
  instanceId: card.instanceId,
  cardId: card.cardId,
  playerId,
  zone: {
    zone: "life" as const,
    playerId,
    slot: "life" as const,
    index,
  },
});
