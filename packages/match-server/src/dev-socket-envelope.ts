import type {
  DecisionId,
  DecisionResponse,
  MatchId,
  PlayerId,
} from "@optcg/types";

interface DevActionRequest {
  playerId: PlayerId;
  actionIndex: number;
  expectedStateSeq?: number;
}

interface DevDecisionRequest {
  playerId: PlayerId;
  decisionId: DecisionId;
  response: DecisionResponse;
}

interface DevRollbackRequest {
  playerId: PlayerId;
  rollbackPointId: string;
  expectedStateSeq?: number;
}

interface DevSocketActionEnvelope extends DevActionRequest {
  type: "submitAction";
  matchId: MatchId;
  clientActionId: string;
}

interface DevSocketDecisionEnvelope extends DevDecisionRequest {
  type: "respondToDecision";
  matchId: MatchId;
  clientActionId: string;
}

interface DevSocketRollbackEnvelope extends DevRollbackRequest {
  type: "requestRollback";
  matchId: MatchId;
  clientActionId: string;
}

export type DevSocketEnvelope =
  | DevSocketActionEnvelope
  | DevSocketDecisionEnvelope
  | DevSocketRollbackEnvelope;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isDevActionRequest = (value: unknown): value is DevActionRequest => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value["playerId"] === "string" &&
    Number.isInteger(value["actionIndex"]) &&
    (value["expectedStateSeq"] === undefined ||
      Number.isInteger(value["expectedStateSeq"]))
  );
};

const isDevDecisionRequest = (value: unknown): value is DevDecisionRequest => {
  if (!isRecord(value)) {
    return false;
  }
  const response = value["response"];
  return (
    typeof value["playerId"] === "string" &&
    typeof value["decisionId"] === "string" &&
    isRecord(response) &&
    typeof response["type"] === "string"
  );
};

const isDevRollbackRequest = (value: unknown): value is DevRollbackRequest => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value["playerId"] === "string" &&
    typeof value["rollbackPointId"] === "string" &&
    (value["expectedStateSeq"] === undefined ||
      Number.isInteger(value["expectedStateSeq"]))
  );
};

export const isDevSocketEnvelope = (
  value: unknown,
): value is DevSocketEnvelope => {
  if (!isRecord(value)) {
    return false;
  }
  if (
    value["type"] === "submitAction" &&
    typeof value["matchId"] === "string" &&
    typeof value["clientActionId"] === "string"
  ) {
    return isDevActionRequest(value);
  }
  if (
    value["type"] === "respondToDecision" &&
    typeof value["matchId"] === "string" &&
    typeof value["clientActionId"] === "string"
  ) {
    return isDevDecisionRequest(value);
  }
  if (
    value["type"] === "requestRollback" &&
    typeof value["matchId"] === "string" &&
    typeof value["clientActionId"] === "string"
  ) {
    return isDevRollbackRequest(value);
  }
  return false;
};
