import type {
  EngineEvent,
  GameState,
  PaymentOption,
  PaymentResponse,
  PlayerId,
  PlayerState,
} from "@optcg/types";

import {
  applySetLifeFaceUpPayment,
  applyTurnLifeFaceUpPayment,
} from "../../effect-runtime-life-face-up-cost.js";

type LifeVisibilityPaymentOption = Extract<
  PaymentOption,
  { type: "turnLifeFaceUp" | "setLifeFaceUp" }
>;

export type LifeVisibilityCostPaidPayload =
  | {
      playerId: PlayerId;
      optionId: "turnLifeFaceUp";
      count: number;
      position: "top" | "bottom";
    }
  | {
      playerId: PlayerId;
      optionId: "setLifeFaceUp";
      count: number;
      position: "top" | "bottom";
      faceUp: boolean;
    };

export const applyLifeVisibilityPayment = (params: {
  decisionId: NonNullable<GameState["pendingDecision"]>["id"];
  events: EngineEvent[];
  paymentResponse: PaymentResponse;
  player: PlayerState;
  playerId: PlayerId;
  selectedOption: LifeVisibilityPaymentOption;
  state: GameState;
}):
  | {
      ok: true;
      player: PlayerState;
      costPaidPayload: LifeVisibilityCostPaidPayload;
    }
  | { ok: false; message: string } => {
  if (
    params.paymentResponse.selectedCardInstanceIds !== undefined ||
    params.paymentResponse.selectedDonInstanceIds !== undefined
  ) {
    return {
      ok: false,
      message: "Payment Life visibility selection is invalid.",
    };
  }
  const updated =
    params.selectedOption.type === "turnLifeFaceUp"
      ? applyTurnLifeFaceUpPayment({
          decisionId: params.decisionId,
          events: params.events,
          player: params.player,
          playerId: params.playerId,
          selectedOption: params.selectedOption,
          state: params.state,
        })
      : applySetLifeFaceUpPayment({
          decisionId: params.decisionId,
          events: params.events,
          player: params.player,
          playerId: params.playerId,
          selectedOption: params.selectedOption,
          state: params.state,
        });
  if (updated === null) {
    return {
      ok: false,
      message: "Payment Life visibility selection is invalid.",
    };
  }
  return {
    ok: true,
    player: updated,
    costPaidPayload:
      params.selectedOption.type === "turnLifeFaceUp"
        ? {
            playerId: params.playerId,
            optionId: "turnLifeFaceUp",
            count: params.selectedOption.count,
            position: params.selectedOption.position,
          }
        : {
            playerId: params.playerId,
            optionId: "setLifeFaceUp",
            count: params.selectedOption.count,
            position: params.selectedOption.position,
            faceUp: params.selectedOption.faceUp,
          },
  };
};
