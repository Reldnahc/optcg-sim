import type {
  CardInstance,
  EngineEvent,
  GameState,
  OptionalPayCostDecision,
  PaymentResponse,
  PlayerId,
  PlayerRef,
  PlayerState,
  Target,
  TargetRequest,
} from "@optcg/types";

import { appendEvent } from "../../action-results.js";
import {
  cardMatchesHandSelectionFilter,
  getOpponentId,
} from "../../actions/state.js";

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
  if (target === undefined) {
    return { ok: false, reason: "Payment DON!! attachment target is invalid." };
  }
  const selectedDonSet = new Set(selectedDon);
  const targetPlayerId = target.zone.playerId;
  if (targetPlayerId === undefined) {
    return { ok: false, reason: "Payment DON!! attachment target is invalid." };
  }
  const targetPlayer = params.state.players[targetPlayerId];
  if (targetPlayer === undefined) {
    return { ok: false, reason: "Payment DON!! attachment target is invalid." };
  }
  const targetsLeader = targetPlayer.leader.instanceId === target.instanceId;
  const updatedTargetPlayer: PlayerState = {
    ...targetPlayer,
    leader: targetsLeader
      ? {
          ...targetPlayer.leader,
          attachedDon: [...targetPlayer.leader.attachedDon, ...selectedDon],
        }
      : targetPlayer.leader,
    characters: targetPlayer.characters.map((card) =>
      card.instanceId === target.instanceId
        ? { ...card, attachedDon: [...card.attachedDon, ...selectedDon] }
        : card,
    ),
  };
  const sourceBase =
    sourcePlayerId === targetPlayerId ? updatedTargetPlayer : sourcePlayer;
  const updatedSourcePlayer: PlayerState = {
    ...sourceBase,
    costArea: sourcePlayer.costArea.map((card) => {
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
        playerId: sourcePlayerId,
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
    players: {
      ...params.state.players,
      ...(sourcePlayerId === targetPlayerId
        ? { [sourcePlayerId]: updatedSourcePlayer }
        : {
            [sourcePlayerId]: updatedSourcePlayer,
            [targetPlayerId]: updatedTargetPlayer,
          }),
    },
  };
}
