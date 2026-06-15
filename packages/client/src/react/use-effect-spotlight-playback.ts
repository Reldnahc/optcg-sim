import type {
  ActiveEffectTextPresentation,
  EffectTextSpanId,
} from "@optcg/types";

export type EffectSpotlightSourceMode = "live" | "resolved";

export interface EffectSpotlightActiveSourceInput {
  readonly active: ActiveEffectTextPresentation;
  readonly key: string;
  readonly mode: EffectSpotlightSourceMode;
}

export type EffectSpotlightPlaybackEntry = EffectSpotlightActiveSourceInput;

export interface EffectSpotlightPlaybackState {
  readonly entries: readonly EffectSpotlightPlaybackEntry[];
  readonly cursorIndex: number | undefined;
  readonly paused: boolean;
}

export type EffectSpotlightPlaybackCommand =
  | "autoAdvance"
  | "catchUp"
  | "pause"
  | "play"
  | "rewind"
  | "stepForward";

const spanKey = (spanIds: readonly EffectTextSpanId[]): string =>
  spanIds.join("\n");

export const activePresentationKey = (
  active: ActiveEffectTextPresentation,
): string =>
  [
    String(active.source.instanceId),
    active.textKind ?? "",
    spanKey(active.activeSpanIds),
  ].join("|");

const searchSpanPrefix = "span:search:";

const spotlightSourceSignatureBase = (
  source: EffectSpotlightActiveSourceInput,
): readonly string[] => [
  String(source.active.source.playerId),
  String(source.active.source.instanceId),
  String(source.active.source.cardId),
  source.active.textKind ?? "",
];

const spotlightSourceSignatures = (
  source: EffectSpotlightActiveSourceInput,
): readonly string[] => {
  const spanIds =
    source.active.activeSpanIds.length === 0
      ? [""]
      : source.active.activeSpanIds;
  return spanIds.map((spanId) =>
    [...spotlightSourceSignatureBase(source), spanId].join("|"),
  );
};

const spotlightSourceSearchGroupSignature = (
  source: EffectSpotlightActiveSourceInput,
): string | undefined =>
  source.active.activeSpanIds.some((spanId) =>
    spanId.startsWith(searchSpanPrefix),
  )
    ? [...spotlightSourceSignatureBase(source), "search"].join("|")
    : undefined;

const sourceSignaturesConsumed = (
  consumedSignatures: ReadonlySet<string>,
  source: EffectSpotlightActiveSourceInput,
): boolean => {
  const searchGroupSignature = spotlightSourceSearchGroupSignature(source);
  if (
    searchGroupSignature !== undefined &&
    consumedSignatures.has(searchGroupSignature)
  ) {
    return true;
  }
  return spotlightSourceSignatures(source).every((signature) =>
    consumedSignatures.has(signature),
  );
};

export const consumeSpotlightSourceSignatures = (
  consumedSignatures: Set<string>,
  sources: readonly EffectSpotlightActiveSourceInput[],
): void => {
  for (const source of sources) {
    for (const signature of spotlightSourceSignatures(source)) {
      consumedSignatures.add(signature);
    }
    const searchGroupSignature = spotlightSourceSearchGroupSignature(source);
    if (searchGroupSignature !== undefined) {
      consumedSignatures.add(searchGroupSignature);
    }
  }
};

const releaseSpotlightSourceExactSignatures = (
  consumedSignatures: Set<string>,
  source: EffectSpotlightActiveSourceInput,
): void => {
  for (const signature of spotlightSourceSignatures(source)) {
    consumedSignatures.delete(signature);
  }
};

