import type {
  CardFilter,
  CardInstance,
  GameState,
  PaymentOption,
  PaymentResponse,
  PlayerId,
  PlayerState,
} from "@optcg/types";

import { fieldCostSelectableIds } from "./field-cost-candidates.js";

export const restFromFieldCandidates = (
  player: PlayerState,
): readonly CardInstance[] => [
  player.leader,
  ...player.characters,
  ...(player.stage === undefined ? [] : [player.stage]),
];

export const restFromFieldSelectableIds = (
  state: GameState,
  playerId: PlayerId,
  player: PlayerState,
  filter: CardFilter | undefined,
): CardInstance["instanceId"][] =>
  fieldCostSelectableIds({
    filter,
    includeLeader: true,
    player,
    playerId,
    requireActive: true,
    state,
  });

export const applyRestFromFieldPayment = (params: {
  readonly filter?: CardFilter;
  readonly player: PlayerState;
  readonly playerId: PlayerId;
  readonly selectedCardIds: readonly CardInstance["instanceId"][];
  readonly state: GameState;
}): PlayerState | null => {
  const selectableIds = new Set(
    restFromFieldSelectableIds(
      params.state,
      params.playerId,
      params.player,
      params.filter,
    ),
  );
  if (params.selectedCardIds.some((cardId) => !selectableIds.has(cardId))) {
    return null;
  }
  const selectedSet = new Set(params.selectedCardIds);
  return {
    ...params.player,
    leader: selectedSet.has(params.player.leader.instanceId)
      ? { ...params.player.leader, state: "rested" }
      : params.player.leader,
    characters: params.player.characters.map((card) =>
      selectedSet.has(card.instanceId) ? { ...card, state: "rested" } : card,
    ),
    ...(params.player.stage === undefined
      ? {}
      : {
          stage: selectedSet.has(params.player.stage.instanceId)
            ? { ...params.player.stage, state: "rested" as const }
            : params.player.stage,
        }),
  };
};

type RestFromFieldPaymentOption = Extract<
  PaymentOption,
  { type: "restFromField" }
>;

type RestFromFieldCostPaidPayload = {
  readonly playerId: PlayerId;
  readonly optionId: "restFromField";
  readonly selectedCardInstanceIds: NonNullable<
    PaymentResponse["selectedCardInstanceIds"]
  >;
};

export const applyRestFromFieldPaymentResponse = (params: {
  readonly option: RestFromFieldPaymentOption;
  readonly player: PlayerState;
  readonly playerId: PlayerId;
  readonly response: PaymentResponse;
  readonly state: GameState;
}):
  | {
      readonly ok: true;
      readonly player: PlayerState;
      readonly costPaidPayload: RestFromFieldCostPaidPayload;
    }
  | {
      readonly ok: false;
      readonly message: string;
    } => {
  if (params.response.selectedDonInstanceIds !== undefined) {
    return {
      ok: false,
      message: "Payment card selection must not include DON!!.",
    };
  }
  const selected = params.response.selectedCardInstanceIds;
  if (selected === undefined || selected.length !== params.option.count) {
    return { ok: false, message: "Payment card selection count mismatch." };
  }
  if (new Set(selected).size !== selected.length) {
    return {
      ok: false,
      message: "Payment card selection contains duplicates.",
    };
  }
  const rested = applyRestFromFieldPayment({
    ...(params.option.filter === undefined
      ? {}
      : { filter: params.option.filter }),
    player: params.player,
    playerId: params.playerId,
    selectedCardIds: selected,
    state: params.state,
  });
  if (rested === null) {
    return { ok: false, message: "Payment card selection is invalid." };
  }
  return {
    ok: true,
    player: rested,
    costPaidPayload: {
      playerId: params.playerId,
      optionId: "restFromField",
      selectedCardInstanceIds: selected,
    },
  };
};
