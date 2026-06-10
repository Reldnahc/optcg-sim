import type {
  CardInstance,
  CardRef,
  CausalityRef,
  EngineEvent,
  GameState,
  PlayerId,
  PlayerState,
} from "@optcg/types";

import { appendEvent } from "../../action-results.js";

type DonSourceState = "active" | "rested";

type ApplyDonAttachmentParams = {
  readonly causedBy?: CausalityRef;
  readonly requireTargetOwnerMatchesSource?: boolean;
  readonly selectedDonInstanceIds: readonly CardInstance["instanceId"][];
  readonly sourcePlayerId: PlayerId;
  readonly sourceState?: DonSourceState;
  readonly state: GameState;
  readonly target: CardRef;
};

export type ApplyDonAttachmentResult =
  | {
      readonly ok: true;
      readonly events: readonly EngineEvent[];
      readonly players: GameState["players"];
      readonly selectedDon: readonly CardInstance[];
      readonly target: CardInstance;
    }
  | { readonly ok: false; readonly reason: string };

const findTargetHost = (
  player: PlayerState,
  target: CardRef,
):
  | { readonly kind: "leader"; readonly card: CardInstance }
  | {
      readonly kind: "character";
      readonly card: CardInstance;
      readonly index: number;
    }
  | undefined => {
  if (
    player.leader.instanceId === target.instanceId &&
    player.leader.cardId === target.cardId &&
    target.zone?.zone === "leaderArea"
  ) {
    return { kind: "leader", card: player.leader };
  }
  const index = player.characters.findIndex(
    (card) =>
      card.instanceId === target.instanceId &&
      card.cardId === target.cardId &&
      target.zone?.zone === "characterArea",
  );
  const card = player.characters[index];
  return index >= 0 && card !== undefined
    ? { kind: "character", card, index }
    : undefined;
};

export function applyDonAttachment(
  params: ApplyDonAttachmentParams,
): ApplyDonAttachmentResult {
  const sourcePlayer = params.state.players[params.sourcePlayerId];
  const targetPlayerId = params.target.playerId;
  const targetPlayer = params.state.players[targetPlayerId];
  if (sourcePlayer === undefined || targetPlayer === undefined) {
    return { ok: false, reason: "DON!! attachment player is invalid." };
  }
  if (
    params.requireTargetOwnerMatchesSource === true &&
    targetPlayerId !== params.sourcePlayerId
  ) {
    return { ok: false, reason: "DON!! attachment target owner is invalid." };
  }
  if (
    new Set(params.selectedDonInstanceIds).size !==
    params.selectedDonInstanceIds.length
  ) {
    return {
      ok: false,
      reason: "DON!! attachment selection contains duplicates.",
    };
  }

  const costAreaById = new Map(
    sourcePlayer.costArea.map((card) => [card.instanceId, card]),
  );
  const selectedDon: CardInstance[] = [];
  for (const donId of params.selectedDonInstanceIds) {
    const don = costAreaById.get(donId);
    if (
      don === undefined ||
      (params.sourceState !== undefined && don.state !== params.sourceState)
    ) {
      return { ok: false, reason: "DON!! attachment source is invalid." };
    }
    selectedDon.push(don);
  }

  const targetHost = findTargetHost(targetPlayer, params.target);
  if (targetHost === undefined) {
    return { ok: false, reason: "DON!! attachment target is invalid." };
  }

  const selectedDonSet = new Set(params.selectedDonInstanceIds);
  const nextLeader =
    targetHost.kind === "leader"
      ? {
          ...targetPlayer.leader,
          attachedDon: [
            ...targetPlayer.leader.attachedDon,
            ...params.selectedDonInstanceIds,
          ],
        }
      : targetPlayer.leader;
  const nextCharacters =
    targetHost.kind === "character"
      ? targetPlayer.characters.map((card, index) =>
          index === targetHost.index
            ? {
                ...card,
                attachedDon: [
                  ...card.attachedDon,
                  ...params.selectedDonInstanceIds,
                ],
              }
            : card,
        )
      : targetPlayer.characters;
  const nextCostArea = sourcePlayer.costArea.map((card) => {
    if (!selectedDonSet.has(card.instanceId)) {
      return card;
    }
    const attached = { ...card };
    delete attached.state;
    return attached;
  });

  const updatedTargetPlayer: PlayerState = {
    ...targetPlayer,
    leader: nextLeader,
    characters: nextCharacters,
  };
  const updatedSourcePlayer: PlayerState = {
    ...(params.sourcePlayerId === targetPlayerId
      ? updatedTargetPlayer
      : sourcePlayer),
    costArea: nextCostArea,
  };
  const players: GameState["players"] = {
    ...params.state.players,
    ...(params.sourcePlayerId === targetPlayerId
      ? { [params.sourcePlayerId]: updatedSourcePlayer }
      : {
          [params.sourcePlayerId]: updatedSourcePlayer,
          [targetPlayerId]: updatedTargetPlayer,
        }),
  };

  const events: EngineEvent[] = [];
  for (const don of selectedDon) {
    appendEvent(
      params.state,
      events,
      "donAttached",
      {
        playerId: params.sourcePlayerId,
        donInstanceId: don.instanceId,
        targetInstanceId: targetHost.card.instanceId,
      },
      { type: "replayOnly" },
    );
    const event = events[events.length - 1];
    if (event !== undefined && params.causedBy !== undefined) {
      event.causedBy = params.causedBy;
    }
  }

  return {
    ok: true,
    events,
    players,
    selectedDon,
    target: targetHost.card,
  };
}
