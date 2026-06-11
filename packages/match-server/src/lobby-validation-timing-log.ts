export interface LobbyValidationTimingSpan {
  readonly name: string;
  readonly ms: number;
  readonly count?: number;
}

export interface LobbyValidationTimingLogInput {
  readonly route: "loadouts.validate" | "decks.validate";
  readonly lobbyId: string;
  readonly loadoutCount: number;
  readonly spans: readonly LobbyValidationTimingSpan[];
  readonly totalMs: number;
}

export const roundLobbyValidationTimingMs = (value: number): number =>
  Math.round(value * 10) / 10;

const lobbyValidationTimingLogsEnabled = (): boolean => {
  const value = process.env["PONEGLYPH_SIM_LOBBY_VALIDATION_TIMING_LOGS"]
    ?.trim()
    .toLowerCase();
  return value === "true" || value === "1" || value === "on";
};

export const writeLobbyValidationTimingLog = (
  input: LobbyValidationTimingLogInput,
): void => {
  if (!lobbyValidationTimingLogsEnabled()) {
    return;
  }
  process.stdout.write(
    `${JSON.stringify({
      type: "simLobbyValidationTiming",
      at: new Date().toISOString(),
      ...input,
    })}\n`,
  );
};

export const recordLobbyValidationTimingSpan = async <T>(
  spans: LobbyValidationTimingSpan[],
  name: string,
  fn: () => Promise<T>,
  options: { readonly count?: number } = {},
): Promise<T> => {
  const startedAt = performance.now();
  try {
    return await fn();
  } finally {
    spans.push({
      name,
      ms: roundLobbyValidationTimingMs(performance.now() - startedAt),
      ...(options.count === undefined ? {} : { count: options.count }),
    });
  }
};
