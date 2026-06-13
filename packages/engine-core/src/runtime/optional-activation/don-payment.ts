import type {
  Action,
  CardInstance,
  PaymentOption,
  PlayerId,
  PlayerState,
} from "@optcg/types";

import { applyReturnDonPayment } from "../primitives/return-don.js";

type DonPaymentOption = Extract<
  PaymentOption,
  { type: "restDon" | "returnDon" }
>;
type PaymentResponse = Extract<
  Extract<Action, { type: "respondToDecision" }>["response"],
  { type: "payment" }
>;

export type DonCostPaidPayload = {
  readonly playerId: PlayerId;
  readonly optionId: "restDon" | "returnDon";
  readonly selectedDonInstanceIds: NonNullable<
    PaymentResponse["selectedDonInstanceIds"]
  >;
};

export type ApplyDonPaymentResult =
  | {
      readonly ok: true;
      readonly player: PlayerState;
      readonly costPaidPayload: DonCostPaidPayload;
      readonly paidCostSelectedDonInstanceIds: readonly CardInstance["instanceId"][];
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

export const applyDonPayment = (params: {
  readonly player: PlayerState;
  readonly playerId: PlayerId;
  readonly response: PaymentResponse;
  readonly selectedOption: DonPaymentOption;
}): ApplyDonPaymentResult => {
  const { player, playerId, response, selectedOption } = params;
  if (response.selectedCardInstanceIds !== undefined) {
    return {
      ok: false,
      message: "Payment DON!! selection must not include cards.",
    };
  }

  const selected = response.selectedDonInstanceIds;
  const selectedCount = selected?.length;
  const maxCount =
    selectedOption.type === "restDon" ? selectedOption.maxCount : undefined;
  if (
    selected === undefined ||
    selectedCount === undefined ||
    selectedCount < selectedOption.count ||
    (typeof maxCount === "number" && selectedCount > maxCount)
  ) {
    return { ok: false, message: "Payment DON!! selection count mismatch." };
  }
  if (new Set(selected).size !== selected.length) {
    return {
      ok: false,
      message: "Payment DON!! selection contains duplicates.",
    };
  }

  const paidPlayer =
    selectedOption.type === "restDon"
      ? applyRestDonPayment(player, selected)
      : applyReturnDonPayment({
          player,
          playerId,
          selectedDonIds: selected,
          ...(selectedOption.sourceState === undefined
            ? {}
            : { sourceState: selectedOption.sourceState }),
        });
  if (paidPlayer === null) {
    return { ok: false, message: "Payment DON!! selection is invalid." };
  }

  return {
    ok: true,
    player: paidPlayer,
    costPaidPayload: {
      playerId,
      optionId: selectedOption.type,
      selectedDonInstanceIds: selected,
    },
    paidCostSelectedDonInstanceIds: [...selected],
  };
};

const applyRestDonPayment = (
  player: PlayerState,
  selected: readonly CardInstance["instanceId"][],
): PlayerState | null => {
  const costAreaById = new Map(
    player.costArea.map((card) => [card.instanceId, card]),
  );
  for (const donId of selected) {
    const don = costAreaById.get(donId);
    if (don === undefined || don.state !== "active") {
      return null;
    }
  }

  const restedSet = new Set(selected);
  return {
    ...player,
    costArea: player.costArea.map((card) =>
      restedSet.has(card.instanceId)
        ? { ...card, state: "rested" as const }
        : card,
    ),
  };
};
