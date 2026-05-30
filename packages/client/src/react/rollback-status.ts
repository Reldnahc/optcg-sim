import type { PlayerId } from "@optcg/types";

import type { MatchSnapshot } from "../transport.js";

export interface RollbackStatusModel {
  message: string;
  canCancel: boolean;
}

export const rollbackStatusForPlayer = (
  snapshot: MatchSnapshot | undefined,
  playerId: PlayerId | undefined,
): RollbackStatusModel | undefined => {
  const pendingRequest = snapshot?.rollback?.pendingRequest;
  if (pendingRequest === undefined || playerId === undefined) {
    return undefined;
  }
  if (pendingRequest.requestedBy === playerId) {
    return {
      message: "Rollback requested. Waiting for opponent.",
      canCancel: true,
    };
  }
  return pendingRequest.approvingPlayerId === playerId
    ? {
        message: "Opponent requested a rollback.",
        canCancel: false,
      }
    : undefined;
};
