import type {
  CardInstance,
  EngineEvent,
  GameState,
  OptionalPayCostDecision,
  PaymentResponse,
  PlayerId,
  PlayerState,
} from "@optcg/types";

import { appendEvent } from "../../action-results.js";
import { cardMatchesHandSelectionFilter } from "../../action-state.js";

export type AttachDonPaymentOption = Extract<
  OptionalPayCostDecision["paymentOptions"][number],
  { type: "attachDon" }
>;

type ApplyAttachDonPaymentResult =
  | {
      ok: true;
      costPaidPayload: {
        playerId: PlayerId;
        optionId: "attachDon";
        selectedDonInstanceIds: NonNullable<
          PaymentResponse["selectedDonInstanceIds"]
        >;
        selectedCardInstanceIds: NonNullable<
          PaymentResponse["selectedCardInstanceIds"]
        >;
      };
      events: EngineEvent[];
      player: PlayerState;
    }
  | { ok: false; reason: string };

export const attachDonTargetCandidates = (
  state: GameState,
  playerId: PlayerId,
  player: PlayerState,
  option: AttachDonPaymentOption,
): readonly CardInstance[] => {
  if (option.target.type !== "chooseFromZones") {
    return [];
  }
  const request = option.target.request;
  if (
    request.chooser !== "self" ||
    request.player !== "self" ||
    request.zones.length !== 2 ||
    request.zones[0] !== "leaderArea" ||
    request.zones[1] !== "characterArea"
  ) {
    return [];
  }
  return [player.leader, ...player.characters].filter((card) =>
    cardMatchesHandSelectionFilter(state, playerId, card, request.filter),
  );
};

export function applyAttachDonCostPayment(params: {
  readonly decisionId: NonNullable<GameState["pendingDecision"]>["id"];
  readonly paymentResponse: PaymentResponse;
  readonly player: PlayerState;
  readonly playerId: PlayerId;
  readonly selectedOption: AttachDonPaymentOption;
  readonly state: GameState;
}): ApplyAttachDonPaymentResult {
  const selectedDon = params.paymentResponse.selectedDonInstanceIds;
  const selectedTargets = params.paymentResponse.selectedCardInstanceIds;
  if (selectedTargets === undefined) {
    return { ok: false, reason: "Payment DON!! attachment target is invalid." };
  }
  if (
    selectedDon === undefined ||
    selectedDon.length !== params.selectedOption.count ||
    selectedTargets.length !== 1
  ) {
    return {
      ok: false,
      reason: "Payment DON!! attachment selection mismatch.",
    };
  }
  if (new Set(selectedDon).size !== selectedDon.length) {
    return {
      ok: false,
      reason: "Payment DON!! selection contains duplicates.",
    };
  }
  const costAreaById = new Map(
    params.player.costArea.map((card) => [card.instanceId, card]),
  );
  for (const donId of selectedDon) {
    const don = costAreaById.get(donId);
    if (don === undefined || don.state !== params.selectedOption.sourceState) {
      return {
        ok: false,
        reason: "Payment DON!! attachment source is invalid.",
      };
    }
  }
  const selectedTargetId = selectedTargets[0];
  const target = attachDonTargetCandidates(
    params.state,
    params.playerId,
    params.player,
    params.selectedOption,
  ).find((candidate) => candidate.instanceId === selectedTargetId);
  if (target === undefined) {
    return { ok: false, reason: "Payment DON!! attachment target is invalid." };
  }

  const selectedDonSet = new Set(selectedDon);
  const targetsLeader = params.player.leader.instanceId === target.instanceId;
  const player = {
    ...params.player,
    leader: targetsLeader
      ? {
          ...params.player.leader,
          attachedDon: [...params.player.leader.attachedDon, ...selectedDon],
        }
      : params.player.leader,
    characters: params.player.characters.map((card) =>
      card.instanceId === target.instanceId
        ? { ...card, attachedDon: [...card.attachedDon, ...selectedDon] }
        : card,
    ),
    costArea: params.player.costArea.map((card) => {
      if (!selectedDonSet.has(card.instanceId)) {
        return card;
      }
      const attached = { ...card };
      delete attached.state;
      return attached;
    }),
  };
  const events: EngineEvent[] = [];
  for (const donId of selectedDon) {
    appendEvent(
      params.state,
      events,
      "donAttached",
      {
        playerId: params.playerId,
        donInstanceId: donId,
        targetInstanceId: target.instanceId,
      },
      { type: "replayOnly" },
    );
    const attached = events[events.length - 1];
    if (attached !== undefined) {
      attached.causedBy = { type: "decision", decisionId: params.decisionId };
    }
  }
  return {
    ok: true,
    costPaidPayload: {
      playerId: params.playerId,
      optionId: "attachDon",
      selectedDonInstanceIds: selectedDon,
      selectedCardInstanceIds: selectedTargets,
    },
    events,
    player,
  };
}
