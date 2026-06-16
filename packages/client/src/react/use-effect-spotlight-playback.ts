import type {
  ActiveEffectTextPresentation,
  CombatSpotlightPresentation,
  DecisionId,
  EffectTextSpanId,
} from "@optcg/types";

export type EffectSpotlightSourceMode = "live" | "resolved";
export type EffectSpotlightSourceKind = "serverTimeline" | "legacyFallback";

export interface EffectTextSpotlightActiveSourceInput {
  readonly kind?: "effectText";
  readonly active: ActiveEffectTextPresentation;
  readonly id?: string;
  readonly key: string;
  readonly semanticKey?: string;
  readonly mode: EffectSpotlightSourceMode;
  readonly status?: "pending" | "resolved";
  readonly pendingDecisionId?: DecisionId | string;
}

export interface CombatSpotlightActiveSourceInput {
  readonly kind: "combat";
  readonly combat: CombatSpotlightPresentation;
  readonly id?: string;
  readonly key: string;
  readonly semanticKey?: string;
  readonly mode: EffectSpotlightSourceMode;
  readonly status?: "pending" | "resolved";
  readonly pendingDecisionId?: DecisionId | string;
}

export type EffectSpotlightActiveSourceInput =
  | EffectTextSpotlightActiveSourceInput
  | CombatSpotlightActiveSourceInput;

export type EffectSpotlightPlaybackEntry = EffectSpotlightActiveSourceInput;

