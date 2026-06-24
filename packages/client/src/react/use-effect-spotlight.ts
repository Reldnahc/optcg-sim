import { useEffect, useMemo, useRef, useState } from "react";

import type { PublicPendingDecisionId } from "@optcg/types";

import {
  advanceSpotlightPlayback,
  appendSpotlightPlaybackSources,
  currentSpotlightPlaybackEntry,
  type EffectSpotlightActiveSourceInput,
  type EffectSpotlightPlaybackState,
} from "./use-effect-spotlight-playback.js";
import {
  effectSpotlightDisplayForEntry,
  type EffectSpotlightState,
} from "./use-effect-spotlight-display.js";

export type {
  EffectSpotlightActiveSourceInput,
  EffectSpotlightPlaybackCommand,
  EffectSpotlightPlaybackEntry,
  EffectSpotlightPlaybackState,
  EffectSpotlightSourceMode,
} from "./use-effect-spotlight-playback.js";
export {
  advanceSpotlightPlayback,
  appendSpotlightPlaybackSources,
  currentSpotlightPlaybackEntry,
  isCombatSpotlightSource,
} from "./use-effect-spotlight-playback.js";
export type {
  EffectSpotlightDisplayInput,
  EffectSpotlightModelInput,
  EffectSpotlightState,
} from "./use-effect-spotlight-display.js";
export {
  effectSpotlightDisplayForEntry,
  effectSpotlightModel,
  effectSpotlightModelForPlayback,
  effectSpotlightTimerAnimationKey,
} from "./use-effect-spotlight-display.js";

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
  readonly entry?: undefined;
  readonly controls: EffectSpotlightControls;
}

export type UseEffectSpotlightState =
  | UseEffectSpotlightActiveState
  | UseEffectSpotlightControlsState;

export const shouldAutoAdvanceSpotlightPlayback = ({
  currentSource,
  model,
  paused,
}: {
  readonly currentSource: EffectSpotlightActiveSourceInput | undefined;
  readonly model:
    | Readonly<
        Pick<EffectSpotlightState, "activeKey" | "activeMode" | "pinned"> &
          Partial<
            Omit<EffectSpotlightState, "activeKey" | "activeMode" | "pinned">
          >
      >
    | undefined;
  readonly paused: boolean;
}): boolean =>
  model !== undefined &&
  currentSource !== undefined &&
  !model.pinned &&
  !paused &&
  model.activeKey === currentSource.key &&
  model.activeMode === currentSource.mode;

export const resumeSpotlightModelAfterPause = ({
  model,
  pausedAtMs,
  resumedAtMs,
}: {
  readonly model: EffectSpotlightState | undefined;
  readonly pausedAtMs: number | undefined;
  readonly resumedAtMs: number;
}): EffectSpotlightState | undefined => {
  if (model === undefined || pausedAtMs === undefined) {
    return model;
  }
  const timerPausedAtMs = Math.max(pausedAtMs, model.shownAtMs);
  const pausedDurationMs = Math.max(0, resumedAtMs - timerPausedAtMs);
  if (pausedDurationMs === 0) {
    return model;
  }
  return {
    ...model,
    shownAtMs: model.shownAtMs + pausedDurationMs,
    visibleUntilMs: model.visibleUntilMs + pausedDurationMs,
  };
};

export const effectSpotlightStateForModel = ({
  controls,
  controlsVisible,
  model,
}: {
  readonly controls: EffectSpotlightControls;
  readonly controlsVisible: boolean;
  readonly model: EffectSpotlightState | undefined;
}): UseEffectSpotlightState | undefined => {
  if (model === undefined) {
    return controlsVisible ? { controls } : undefined;
  }
  return {
    ...model,
    controls,
  };
};

export interface UseEffectSpotlightInput {
  readonly activeSources?: readonly EffectSpotlightActiveSourceInput[];
  readonly initialCursorKey?: string | undefined;
  readonly pendingDecisionId: PublicPendingDecisionId | undefined;
  readonly minimumDwellMs?: number | undefined;
  readonly graceMs?: number | undefined;
}

