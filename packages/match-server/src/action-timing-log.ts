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
  readonly spans?: readonly ActionTimingSpan[];
  readonly totalServerMs: number;
}

export interface ActionTimingSpan {
  readonly name: string;
  readonly ms: number;
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

let activeActionTimingSpans: ActionTimingSpan[] | undefined;

export const recordActionTimingSpan = <T>(name: string, fn: () => T): T => {
  if (activeActionTimingSpans === undefined) {
    return fn();
  }
  const startedAt = performance.now();
  try {
    return fn();
  } finally {
    activeActionTimingSpans.push({
      name,
      ms: roundTimingMs(performance.now() - startedAt),
    });
  }
};

export const createSocketActionTiming = (raw: string): SocketActionTiming => {
  const receivedAt = performance.now();
  let applyMs = 0;
  let spans: readonly ActionTimingSpan[] | undefined;
  return {
    apply(fn) {
      const startedAt = performance.now();
      const previousSpans = activeActionTimingSpans;
      const nextSpans: ActionTimingSpan[] = [];
      activeActionTimingSpans = nextSpans;
      try {
        const result = fn();
        applyMs = roundTimingMs(performance.now() - startedAt);
        spans = nextSpans;
        return result;
      } finally {
        activeActionTimingSpans = previousSpans;
      }
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
        ...(spans === undefined || spans.length === 0 ? {} : { spans }),
        totalServerMs: roundTimingMs(performance.now() - receivedAt),
      });
    },
  };
};
