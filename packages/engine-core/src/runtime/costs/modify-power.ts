import type {
  CardInstance,
  ContinuousEffectRecord,
  GameState,
  PaymentOption,
  PlayerId,
  PlayerState,
} from "@optcg/types";

import { createContinuousRecordsForResolvedEffect } from "../continuous/continuous.js";

type ModifyPowerPaymentOption = Extract<PaymentOption, { type: "modifyPower" }>;

export const applyModifyPowerPayment = (params: {
  causedBy: NonNullable<GameState["pendingDecision"]>["causedBy"];
  player: PlayerState;
  playerId: PlayerId;
  selectedCardInstanceIds?: CardInstance["instanceId"][];
  selectedDonInstanceIds?: CardInstance["instanceId"][];
  selectedOption: ModifyPowerPaymentOption;
  state: GameState;
}): {
  continuousEffects: ContinuousEffectRecord[];
  costPaidPayload: {
    playerId: PlayerId;
    optionId: "modifyPower";
    value: number;
  };
} | null => {
  const {
    causedBy,
    player,
    playerId,
    selectedCardInstanceIds,
    selectedDonInstanceIds,
    selectedOption,
    state,
  } = params;
  if (
    selectedCardInstanceIds !== undefined ||
    selectedDonInstanceIds !== undefined
  ) {
    return null;
  }
  if (
    selectedOption.target.type !== "myLeader" ||
    (selectedOption.requiredState !== undefined &&
      player.leader.state !== selectedOption.requiredState)
  ) {
    return null;
  }

  const sourceEntry =
    causedBy.type === "effect"
      ? state.effectQueue.find((entry) => entry.id === causedBy.queueEntryId)
      : undefined;
  if (sourceEntry === undefined) {
    return null;
  }

  const continuousEffects = createContinuousRecordsForResolvedEffect(
    state,
    sourceEntry,
    {
      type: "modifyPower",
      target: selectedOption.target,
      value: selectedOption.value,
      duration: selectedOption.duration,
    },
  );
  if (continuousEffects === null) {
    return null;
  }

  return {
    continuousEffects,
    costPaidPayload: {
      playerId,
      optionId: "modifyPower",
      value: selectedOption.value,
    },
  };
};