export const useEffectSpotlight = ({
  activeSources,
  graceMs = 800,
  initialCursorKey,
  minimumDwellMs = 2_000,
  pendingDecisionId,
}: UseEffectSpotlightInput): UseEffectSpotlightState | undefined => {
  const initializedPlaybackSources = useRef(false);
  const playbackPausedAtMs = useRef<number | undefined>(undefined);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [playback, setPlayback] = useState<EffectSpotlightPlaybackState>({
    entries: [],
    cursorIndex: undefined,
    paused: false,
    fastForwarded: false,
  });
  const normalizedSources = useMemo(
    (): readonly EffectSpotlightActiveSourceInput[] => activeSources ?? [],
    [activeSources],
  );
  const [model, setModel] = useState<EffectSpotlightState>();
  const cursorIndex = playback.cursorIndex;
  const currentSource = currentSpotlightPlaybackEntry(playback);
  const previousCursorEntryKey = useRef<string | undefined>(undefined);
  const cursorVersion = useRef(0);
  const cursorEntryKey =
    currentSource === undefined || cursorIndex === undefined
      ? undefined
      : String(cursorIndex);
  if (previousCursorEntryKey.current !== cursorEntryKey) {
    previousCursorEntryKey.current = cursorEntryKey;
    cursorVersion.current += 1;
  }
  const currentCursorVersion = cursorVersion.current;

  useEffect(() => {
    if (normalizedSources.length > 0) {
      setControlsVisible(true);
    }
    const isInitialPlaybackBatch =
      !initializedPlaybackSources.current && normalizedSources.length > 0;
    setPlayback((previous) =>
      appendSpotlightPlaybackSources({
        initialCursorKey: isInitialPlaybackBatch ? initialCursorKey : undefined,
        previous,
        sources: normalizedSources,
      }),
    );
    if (isInitialPlaybackBatch) {
      initializedPlaybackSources.current = true;
    }
  }, [activeSources, initialCursorKey, normalizedSources]);

  useEffect(() => {
    setModel((previous) =>
      effectSpotlightDisplayForEntry({
        nowMs: Date.now(),
        previous,
        minimumDwellMs,
        graceMs,
        entry: currentSource,
        cursorVersion: currentCursorVersion,
        pendingDecisionId,
      }),
    );
  }, [
    currentCursorVersion,
    currentSource,
    graceMs,
    minimumDwellMs,
    pendingDecisionId,
  ]);

  useEffect(() => {
    if (
      model === undefined ||
      currentSource === undefined ||
      !shouldAutoAdvanceSpotlightPlayback({
        currentSource,
        model,
        paused: playback.paused,
      })
    ) {
      return;
    }
    const delayMs = Math.max(0, model.visibleUntilMs - Date.now());
    const timeout = window.setTimeout(() => {
      setPlayback((previous) =>
        advanceSpotlightPlayback({
          command: "autoAdvance",
          state: previous,
        }),
      );
    }, delayMs);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [currentSource, model, playback.paused]);

  const presentIndex = playback.entries.length - 1;
  const controls = {
    paused: playback.paused,
    canRewind:
      cursorIndex === undefined ? playback.entries.length > 0 : cursorIndex > 0,
    canStepForward:
      cursorIndex !== undefined &&
      presentIndex >= 0 &&
      cursorIndex < presentIndex,
    rewind: () => {
      playbackPausedAtMs.current = Date.now();
      setPlayback((previous) =>
        advanceSpotlightPlayback({ command: "rewind", state: previous }),
      );
    },
    togglePaused: () => {
      const nowMs = Date.now();
      if (playback.paused) {
        const pausedAtMs = playbackPausedAtMs.current;
        playbackPausedAtMs.current = undefined;
        setModel((current) =>
          resumeSpotlightModelAfterPause({
            model: current,
            pausedAtMs,
            resumedAtMs: nowMs,
          }),
        );
      } else {
        playbackPausedAtMs.current = nowMs;
      }
      setPlayback((previous) =>
        advanceSpotlightPlayback({
          command: previous.paused ? "play" : "pause",
          state: previous,
        }),
      );
    },
    stepForward: () => {
      if (playback.paused) {
        playbackPausedAtMs.current = Date.now();
      }
      setPlayback((previous) =>
        advanceSpotlightPlayback({
          command: "stepForward",
          state: previous,
        }),
      );
    },
    catchUp: () => {
      playbackPausedAtMs.current = undefined;
      setPlayback((previous) =>
        advanceSpotlightPlayback({
          command: "catchUp",
          pendingDecisionId,
          state: previous,
        }),
      );
    },
  };

  return effectSpotlightStateForModel({
    controls,
    controlsVisible,
    model,
  });
};
