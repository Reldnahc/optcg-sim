import type {
  ActiveEffectTextPresentation,
  CombatSpotlightPresentation,
  DecisionId,
  EffectTextSpanId,
} from "@optcg/types";

import {
  currentSpotlightPlaybackEntry,
  isCombatSpotlightSource,
  type EffectSpotlightPlaybackEntry,
  type EffectSpotlightPlaybackState,
} from "./use-effect-spotlight-playback.js";

export interface EffectSpotlightState {
  readonly entry: EffectSpotlightPlaybackEntry;
  readonly active?: ActiveEffectTextPresentation | undefined;
  readonly combat?: CombatSpotlightPresentation | undefined;
  readonly activeKey: string;
  readonly activeMode: "live" | "resolved";
  readonly sourceInstanceId: string;
  readonly activeSpanIds: readonly EffectTextSpanId[];
  readonly shownAtMs: number;
  readonly visibleUntilMs: number;
  readonly pinned: boolean;
  readonly cursorVersion?: number | undefined;
}

export interface EffectSpotlightModelInput {
  readonly nowMs: number;
  readonly previous: EffectSpotlightState | undefined;
  readonly minimumDwellMs: number;
  readonly graceMs: number;
  readonly entry: EffectSpotlightPlaybackEntry | undefined;
  readonly cursorVersion?: number | undefined;
  readonly pendingDecisionId: DecisionId | string | undefined;
}

export interface EffectSpotlightDisplayInput {
  readonly nowMs: number;
  readonly previous: EffectSpotlightState | undefined;
  readonly minimumDwellMs: number;
  readonly graceMs: number;
  readonly entry: EffectSpotlightPlaybackEntry | undefined;
  readonly cursorVersion?: number | undefined;
  readonly previousCursorVersion?: number | undefined;
  readonly pendingDecisionId: DecisionId | string | undefined;
}

const liveEntryMatchesPendingDecision = (
  entry: EffectSpotlightPlaybackEntry,
  pendingDecisionId: DecisionId | string | undefined,
): boolean =>
  pendingDecisionId !== undefined &&
  entry.mode === "live" &&
  entry.pendingDecisionId !== undefined &&
  String(entry.pendingDecisionId) === String(pendingDecisionId);

const spanKey = (spanIds: readonly EffectTextSpanId[]): string =>
  spanIds.join("\n");

const entrySourceInstanceId = (entry: EffectSpotlightPlaybackEntry): string =>
  isCombatSpotlightSource(entry)
    ? String(entry.combat.attacker.instanceId)
    : String(entry.active.source.instanceId);

const entrySpanIds = (
  entry: EffectSpotlightPlaybackEntry,
): readonly EffectTextSpanId[] =>
  isCombatSpotlightSource(entry) ? [] : entry.active.activeSpanIds;

const sameSpotlightEntry = (
  previous: EffectSpotlightState,
  entry: EffectSpotlightPlaybackEntry,
  activeKey: string,
): boolean =>
  previous.activeKey === activeKey &&
  previous.entry.kind === entry.kind &&
  previous.sourceInstanceId === entrySourceInstanceId(entry) &&
  spanKey(previous.activeSpanIds) === spanKey(entrySpanIds(entry));

export const effectSpotlightModel = ({
  cursorVersion,
  entry,
  graceMs,
  minimumDwellMs,
  nowMs,
  pendingDecisionId,
  previous,
}: EffectSpotlightModelInput): EffectSpotlightState | undefined => {
  if (entry !== undefined) {
    const nextActiveKey = entry.key;
    const activeMode = entry.mode;
    if (
      previous !== undefined &&
      sameSpotlightEntry(previous, entry, nextActiveKey)
    ) {
      return {
        ...previous,
        entry,
        ...(isCombatSpotlightSource(entry)
          ? { combat: entry.combat }
          : { active: entry.active }),
        activeKey: nextActiveKey,
        activeMode,
        sourceInstanceId: entrySourceInstanceId(entry),
        activeSpanIds: entrySpanIds(entry),
        pinned: pendingDecisionId !== undefined,
        ...(cursorVersion === undefined ? {} : { cursorVersion }),
      };
    }
    return {
      entry,
      ...(isCombatSpotlightSource(entry)
        ? { combat: entry.combat }
        : { active: entry.active }),
      activeKey: nextActiveKey,
      activeMode,
      sourceInstanceId: entrySourceInstanceId(entry),
      activeSpanIds: entrySpanIds(entry),
      shownAtMs: nowMs,
      visibleUntilMs: nowMs + minimumDwellMs,
      pinned: pendingDecisionId !== undefined,
      ...(cursorVersion === undefined ? {} : { cursorVersion }),
    };
  }
  if (previous === undefined) {
    return undefined;
  }
  const visibleUntilMs = previous.pinned
    ? Math.max(previous.visibleUntilMs, nowMs + graceMs)
    : previous.visibleUntilMs;
  if (nowMs > visibleUntilMs) {
    return undefined;
  }
  return { ...previous, pinned: false, visibleUntilMs };
};

export const effectSpotlightDisplayForEntry = ({
  entry,
  graceMs,
  minimumDwellMs,
  nowMs,
  pendingDecisionId,
  previous,
  cursorVersion,
  previousCursorVersion,
}: EffectSpotlightDisplayInput): EffectSpotlightState | undefined => {
  if (entry === undefined) {
    return undefined;
  }

  const resolvedPreviousCursorVersion =
    previousCursorVersion ?? previous?.cursorVersion;
  const sameCursorEntry =
    cursorVersion === undefined ||
    resolvedPreviousCursorVersion === undefined ||
    cursorVersion === resolvedPreviousCursorVersion;

  return effectSpotlightModel({
    nowMs,
    previous: sameCursorEntry ? previous : undefined,
    minimumDwellMs,
    graceMs,
    entry,
    cursorVersion,
    pendingDecisionId: liveEntryMatchesPendingDecision(entry, pendingDecisionId)
      ? pendingDecisionId
      : undefined,
  });
};

export const effectSpotlightModelForPlayback = ({
  graceMs,
  minimumDwellMs,
  nowMs,
  pendingDecisionId,
  playback,
  previous,
}: {
  readonly nowMs: number;
  readonly previous: EffectSpotlightState | undefined;
  readonly minimumDwellMs: number;
  readonly graceMs: number;
  readonly playback: EffectSpotlightPlaybackState;
  readonly fallbackMode: "live" | "resolved";
  readonly pendingDecisionId: DecisionId | string | undefined;
}): EffectSpotlightState | undefined =>
  effectSpotlightDisplayForEntry({
    nowMs,
    previous,
    minimumDwellMs,
    graceMs,
    entry: currentSpotlightPlaybackEntry(playback),
    pendingDecisionId,
  });

export const shouldDisplayLiveSpotlightSource = ({
  liveSourceExists,
  model,
  pendingResolvedSourceCount,
  resolvedQueueLength,
}: {
  readonly liveSourceExists: boolean;
  readonly model: EffectSpotlightState | undefined;
  readonly pendingResolvedSourceCount: number;
  readonly resolvedQueueLength: number;
}): boolean =>
  liveSourceExists &&
  pendingResolvedSourceCount === 0 &&
  resolvedQueueLength === 0 &&
  (model === undefined || model.activeMode === "live");
