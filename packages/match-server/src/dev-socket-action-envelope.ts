import type { DevSocketEnvelope } from "./dev-socket-envelope.js";
import type { ClientActionEnvelope } from "./session-types.js";

export const clientActionEnvelopeFromSocketPayload = (
  payload: DevSocketEnvelope,
): ClientActionEnvelope => {
  const request =
    payload.type === "submitAction"
      ? {
          type: payload.type,
          playerId: payload.playerId,
          actionIndex: payload.actionIndex,
          expectedStateSeq: payload.expectedStateSeq,
        }
      : payload.type === "respondToDecision"
        ? {
            type: payload.type,
            playerId: payload.playerId,
            decisionId: payload.decisionId,
            response: payload.response,
          }
        : payload.type === "requestRollback"
          ? {
              type: payload.type,
              playerId: payload.playerId,
              rollbackPointId: payload.rollbackPointId,
              expectedStateSeq: payload.expectedStateSeq,
            }
          : {
              type: payload.type,
              playerId: payload.playerId,
              expectedStateSeq: payload.expectedStateSeq,
            };
  return {
    protocolVersion: "dev",
    matchId: payload.matchId,
    playerId: payload.playerId,
    clientActionId: payload.clientActionId,
    expectedStateSeq: payload.expectedStateSeq,
    ...(payload.type !== "respondToDecision"
      ? {}
      : { expectedDecisionId: payload.expectedDecisionId }),
    requestHash: payload.requestHash,
    request,
  };
};
