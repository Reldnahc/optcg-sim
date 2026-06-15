import type {
  ActiveEffectTextPresentation,
  DecisionId,
  EffectTextSpanId,
} from "@optcg/types";

import {
  currentSpotlightPlaybackEntry,
  type EffectSpotlightPlaybackEntry,
  type EffectSpotlightPlaybackState,
} from "./use-effect-spotlight-playback.js";

export interface EffectSpotlightState {
  readonly active: ActiveEffectTextPresentation;
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
  readonly active: ActiveEffectTextPresentation | undefined;
  readonly activeKey?: string | undefined;
  readonly activeMode?: "live" | "resolved" | undefined;
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

const sameActivePresentation = (
  previous: EffectSpotlightState,
  active: ActiveEffectTextPresentation,
  activeKey: string,
): boolean =>
  previous.activeKey === activeKey &&
  previous.sourceInstanceId === String(active.source.instanceId) &&
  spanKey(previous.activeSpanIds) === spanKey(active.activeSpanIds);

export const effectSpotlightModel = ({
  active,
  activeKey,
  activeMode = "live",
  cursorVersion,
  graceMs,
  minimumDwellMs,
  nowMs,
  pendingDecisionId,
  previous,
}: EffectSpotlightModelInput): EffectSpotlightState | undefined => {
  if (active !== undefined) {
    const nextActiveKey =
      activeKey ??
      [
        String(active.source.instanceId),
        active.textKind ?? "",
        spanKey(active.activeSpanIds),
      ].join("|");
    if (
      previous !== undefined &&
      sameActivePresentation(previous, active, nextActiveKey)
    ) {
      return {
        ...previous,
        active,
        activeKey: nextActiveKey,
        activeMode,
        activeSpanIds: active.activeSpanIds,
        pinned: pendingDecisionId !== undefined,
        ...(cursorVersion === undefined ? {} : { cursorVersion }),
      };
    }
    return {
      active,
      activeKey: nextActiveKey,
      activeMode,
      sourceInstanceId: String(active.source.instanceId),
      activeSpanIds: active.activeSpanIds,
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
    active: entry.active,
    activeKey: entry.key,
    activeMode: entry.mode,
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
