import type {
  CardInstance,
  GameState,
  OptionalPayCostDecision,
  PaymentResponse,
  PlayerId,
  PlayerRef,
  PlayerState,
  Target,
  TargetRequest,
} from "@optcg/types";

import {
  cardMatchesHandSelectionFilter,
  getOpponentId,
  toCardRef,
} from "../../actions/state.js";
import { applyDonAttachment } from "../primitives/don-attachment.js";

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
      events: readonly GameState["eventJournal"][number][];
      players: GameState["players"];
    }
  | { ok: false; reason: string };

const resolvePaymentPlayerId = (
  state: GameState,
  controllerId: PlayerId,
  player: PlayerRef | undefined,
): PlayerId | undefined => {
  if (player === undefined || player === "self") {
    return controllerId;
  }
  if (player === "opponent") {
    return getOpponentId(state, controllerId) ?? undefined;
  }
  return undefined;
};

const resolveTargetPlayerIds = (
  state: GameState,
  controllerId: PlayerId,
  player: TargetRequest["player"],
): PlayerId[] => {
  if (player === "anyPlayer") {
    const opponentId = getOpponentId(state, controllerId);
    return opponentId === null ? [controllerId] : [controllerId, opponentId];
  }
  const playerId = resolvePaymentPlayerId(state, controllerId, player);
  return playerId === undefined ? [] : [playerId];
};

const targetRequest = (
  target: Target,
):
  | Extract<Target, { type: "choose" }>["request"]
  | Extract<Target, { type: "chooseFromZones" }>["request"]
  | null => {
  if (target.type === "choose") {
    return target.request;
  }
  if (target.type === "chooseFromZones") {
    return target.request;
  }
  return null;
};

const targetZones = (
  request: NonNullable<ReturnType<typeof targetRequest>>,
): readonly string[] => ("zones" in request ? request.zones : [request.zone]);

export const attachDonSourceIds = (
  state: GameState,
  playerId: PlayerId,
  option: AttachDonPaymentOption,
): CardInstance["instanceId"][] => {
  const sourcePlayerId = resolvePaymentPlayerId(
    state,
    playerId,
    option.sourcePlayer,
  );
  const player =
    sourcePlayerId === undefined ? undefined : state.players[sourcePlayerId];
  return (
    player?.costArea
      .filter((card) => card.state === option.sourceState)
      .map((card) => card.instanceId) ?? []
  );
};

export const attachDonTargetCandidates = (
  state: GameState,
  playerId: PlayerId,
  option: AttachDonPaymentOption,
): readonly CardInstance[] => {
  const request = targetRequest(option.target);
  if (request === null) {
    return [];
  }
  if (
    request.chooser !== "self" ||
    request.min !== 1 ||
    request.max !== 1 ||
    request.allowFewerIfUnavailable ||
    request.visibility !== "public"
  ) {
    return [];
  }
  const targetPlayerIds = resolveTargetPlayerIds(
    state,
    playerId,
    request.player,
  );
  return targetPlayerIds.flatMap((targetPlayerId) => {
    const player = state.players[targetPlayerId];
    if (player === undefined) {
      return [];
    }
    const candidates = targetZones(request).flatMap((zone) => {
      if (zone === "leaderArea") {
        return [player.leader];
      }
      if (zone === "characterArea") {
        return player.characters;
      }
      return [];
    });
    return candidates.filter((card) =>
      cardMatchesHandSelectionFilter(
        state,
        targetPlayerId,
        card,
        request.filter,
      ),
    );
  });
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

  const sourcePlayerId = resolvePaymentPlayerId(
    params.state,
    params.playerId,
    params.selectedOption.sourcePlayer,
  );
  const sourcePlayer =
    sourcePlayerId === undefined
      ? undefined
      : params.state.players[sourcePlayerId];
  if (sourcePlayerId === undefined || sourcePlayer === undefined) {
    return {
      ok: false,
      reason: "Payment DON!! attachment source is invalid.",
    };
  }
  const costAreaById = new Map(
    sourcePlayer.costArea.map((card) => [card.instanceId, card]),
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
    params.selectedOption,
  ).find((candidate) => candidate.instanceId === selectedTargetId);
  if (target === undefined || target.zone.playerId === undefined) {
    return { ok: false, reason: "Payment DON!! attachment target is invalid." };
  }
  const attached = applyDonAttachment({
    causedBy: { type: "decision", decisionId: params.decisionId },
    selectedDonInstanceIds: selectedDon,
    sourcePlayerId,
    sourceState: params.selectedOption.sourceState,
    state: params.state,
    target: toCardRef(target, target.zone.playerId),
  });
  if (!attached.ok) {
    return {
      ok: false,
      reason:
        attached.reason === "DON!! attachment target is invalid."
          ? "Payment DON!! attachment target is invalid."
          : "Payment DON!! attachment source is invalid.",
    };
  }
  return {
    ok: true,
    costPaidPayload: {
      playerId: params.playerId,
      optionId: "attachDon",
      selectedDonInstanceIds: selectedDon,
      selectedCardInstanceIds: selectedTargets,
    },
    events: attached.events,
    players: attached.players,
  };
}
