import type {
  ActiveEffectTextPresentation,
  CombatSpotlightPresentation,
  EffectTextSpanId,
  PublicPendingDecisionId,
} from "@optcg/types";

import {
  currentSpotlightPlaybackEntry,
  isCombatSpotlightSource,
  isPlayedCardSpotlightSource,
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
  readonly pendingDecisionId: PublicPendingDecisionId | undefined;
}

export interface EffectSpotlightDisplayInput {
  readonly nowMs: number;
  readonly previous: EffectSpotlightState | undefined;
  readonly minimumDwellMs: number;
  readonly graceMs: number;
  readonly entry: EffectSpotlightPlaybackEntry | undefined;
  readonly cursorVersion?: number | undefined;
  readonly previousCursorVersion?: number | undefined;
  readonly pendingDecisionId: PublicPendingDecisionId | undefined;
}

export const effectSpotlightTimerAnimationKey = (
  state: Pick<EffectSpotlightState, "activeKey" | "entry" | "shownAtMs">,
): string => `${state.activeKey}:${String(state.shownAtMs)}`;

const liveEntryMatchesPendingDecision = (
  entry: EffectSpotlightPlaybackEntry,
  pendingDecisionId: PublicPendingDecisionId | undefined,
): boolean =>
  pendingDecisionId !== undefined &&
  entry.mode === "live" &&
  !isCombatSpotlightSource(entry) &&
  !isPlayedCardSpotlightSource(entry) &&
  entry.pendingDecisionId !== undefined &&
  String(entry.pendingDecisionId) === String(pendingDecisionId);

const entrySourceInstanceId = (entry: EffectSpotlightPlaybackEntry): string =>
  isCombatSpotlightSource(entry)
    ? entry.combat.eventKind === "counterUsed"
      ? String(entry.combat.source.instanceId)
      : String(entry.combat.attacker.instanceId)
    : isPlayedCardSpotlightSource(entry)
      ? String(entry.source.instanceId)
      : String(entry.active.source.instanceId);

const entrySpanIds = (
  entry: EffectSpotlightPlaybackEntry,
): readonly EffectTextSpanId[] =>
  isCombatSpotlightSource(entry) || isPlayedCardSpotlightSource(entry)
    ? []
    : entry.active.activeSpanIds;

const sameSpotlightEntry = (
  previous: EffectSpotlightState,
  entry: EffectSpotlightPlaybackEntry,
  activeKey: string,
): boolean =>
  previous.activeKey === activeKey && previous.entry.id === entry.id;

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
          : isPlayedCardSpotlightSource(entry)
            ? {}
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
        : isPlayedCardSpotlightSource(entry)
          ? {}
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
  readonly pendingDecisionId: PublicPendingDecisionId | undefined;
}): EffectSpotlightState | undefined =>
  effectSpotlightDisplayForEntry({
    nowMs,
    previous,
    minimumDwellMs,
    graceMs,
    entry: currentSpotlightPlaybackEntry(playback),
    pendingDecisionId,
  });
