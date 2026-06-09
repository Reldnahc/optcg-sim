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
  readonly apply: <T>(fn: () => T | Promise<T>) => Promise<T>;
  readonly record: <T>(fn: () => T) => T;
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

const actionTimingLogsEnabled = (): boolean => {
  const value = process.env["PONEGLYPH_SIM_ACTION_TIMING_LOGS"]
    ?.trim()
    .toLowerCase();
  return value === "true" || value === "1" || value === "on";
};

export const writeActionTimingLog = (input: ActionTimingLogInput): void => {
  if (!actionTimingLogsEnabled()) {
    return;
  }
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

export const recordActionTimingSpanAsync = async <T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> => {
  if (activeActionTimingSpans === undefined) {
    return await fn();
  }
  const startedAt = performance.now();
  try {
    return await fn();
  } finally {
    activeActionTimingSpans.push({
      name,
      ms: roundTimingMs(performance.now() - startedAt),
    });
  }
};

export const createSocketActionTiming = (raw: string): SocketActionTiming => {
  if (!actionTimingLogsEnabled()) {
    return {
      async apply(fn) {
        return await fn();
      },
      record(fn) {
        return fn();
      },
      write() {
        return;
      },
    };
  }
  const receivedAt = performance.now();
  let applyMs = 0;
  const spans: ActionTimingSpan[] = [];
  const runWithSpans = <T>(fn: () => T): T => {
    const previousSpans = activeActionTimingSpans;
    activeActionTimingSpans = spans;
    try {
      return fn();
    } finally {
      activeActionTimingSpans = previousSpans;
    }
  };
  return {
    async apply(fn) {
      const startedAt = performance.now();
      const previousSpans = activeActionTimingSpans;
      activeActionTimingSpans = spans;
      try {
        const result = await fn();
        applyMs = roundTimingMs(performance.now() - startedAt);
        return result;
      } finally {
        activeActionTimingSpans = previousSpans;
        applyMs = roundTimingMs(performance.now() - startedAt);
      }
    },
    record: runWithSpans,
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
        ...(spans.length === 0 ? {} : { spans }),
        totalServerMs: roundTimingMs(performance.now() - receivedAt),
      });
    },
  };
};
