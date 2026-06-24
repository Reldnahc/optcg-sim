import type {
  CombatSpotlightHistoryEntry,
  EffectSpotlightHistoryEntry,
  EffectTextSpotlightHistoryEntry,
  PlayedCardSpotlightHistoryEntry,
  PublicPendingDecisionId,
} from "@optcg/types";

export type EffectSpotlightSourceMode = "live" | "resolved";

export type EffectSpotlightActiveSourceInput = EffectSpotlightHistoryEntry;
export type EffectTextSpotlightActiveSourceInput =
  EffectTextSpotlightHistoryEntry;
export type CombatSpotlightActiveSourceInput = CombatSpotlightHistoryEntry;
export type PlayedCardSpotlightActiveSourceInput =
  PlayedCardSpotlightHistoryEntry;

export type EffectSpotlightPlaybackEntry = EffectSpotlightActiveSourceInput;

export interface EffectSpotlightPlaybackState {
  readonly entries: readonly EffectSpotlightPlaybackEntry[];
  readonly cursorIndex: number | undefined;
  readonly paused: boolean;
  readonly fastForwarded?: boolean;
  readonly consumedEntrySignatures?: readonly string[];
}

export type EffectSpotlightPlaybackCommand =
  | "autoAdvance"
  | "catchUp"
  | "pause"
  | "play"
  | "rewind"
  | "stepForward";

export const isCombatSpotlightSource = (
  source: EffectSpotlightActiveSourceInput,
): source is Extract<EffectSpotlightHistoryEntry, { kind: "combat" }> =>
  source.kind === "combat";

export const isPlayedCardSpotlightSource = (
  source: EffectSpotlightActiveSourceInput,
): source is Extract<EffectSpotlightHistoryEntry, { kind: "playedCard" }> =>
  source.kind === "playedCard";

const serverTimelineSourceKeys = (
  sources: readonly EffectSpotlightActiveSourceInput[],
): ReadonlySet<string> => new Set(sources.map((source) => source.key));

const serverTimelineSourceIds = (
  sources: readonly EffectSpotlightActiveSourceInput[],
): ReadonlySet<string> => new Set(sources.map((source) => source.id));

const serverTimelineKeepsEntry = ({
  entry,
  sourceIds,
  sourceKeys,
}: {
  readonly entry: EffectSpotlightPlaybackEntry;
  readonly sourceIds: ReadonlySet<string>;
  readonly sourceKeys: ReadonlySet<string>;
}): boolean => sourceKeys.has(entry.key) || sourceIds.has(entry.id);

const serverTimelineCursorIndex = ({
  entries,
  previousCursorEntry,
}: {
  readonly entries: readonly EffectSpotlightPlaybackEntry[];
  readonly previousCursorEntry: EffectSpotlightPlaybackEntry | undefined;
}): number | undefined => {
  if (previousCursorEntry === undefined) {
    return undefined;
  }
  const keyIndex = entries.findIndex(
    (entry) => entry.key === previousCursorEntry.key,
  );
  if (keyIndex >= 0) {
    return keyIndex;
  }
  const idIndex = entries.findIndex(
    (entry) => entry.id === previousCursorEntry.id,
  );
  return idIndex >= 0 ? idIndex : undefined;
};

const reconcileServerTimelinePlayback = ({
  previous,
  sources,
}: {
  readonly previous: EffectSpotlightPlaybackState;
  readonly sources: readonly EffectSpotlightActiveSourceInput[];
}): EffectSpotlightPlaybackState => {
  const sourceKeys = serverTimelineSourceKeys(sources);

  if (previous.entries.length === 0) {
    return previous;
  }

  const sourceIds = serverTimelineSourceIds(sources);
  const previousCursorEntry =
    previous.cursorIndex === undefined
      ? undefined
      : previous.entries[previous.cursorIndex];
  const entries = previous.entries.filter((entry) =>
    serverTimelineKeepsEntry({ entry, sourceIds, sourceKeys }),
  );
  if (entries.length === previous.entries.length) {
    return previous;
  }

  return {
    ...previous,
    entries,
    cursorIndex: serverTimelineCursorIndex({ entries, previousCursorEntry }),
  };
};

