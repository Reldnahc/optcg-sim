import type { GameState, ReplacementProcess } from "@optcg/types";

import { replacementProcessFromStoredPayload } from "./field-removal-targets.js";

type PendingDecision = NonNullable<GameState["pendingDecision"]>;
type ReplacementProcessState = GameState["replacementState"][number];

export type StoredReplacementContinuation<TPayload> = {
  readonly processId: ReplacementProcess["id"];
  readonly processType: ReplacementProcessState["type"];
  readonly processState: ReplacementProcessState;
  readonly payload: TPayload;
};

export const findReplacementContinuationPayload = <
  TPayload extends { decisionId: string },
>(params: {
  readonly state: GameState;
  readonly decision: PendingDecision | undefined;
  readonly decisionType: PendingDecision["type"];
  readonly pendingKey: string;
  readonly parsePayload: (payload: unknown) => TPayload | undefined;
}): StoredReplacementContinuation<TPayload> | null => {
  if (params.decision?.type !== params.decisionType) {
    return null;
  }
  const decision = params.decision;
  const processState = params.state.replacementState.find((candidate) => {
    const payload = candidate.payload;
    return (
      typeof payload === "object" &&
      payload !== null &&
      params.pendingKey in payload &&
      params.parsePayload(payload)?.decisionId === decision.id
    );
  });
  const payload =
    processState === undefined
      ? undefined
      : params.parsePayload(processState.payload);
  return processState === undefined || payload === undefined
    ? null
    : {
        processId: processState.processId,
        processType: processState.type,
        processState,
        payload,
      };
};

export const replacementPayloadWithoutPendingKey = (params: {
  readonly state: GameState;
  readonly processId: ReplacementProcess["id"];
  readonly pendingKey: string;
}): unknown => {
  const stored = params.state.replacementState.find(
    (candidate) => candidate.processId === params.processId,
  );
  const payload = stored?.payload;
  if (typeof payload !== "object" || payload === null) {
    return payload;
  }
  return Object.fromEntries(
    Object.entries(payload as Record<string, unknown>).filter(
      ([key]) => key !== params.pendingKey,
    ),
  );
};

export const replacementProcessFromContinuation = (params: {
  readonly causedBy: ReplacementProcess["causedBy"];
  readonly payload: unknown;
  readonly processId: ReplacementProcess["id"];
  readonly type: ReplacementProcessState["type"];
  readonly usedReplacementId: string;
}): ReplacementProcess | null =>
  replacementProcessFromStoredPayload({
    causedBy: params.causedBy,
    payload: params.payload,
    processId: params.processId,
    type: params.type,
    usedReplacementIds: [params.usedReplacementId],
  });
