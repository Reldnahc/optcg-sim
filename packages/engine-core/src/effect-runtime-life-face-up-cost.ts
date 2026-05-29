import type {
  CardInstance,
  EngineEvent,
  GameState,
  PaymentOption,
  PlayerId,
  PlayerState,
} from "@optcg/types";

import { appendEvent } from "./action-results.js";

export type TurnLifeFaceUpPaymentOption = Extract<
  PaymentOption,
  { type: "turnLifeFaceUp" }
>;

export const applyTurnLifeFaceUpPayment = (params: {
  decisionId: NonNullable<GameState["pendingDecision"]>["id"];
  events: EngineEvent[];
  player: PlayerState;
  playerId: PlayerId;
  selectedOption: TurnLifeFaceUpPaymentOption;
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
    selected.some((lifeCard) => lifeCard.faceUp)
  ) {
    return null;
  }

  const selectedIndexes = new Set(
    selected.map((_, index) => startIndex + index),
  );
  const nextLife = params.player.life.map((lifeCard, index) =>
    selectedIndexes.has(index) ? { ...lifeCard, faceUp: true } : lifeCard,
  );
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
  return { ...params.player, life: nextLife };
};

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
