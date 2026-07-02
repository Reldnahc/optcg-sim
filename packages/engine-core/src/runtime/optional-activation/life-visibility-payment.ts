import type {
  EngineEvent,
  GameState,
  InstanceId,
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
      position: "top" | "bottom" | "topOrBottom" | "anyMatching";
      selectedCardInstanceIds?: readonly InstanceId[];
    }
  | {
      playerId: PlayerId;
      optionId: "setLifeFaceUp";
      count: number;
      position: "top" | "bottom" | "topOrBottom" | "anyMatching";
      faceUp: boolean;
      selectedCardInstanceIds?: readonly InstanceId[];
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
  if (params.paymentResponse.selectedDonInstanceIds !== undefined) {
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
          ...(params.paymentResponse.selectedCardInstanceIds === undefined
            ? {}
            : {
                selectedCardInstanceIds:
                  params.paymentResponse.selectedCardInstanceIds,
              }),
          selectedOption: params.selectedOption,
          state: params.state,
        })
      : applySetLifeFaceUpPayment({
          decisionId: params.decisionId,
          events: params.events,
          player: params.player,
          playerId: params.playerId,
          ...(params.paymentResponse.selectedCardInstanceIds === undefined
            ? {}
            : {
                selectedCardInstanceIds:
                  params.paymentResponse.selectedCardInstanceIds,
              }),
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
            ...(params.paymentResponse.selectedCardInstanceIds === undefined
              ? {}
              : {
                  selectedCardInstanceIds:
                    params.paymentResponse.selectedCardInstanceIds,
                }),
          }
        : {
            playerId: params.playerId,
            optionId: "setLifeFaceUp",
            count: params.selectedOption.count,
            position: params.selectedOption.position,
            faceUp: params.selectedOption.faceUp,
            ...(params.paymentResponse.selectedCardInstanceIds === undefined
              ? {}
              : {
                  selectedCardInstanceIds:
                    params.paymentResponse.selectedCardInstanceIds,
                }),
          },
  };
};
