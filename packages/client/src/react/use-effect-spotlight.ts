import { useEffect, useMemo, useRef, useState } from "react";

import type {
  ActiveEffectTextPresentation,
  DecisionId,
  EffectTextSpanId,
} from "@optcg/types";

export interface EffectSpotlightState {
  readonly active: ActiveEffectTextPresentation;
  readonly activeKey: string;
  readonly activeMode: "live" | "resolved";
  readonly sourceInstanceId: string;
  readonly activeSpanIds: readonly EffectTextSpanId[];
  readonly shownAtMs: number;
  readonly visibleUntilMs: number;
  readonly pinned: boolean;
}

export interface EffectSpotlightPlaybackState {
  readonly entries: readonly EffectSpotlightActiveSourceInput[];
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

export interface EffectSpotlightControls {
  readonly paused: boolean;
  readonly canRewind: boolean;
  readonly canStepForward: boolean;
  readonly rewind: () => void;
  readonly togglePaused: () => void;
  readonly stepForward: () => void;
  readonly catchUp: () => void;
}

export interface UseEffectSpotlightActiveState extends EffectSpotlightState {
  readonly controls: EffectSpotlightControls;
}

export interface UseEffectSpotlightControlsState {
  readonly active?: undefined;
  readonly controls: EffectSpotlightControls;
}

export type UseEffectSpotlightState =
  | UseEffectSpotlightActiveState
  | UseEffectSpotlightControlsState;

export interface EffectSpotlightModelInput {
  readonly nowMs: number;
  readonly previous: EffectSpotlightState | undefined;
  readonly minimumDwellMs: number;
  readonly graceMs: number;
  readonly active: ActiveEffectTextPresentation | undefined;
  readonly activeKey?: string | undefined;
  readonly activeMode?: "live" | "resolved" | undefined;
  readonly pendingDecisionId: DecisionId | string | undefined;
}

export interface EffectSpotlightActiveSourceInput {
  readonly active: ActiveEffectTextPresentation;
  readonly key: string;
  readonly mode: "live" | "resolved";
}

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

const activePresentationKey = (active: ActiveEffectTextPresentation): string =>
  [
    String(active.source.instanceId),
    active.textKind ?? "",
    spanKey(active.activeSpanIds),
  ].join("|");

const spotlightSourceSignatures = (
  source: EffectSpotlightActiveSourceInput,
): readonly string[] => {
  const spanIds =
    source.active.activeSpanIds.length === 0
      ? [""]
      : source.active.activeSpanIds;
  return spanIds.map((spanId) =>
    [
      String(source.active.source.playerId),
      String(source.active.source.instanceId),
      String(source.active.source.cardId),
      source.active.textKind ?? "",
      spanId,
    ].join("|"),
  );
};

const sourceSignaturesConsumed = (
  consumedSignatures: ReadonlySet<string>,
  source: EffectSpotlightActiveSourceInput,
): boolean =>
  spotlightSourceSignatures(source).every((signature) =>
    consumedSignatures.has(signature),
  );

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

const releaseSpotlightSourceSignatures = (
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
  let entries: EffectSpotlightActiveSourceInput[] | undefined;
  for (const source of sources) {
    if (consumedKeys.has(source.key) || queuedKeys.has(source.key)) {
      continue;
    }
    if (
      source.mode === "resolved" &&
      suppressedResolvedSignatures !== undefined &&
      sourceSignaturesConsumed(suppressedResolvedSignatures, source)
    ) {
      releaseSpotlightSourceSignatures(suppressedResolvedSignatures, source);
      continue;
    }
    entries ??= [...previous.entries];
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
          : previous.entries.length
        : previous.cursorIndex,
    paused: previous.paused,
  };
};

export const advanceSpotlightPlayback = ({
  command,
  state,
}: {
  readonly command: EffectSpotlightPlaybackCommand;
  readonly state: EffectSpotlightPlaybackState;
}): EffectSpotlightPlaybackState => {
  if (command === "catchUp") {
    return { entries: [], cursorIndex: undefined, paused: false };
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
  const cursorIndex = state.cursorIndex ?? presentIndex;
  if (command === "rewind") {
    return {
      ...state,
      cursorIndex: Math.max(0, cursorIndex - 1),
      paused: true,
    };
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
  return state;
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

export const effectSpotlightModel = ({
  active,
  activeKey,
  activeMode = "live",
  graceMs,
  minimumDwellMs,
  nowMs,
  pendingDecisionId,
  previous,
}: EffectSpotlightModelInput): EffectSpotlightState | undefined => {
  if (active !== undefined) {
    const nextActiveKey = activeKey ?? activePresentationKey(active);
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

export const effectSpotlightModelForPlayback = ({
  fallbackMode,
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
}): EffectSpotlightState | undefined => {
  const currentSource =
    playback.cursorIndex === undefined
      ? undefined
      : playback.entries[playback.cursorIndex];
  return effectSpotlightModel({
    nowMs,
    previous,
    minimumDwellMs,
    graceMs,
    active: currentSource?.active,
    activeKey: currentSource?.key,
    activeMode: currentSource?.mode ?? fallbackMode,
    pendingDecisionId:
      currentSource?.mode === "live" ? pendingDecisionId : undefined,
  });
};

export interface UseEffectSpotlightInput {
  readonly active: ActiveEffectTextPresentation | undefined;
  readonly activeKey?: string | undefined;
  readonly activeMode?: "live" | "resolved" | undefined;
  readonly activeSources?: readonly EffectSpotlightActiveSourceInput[];
  readonly consumeInitialResolvedSources?: boolean | undefined;
  readonly initialCursorKey?: string | undefined;
  readonly pendingDecisionId: DecisionId | string | undefined;
  readonly minimumDwellMs?: number | undefined;
  readonly graceMs?: number | undefined;
}

export const useEffectSpotlight = ({
  active,
  activeKey,
  activeMode = "live",
  activeSources,
  consumeInitialResolvedSources = true,
  graceMs = 800,
  initialCursorKey,
  minimumDwellMs = 2_000,
  pendingDecisionId,
}: UseEffectSpotlightInput): UseEffectSpotlightState | undefined => {
  const consumedResolvedKeys = useRef(new Set<string>());
  const suppressedResolvedSignatures = useRef(new Set<string>());
  const initializedConsumedResolvedKeys = useRef(false);
  const initializedPlaybackSources = useRef(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [playback, setPlayback] = useState<EffectSpotlightPlaybackState>({
    entries: [],
    cursorIndex: undefined,
    paused: false,
  });
  const normalizedSources = useMemo(
    (): readonly EffectSpotlightActiveSourceInput[] =>
      activeSources ??
      (active === undefined
        ? []
        : [
            {
              active,
              key: activeKey ?? activePresentationKey(active),
              mode: activeMode,
            },
          ]),
    [active, activeKey, activeMode, activeSources],
  );
  const [model, setModel] = useState<EffectSpotlightState>();
  const cursorIndex = playback.cursorIndex;
  const currentSource =
    cursorIndex === undefined ? undefined : playback.entries[cursorIndex];
  useEffect(() => {
    if (normalizedSources.length > 0) {
      setControlsVisible(true);
    }
    if (
      consumeInitialResolvedSources &&
      !initializedConsumedResolvedKeys.current &&
      activeSources !== undefined
    ) {
      initializedConsumedResolvedKeys.current = true;
      consumeResolvedSpotlightSourceKeys(
        consumedResolvedKeys.current,
        normalizedSources,
      );
    }
    const isInitialPlaybackBatch =
      !initializedPlaybackSources.current && normalizedSources.length > 0;
    setPlayback((previous) =>
      appendSpotlightPlaybackSources({
        consumedKeys: consumedResolvedKeys.current,
        initialCursorKey: isInitialPlaybackBatch ? initialCursorKey : undefined,
        suppressedResolvedSignatures: suppressedResolvedSignatures.current,
        previous,
        sources: normalizedSources,
      }),
    );
    if (isInitialPlaybackBatch) {
      initializedPlaybackSources.current = true;
    }
  }, [
    activeSources,
    consumeInitialResolvedSources,
    initialCursorKey,
    normalizedSources,
  ]);
  const effectiveActive = currentSource?.active;
  const effectiveActiveKey = currentSource?.key;
  const effectiveActiveMode = currentSource?.mode ?? activeMode;
  useEffect(() => {
    if (
      effectiveActive !== undefined &&
      effectiveActiveKey !== undefined &&
      effectiveActiveMode === "live"
    ) {
      consumeSpotlightSourceSignatures(suppressedResolvedSignatures.current, [
        { active: effectiveActive, key: effectiveActiveKey, mode: "live" },
      ]);
    }
    setModel((previous) =>
      effectSpotlightModel({
        nowMs: Date.now(),
        previous,
        minimumDwellMs,
        graceMs,
        active: effectiveActive,
        activeKey: effectiveActiveKey,
        activeMode: effectiveActiveMode,
        pendingDecisionId:
          effectiveActiveMode === "live" ? pendingDecisionId : undefined,
      }),
    );
  }, [
    effectiveActive,
    effectiveActiveKey,
    effectiveActiveMode,
    graceMs,
    minimumDwellMs,
    pendingDecisionId,
  ]);
  useEffect(() => {
    const canAutoStep =
      cursorIndex !== undefined && cursorIndex < playback.entries.length - 1;
    if (
      model === undefined ||
      model.pinned ||
      playback.paused ||
      currentSource === undefined ||
      (!canAutoStep && currentSource.mode === "live")
    ) {
      return;
    }
    const delayMs = Math.max(0, model.visibleUntilMs - Date.now());
    const timeout = window.setTimeout(() => {
      if (currentSource.mode === "resolved") {
        consumedResolvedKeys.current.add(model.activeKey);
      }
      setPlayback((previous) =>
        advanceSpotlightPlayback({
          command: "autoAdvance",
          state: previous,
        }),
      );
      if (canAutoStep) {
        setModel((previous) =>
          previous?.activeKey === model.activeKey ? undefined : previous,
        );
      }
    }, delayMs);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [
    currentSource,
    cursorIndex,
    model,
    playback.entries.length,
    playback.paused,
  ]);
  const displayModel = effectSpotlightModelForPlayback({
    nowMs: Date.now(),
    previous: model,
    minimumDwellMs,
    graceMs,
    playback,
    fallbackMode: activeMode,
    pendingDecisionId,
  });
  const presentIndex = playback.entries.length - 1;
  const controls = {
    paused: playback.paused,
    canRewind: cursorIndex !== undefined && cursorIndex > 0,
    canStepForward:
      cursorIndex !== undefined &&
      presentIndex >= 0 &&
      cursorIndex < presentIndex,
    rewind: () => {
      setPlayback((previous) =>
        advanceSpotlightPlayback({ command: "rewind", state: previous }),
      );
    },
    togglePaused: () => {
      setPlayback((previous) =>
        advanceSpotlightPlayback({
          command: previous.paused ? "play" : "pause",
          state: previous,
        }),
      );
    },
    stepForward: () => {
      setPlayback((previous) =>
        advanceSpotlightPlayback({
          command: "stepForward",
          state: previous,
        }),
      );
    },
    catchUp: () => {
      setPlayback((previous) => {
        consumeResolvedSpotlightSourceKeys(
          consumedResolvedKeys.current,
          previous.entries,
        );
        return advanceSpotlightPlayback({
          command: "catchUp",
          state: previous,
        });
      });
      setModel(undefined);
    },
  };
  if (displayModel === undefined) {
    return controlsVisible ? { controls } : undefined;
  }
  return {
    ...displayModel,
    controls,
  };
};
