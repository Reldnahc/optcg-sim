import type {
  ClientActionEnvelope,
  SessionActionResult,
} from "./session-types.js";

export interface ActionTimingLogInput {
  readonly matchId: string;
  readonly playerId: string;
  readonly clientActionId: unknown;
  readonly requestType: string;
  readonly actionIndex?: number;
  readonly accepted: boolean;
  readonly stateSeq: number;
  readonly rawBytes: number;
  readonly applyMs: number;
  readonly totalServerMs: number;
}

export interface SocketActionTiming {
  readonly apply: <T>(fn: () => T) => T;
  readonly write: (input: SocketActionTimingLogInput) => void;
}

export interface SocketActionTimingLogInput {
  readonly matchId: string;
  readonly playerId: string;
  readonly payload: { readonly clientActionId?: unknown };
  readonly envelope: ClientActionEnvelope;
  readonly result: SessionActionResult;
}

export const roundTimingMs = (value: number): number =>
  Math.round(value * 10) / 10;

export const writeActionTimingLog = (input: ActionTimingLogInput): void => {
  process.stdout.write(
    `${JSON.stringify({
      type: "simActionTiming",
      at: new Date().toISOString(),
      ...input,
    })}\n`,
  );
};

export const createSocketActionTiming = (raw: string): SocketActionTiming => {
  const receivedAt = performance.now();
  let applyMs = 0;
  return {
    apply(fn) {
      const startedAt = performance.now();
      const result = fn();
      applyMs = roundTimingMs(performance.now() - startedAt);
      return result;
    },
    write(input) {
      const request = input.envelope.request;
      writeActionTimingLog({
        matchId: input.matchId,
        playerId: input.playerId,
        clientActionId: input.payload.clientActionId,
        requestType: request.type,
        ...(request.type === "submitAction"
          ? { actionIndex: request.actionIndex }
          : {}),
        accepted: input.result.accepted,
        stateSeq: input.result.stateSeq,
        rawBytes: Buffer.byteLength(raw),
        applyMs,
        totalServerMs: roundTimingMs(performance.now() - receivedAt),
      });
    },
  };
};