export const appendSpotlightPlaybackSources = ({
  consumedKeys,
  initialCursorKey,
  suppressedResolvedSignatures,
  previous,
  sources,
}: {
  readonly consumedKeys: ReadonlySet<string>;
  readonly initialCursorKey?: string | undefined;
  readonly suppressedResolvedSignatures?: Set<string>;
  readonly previous: EffectSpotlightPlaybackState;
  readonly sources: readonly EffectSpotlightActiveSourceInput[];
}): EffectSpotlightPlaybackState => {
  const queuedKeys = new Set(previous.entries.map((source) => source.key));
  const searchGroupSignaturesToRelease = new Set<string>();
  let entries: EffectSpotlightPlaybackEntry[] | undefined;
  for (const source of sources) {
    if (consumedKeys.has(source.key) || queuedKeys.has(source.key)) {
      continue;
    }
    if (
      source.mode === "resolved" &&
      suppressedResolvedSignatures !== undefined &&
      sourceSignaturesConsumed(suppressedResolvedSignatures, source)
    ) {
      releaseSpotlightSourceExactSignatures(
        suppressedResolvedSignatures,
        source,
      );
      const searchGroupSignature = spotlightSourceSearchGroupSignature(source);
      if (
        searchGroupSignature !== undefined &&
        suppressedResolvedSignatures.has(searchGroupSignature)
      ) {
        searchGroupSignaturesToRelease.add(searchGroupSignature);
      }
      continue;
    }
    entries ??= [...previous.entries];
    entries.push(source);
    queuedKeys.add(source.key);
  }
  for (const signature of searchGroupSignaturesToRelease) {
    suppressedResolvedSignatures?.delete(signature);
  }
  if (entries === undefined) {
    return previous;
  }
  const initialCursorIndex =
    previous.entries.length === 0 && initialCursorKey !== undefined
      ? entries.findIndex((source) => source.key === initialCursorKey)
      : -1;
  return {
    entries,
    cursorIndex:
      previous.cursorIndex === undefined
        ? initialCursorIndex >= 0
          ? initialCursorIndex
          : previous.entries.length
        : previous.cursorIndex,
    paused: previous.paused,
  };
};

export const currentSpotlightPlaybackEntry = (
  playback: EffectSpotlightPlaybackState,
): EffectSpotlightPlaybackEntry | undefined => {
  if (playback.cursorIndex === undefined) {
    return undefined;
  }

  return playback.entries[playback.cursorIndex];
};

export const advanceSpotlightPlayback = ({
  command,
  state,
}: {
  readonly command: EffectSpotlightPlaybackCommand;
  readonly state: EffectSpotlightPlaybackState;
}): EffectSpotlightPlaybackState => {
  if (command === "catchUp") {
    return {
      ...state,
      cursorIndex:
        state.entries.length === 0 ? undefined : state.entries.length - 1,
      paused: false,
    };
  }
  if (command === "pause") {
    return { ...state, paused: true };
  }
  if (command === "play") {
    return { ...state, paused: false };
  }
  if (state.entries.length === 0) {
    return { ...state, cursorIndex: undefined };
  }
  const presentIndex = state.entries.length - 1;
  const cursorIndex = state.cursorIndex;
  if (command === "rewind") {
    return {
      ...state,
      cursorIndex:
        cursorIndex === undefined ? presentIndex : Math.max(0, cursorIndex - 1),
      paused: true,
    };
  }
  if (cursorIndex === undefined) {
    return state;
  }
  if (command === "stepForward") {
    return {
      ...state,
      cursorIndex: Math.min(presentIndex, cursorIndex + 1),
    };
  }
  if (state.paused) {
    return state;
  }
  if (cursorIndex < presentIndex) {
    return { ...state, cursorIndex: cursorIndex + 1 };
  }
  return { ...state, cursorIndex: undefined };
};

export const queuedResolvedSpotlightSources = ({
  consumedKeys,
  consumedSignatures = new Set<string>(),
  currentKey,
  previousQueue,
  sources,
}: {
  readonly consumedKeys: ReadonlySet<string>;
  readonly consumedSignatures?: ReadonlySet<string>;
  readonly currentKey: string | undefined;
  readonly previousQueue: readonly EffectSpotlightActiveSourceInput[];
  readonly sources: readonly EffectSpotlightActiveSourceInput[];
}): readonly EffectSpotlightActiveSourceInput[] => {
  const queuedKeys = new Set(previousQueue.map((source) => source.key));
  let next: EffectSpotlightActiveSourceInput[] | undefined;
  for (const source of sources) {
    if (
      source.mode === "resolved" &&
      source.key !== currentKey &&
      !consumedKeys.has(source.key) &&
      !sourceSignaturesConsumed(consumedSignatures, source) &&
      !queuedKeys.has(source.key)
    ) {
      next ??= [...previousQueue];
      next.push(source);
      queuedKeys.add(source.key);
    }
  }
  return next ?? previousQueue;
};

export const consumeResolvedSpotlightSourceKeys = (
  consumedKeys: Set<string>,
  sources: readonly EffectSpotlightActiveSourceInput[],
): void => {
  for (const source of sources) {
    if (source.mode === "resolved") {
      consumedKeys.add(source.key);
    }
  }
};