const cardRefSignature = (
  card: Readonly<{
    readonly playerId: unknown;
    readonly instanceId: unknown;
    readonly cardId: unknown;
  }>,
): string =>
  [String(card.playerId), String(card.instanceId), String(card.cardId)].join(
    ":",
  );

const playbackEntryConsumptionSignature = (
  entry: EffectSpotlightPlaybackEntry,
): string => {
  if (isCombatSpotlightSource(entry)) {
    return [
      "combat",
      entry.key,
      entry.id,
      entry.combat.eventKind,
      cardRefSignature(entry.combat.attacker),
      cardRefSignature(entry.combat.defender),
      entry.combat.attackerPower === undefined
        ? ""
        : String(entry.combat.attackerPower),
      entry.combat.defenderPower === undefined
        ? ""
        : String(entry.combat.defenderPower),
    ].join("|");
  }
  if (isPlayedCardSpotlightSource(entry)) {
    return [
      "playedCard",
      entry.key,
      entry.id,
      cardRefSignature(entry.source),
    ].join("|");
  }
  return [
    "effectText",
    entry.key,
    entry.id,
    entry.active.textKind ?? "effect",
    cardRefSignature(entry.active.source),
    entry.active.activeSpanIds.join("+"),
  ].join("|");
};

const consumedPlaybackEntrySignatures = (
  state: EffectSpotlightPlaybackState,
): ReadonlySet<string> => new Set(state.consumedEntrySignatures ?? []);

const withConsumedPlaybackEntries = (
  state: EffectSpotlightPlaybackState,
  entries: readonly EffectSpotlightPlaybackEntry[],
): EffectSpotlightPlaybackState => {
  if (entries.length === 0) {
    return state;
  }
  const consumedSignatures = new Set(state.consumedEntrySignatures ?? []);
  const previousSize = consumedSignatures.size;
  for (const entry of entries) {
    consumedSignatures.add(playbackEntryConsumptionSignature(entry));
  }
  if (consumedSignatures.size === previousSize) {
    return state;
  }
  return {
    ...state,
    consumedEntrySignatures: [...consumedSignatures],
  };
};