export interface EffectSpotlightPlaybackState {
  readonly entries: readonly EffectSpotlightPlaybackEntry[];
  readonly cursorIndex: number | undefined;
  readonly paused: boolean;
  readonly fastForwarded?: boolean;
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

export const isCombatSpotlightSource = (
  source: EffectSpotlightActiveSourceInput,
): source is CombatSpotlightActiveSourceInput => source.kind === "combat";

const spotlightSourceSignatureBase = (
  source: EffectTextSpotlightActiveSourceInput,
): readonly string[] => [
  String(source.active.source.playerId),
  String(source.active.source.instanceId),
  String(source.active.source.cardId),
  source.active.textKind ?? "",
];

const combatSpotlightSourceSignature = (
  source: CombatSpotlightActiveSourceInput,
): string =>
  [
    "combat",
    source.combat.eventKind,
    String(source.combat.attacker.playerId),
    String(source.combat.attacker.instanceId),
    String(source.combat.attacker.cardId),
    String(source.combat.defender.playerId),
    String(source.combat.defender.instanceId),
    String(source.combat.defender.cardId),
    source.combat.attackerPower === undefined
      ? ""
      : String(source.combat.attackerPower),
    source.combat.defenderPower === undefined
      ? ""
      : String(source.combat.defenderPower),
  ].join("|");

const spotlightSourceSignatures = (
  source: EffectSpotlightActiveSourceInput,
): readonly string[] => {
  if (isCombatSpotlightSource(source)) {
    return [combatSpotlightSourceSignature(source)];
  }
  const spanIds =
    source.active.activeSpanIds.length === 0
      ? [""]
      : source.active.activeSpanIds;
  return spanIds.map((spanId) =>
    [...spotlightSourceSignatureBase(source), spanId].join("|"),
  );
};

const sourceSignaturesConsumed = (
  consumedSignatures: ReadonlySet<string>,
  source: EffectSpotlightActiveSourceInput,
): boolean => {
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

const targetLinkSignature = (
  source: EffectSpotlightActiveSourceInput,
): string => {
  if (isCombatSpotlightSource(source)) {
    return "";
  }
  const activeSpanIds = new Set(source.active.activeSpanIds);
  return (source.active.targetLinks ?? [])
    .filter((link) => activeSpanIds.has(link.spanId) && link.cards.length > 0)
    .map((link) =>
      [
        link.spanId,
        link.relation,
        ...link.cards.map((card) =>
          [
            String(card.playerId),
            String(card.instanceId),
            String(card.cardId),
          ].join("|"),
        ),
      ].join(">"),
    )
    .join("\n");
};

const shouldReplayServerTimelineReplacement = (
  previous: EffectSpotlightPlaybackEntry,
  next: EffectSpotlightActiveSourceInput,
): boolean => {
  const previousTargetSignature = targetLinkSignature(previous);
  const nextTargetSignature = targetLinkSignature(next);
  return (
    nextTargetSignature !== "" &&
    previousTargetSignature !== nextTargetSignature
  );
};

const shouldReplaceServerTimelineEntry = (
  previous: EffectSpotlightPlaybackEntry,
  next: EffectSpotlightActiveSourceInput,
): boolean =>
  previous.semanticKey !== undefined &&
  previous.semanticKey === next.semanticKey &&
  previous.mode !== next.mode;

export const appendSpotlightPlaybackSources = ({
  consumedKeys,
  initialCursorKey,
  suppressedResolvedSignatures,
  previous,
  sourceKind = "legacyFallback",
  sources,
}: {
  readonly consumedKeys: ReadonlySet<string>;
  readonly initialCursorKey?: string | undefined;
  readonly suppressedResolvedSignatures?: Set<string>;
  readonly previous: EffectSpotlightPlaybackState;
  readonly sourceKind?: EffectSpotlightSourceKind | undefined;
  readonly sources: readonly EffectSpotlightActiveSourceInput[];
}): EffectSpotlightPlaybackState => {
  const queuedKeys = new Set(previous.entries.map((source) => source.key));
  let entries: EffectSpotlightPlaybackEntry[] | undefined;
  let firstAppendedIndex: number | undefined;
  let replacementReplayIndex: number | undefined;
  for (const source of sources) {
    if (sourceKind === "serverTimeline" && source.semanticKey !== undefined) {
      const semanticIndex = previous.entries.findIndex((entry) =>
        shouldReplaceServerTimelineEntry(entry, source),
      );
      if (semanticIndex >= 0) {
        const previousEntry = previous.entries[semanticIndex];
        entries ??= [...previous.entries];
        entries[semanticIndex] = source;
        queuedKeys.add(source.key);
        if (
          previousEntry !== undefined &&
          previous.cursorIndex === undefined &&
          previous.fastForwarded !== true &&
          shouldReplayServerTimelineReplacement(previousEntry, source)
        ) {
          replacementReplayIndex ??= semanticIndex;
        }
        continue;
      }
    }
    if (sourceKind === "serverTimeline") {
      const keyIndex = previous.entries.findIndex(
        (entry) => entry.key === source.key,
      );
      if (keyIndex >= 0) {
        const previousEntry = previous.entries[keyIndex];
        entries ??= [...previous.entries];
        entries[keyIndex] = source;
        queuedKeys.add(source.key);
        if (
          previousEntry !== undefined &&
          previous.cursorIndex === undefined &&
          previous.fastForwarded !== true &&
          shouldReplayServerTimelineReplacement(previousEntry, source)
        ) {
          replacementReplayIndex ??= keyIndex;
        }
        continue;
      }
    }
    if (consumedKeys.has(source.key) || queuedKeys.has(source.key)) {
      continue;
    }
    if (
      sourceKind !== "serverTimeline" &&
      source.mode === "resolved" &&
      suppressedResolvedSignatures !== undefined &&
      sourceSignaturesConsumed(suppressedResolvedSignatures, source)
    ) {
      releaseSpotlightSourceExactSignatures(
        suppressedResolvedSignatures,
        source,
      );
      continue;
    }
    entries ??= [...previous.entries];
    firstAppendedIndex ??= entries.length;
    entries.push(source);
    queuedKeys.add(source.key);
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
          : (replacementReplayIndex ?? firstAppendedIndex)
        : previous.cursorIndex,
    paused: previous.paused,
    fastForwarded: previous.fastForwarded ?? false,
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
    const pendingIndex = state.entries.findLastIndex(
      (entry) => entry.pendingDecisionId !== undefined,
    );
    return {
      ...state,
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
    return {
      ...state,
      cursorIndex: Math.min(presentIndex, cursorIndex + 1),
      fastForwarded: false,
    };
  }
  if (state.paused) {
    return state;
  }
  if (cursorIndex < presentIndex) {
    return { ...state, cursorIndex: cursorIndex + 1, fastForwarded: false };
  }
  return { ...state, cursorIndex: undefined, fastForwarded: false };
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