export const appendSpotlightPlaybackSources = ({
  initialCursorKey,
  previous,
  sources,
}: {
  readonly initialCursorKey?: string | undefined;
  readonly previous: EffectSpotlightPlaybackState;
  readonly sources: readonly EffectSpotlightActiveSourceInput[];
}): EffectSpotlightPlaybackState => {
  const reconciledPrevious = reconcileServerTimelinePlayback({
    previous,
    sources,
  });
  const queuedKeys = new Set(
    reconciledPrevious.entries.map((source) => source.key),
  );
  const queuedIds = new Set(
    reconciledPrevious.entries.map((source) => source.id),
  );
  const consumedSignatures =
    consumedPlaybackEntrySignatures(reconciledPrevious);
  let entries: EffectSpotlightPlaybackEntry[] | undefined;
  let firstUnconsumedAppendedIndex: number | undefined;
  for (const source of sources) {
    const sourceConsumptionSignature =
      playbackEntryConsumptionSignature(source);
    const existingIndex = reconciledPrevious.entries.findIndex(
      (entry) => entry.key === source.key || entry.id === source.id,
    );
    if (existingIndex >= 0) {
      const existing = reconciledPrevious.entries[existingIndex];
      if (
        existing !== undefined &&
        playbackEntryConsumptionSignature(existing) !==
          sourceConsumptionSignature
      ) {
        entries ??= [...reconciledPrevious.entries];
        entries[existingIndex] = source;
        if (!consumedSignatures.has(sourceConsumptionSignature)) {
          firstUnconsumedAppendedIndex ??= existingIndex;
        }
      }
      queuedKeys.add(source.key);
      queuedIds.add(source.id);
      continue;
    }
    if (queuedKeys.has(source.key) || queuedIds.has(source.id)) {
      continue;
    }
    entries ??= [...reconciledPrevious.entries];
    if (!consumedSignatures.has(sourceConsumptionSignature)) {
      firstUnconsumedAppendedIndex ??= entries.length;
    }
    entries.push(source);
    queuedKeys.add(source.key);
    queuedIds.add(source.id);
  }
  if (entries === undefined) {
    return reconciledPrevious;
  }
  const initialCursorIndex =
    reconciledPrevious.entries.length === 0 && initialCursorKey !== undefined
      ? entries.findIndex((source) => source.key === initialCursorKey)
      : -1;
  const initialCursorEntry =
    initialCursorIndex >= 0 ? entries[initialCursorIndex] : undefined;
  const usableInitialCursorIndex =
    initialCursorEntry === undefined ? -1 : initialCursorIndex;
  return {
    entries,
    cursorIndex:
      reconciledPrevious.cursorIndex === undefined
        ? usableInitialCursorIndex >= 0
          ? usableInitialCursorIndex
          : firstUnconsumedAppendedIndex
        : reconciledPrevious.cursorIndex,
    paused: reconciledPrevious.paused,
    fastForwarded: reconciledPrevious.fastForwarded ?? false,
    ...(reconciledPrevious.consumedEntrySignatures === undefined
      ? {}
      : {
          consumedEntrySignatures: reconciledPrevious.consumedEntrySignatures,
        }),
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

const currentPendingDecisionIndex = ({
  pendingDecisionId,
  state,
}: {
  readonly pendingDecisionId: PublicPendingDecisionId | undefined;
  readonly state: EffectSpotlightPlaybackState;
}): number => {
  if (pendingDecisionId === undefined) {
    return -1;
  }
  const currentDecisionId = String(pendingDecisionId);
  return state.entries.findLastIndex(
    (entry) =>
      entry.mode === "live" &&
      entry.kind !== "combat" &&
      entry.kind !== "playedCard" &&
      entry.pendingDecisionId !== undefined &&
      String(entry.pendingDecisionId) === currentDecisionId,
  );
};

export const advanceSpotlightPlayback = ({
  command,
  pendingDecisionId,
  state,
}: {
  readonly command: EffectSpotlightPlaybackCommand;
  readonly pendingDecisionId?: PublicPendingDecisionId | undefined;
  readonly state: EffectSpotlightPlaybackState;
}): EffectSpotlightPlaybackState => {
  if (command === "catchUp") {
    const pendingIndex = currentPendingDecisionIndex({
      pendingDecisionId,
      state,
    });
    const consumedState = withConsumedPlaybackEntries(
      state,
      pendingIndex >= 0 ? state.entries.slice(0, pendingIndex) : state.entries,
    );
    return {
      ...consumedState,
      cursorIndex: pendingIndex >= 0 ? pendingIndex : undefined,
      paused: false,
      fastForwarded: true,
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
      fastForwarded: false,
    };
  }
  if (cursorIndex === undefined) {
    return state;
  }
  if (command === "stepForward") {
    return withConsumedPlaybackEntries(
      {
        ...state,
        cursorIndex: Math.min(presentIndex, cursorIndex + 1),
        fastForwarded: false,
      },
      state.entries.slice(cursorIndex, cursorIndex + 1),
    );
  }
  if (state.paused) {
    return state;
  }
  if (cursorIndex < presentIndex) {
    return withConsumedPlaybackEntries(
      { ...state, cursorIndex: cursorIndex + 1, fastForwarded: false },
      state.entries.slice(cursorIndex, cursorIndex + 1),
    );
  }
  return withConsumedPlaybackEntries(
    { ...state, cursorIndex: undefined, fastForwarded: false },
    state.entries.slice(cursorIndex, cursorIndex + 1),
  );
};
