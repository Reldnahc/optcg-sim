import { useEffect, useMemo, useRef, useState } from "react";

import type { ActiveEffectTextPresentation, DecisionId } from "@optcg/types";

import {
  activePresentationKey,
  advanceSpotlightPlayback,
  appendSpotlightPlaybackSources,
  consumeResolvedSpotlightSourceKeys,
  consumeSpotlightSourceSignatures,
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
  activePresentationKey,
  advanceSpotlightPlayback,
  appendSpotlightPlaybackSources,
  consumeResolvedSpotlightSourceKeys,
  consumeSpotlightSourceSignatures,
  currentSpotlightPlaybackEntry,
  queuedResolvedSpotlightSources,
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
  shouldDisplayLiveSpotlightSource,
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
  readonly controls: EffectSpotlightControls;
}

export type UseEffectSpotlightState =
  | UseEffectSpotlightActiveState
  | UseEffectSpotlightControlsState;

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
    fastForwarded: false,
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
  const currentSource = currentSpotlightPlaybackEntry(playback);

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

  useEffect(() => {
    if (currentSource?.mode === "live") {
      consumeSpotlightSourceSignatures(suppressedResolvedSignatures.current, [
        currentSource,
      ]);
    }
    setModel((previous) =>
      effectSpotlightDisplayForEntry({
        nowMs: Date.now(),
        previous,
        minimumDwellMs,
        graceMs,
        entry: currentSource,
        pendingDecisionId,
      }),
    );
  }, [currentSource, graceMs, minimumDwellMs, pendingDecisionId]);

  useEffect(() => {
    if (
      model === undefined ||
      model.pinned ||
      playback.paused ||
      currentSource === undefined
    ) {
      return;
    }
    const delayMs = Math.max(0, model.visibleUntilMs - Date.now());
    const timeout = window.setTimeout(() => {
      if (currentSource.mode === "resolved") {
        consumeResolvedSpotlightSourceKeys(consumedResolvedKeys.current, [
          currentSource,
        ]);
      }
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
      setPlayback((previous) =>
        advanceSpotlightPlayback({
          command: "catchUp",
          state: previous,
        }),
      );
    },
  };

  if (model === undefined) {
    return controlsVisible ? { controls } : undefined;
  }
  return {
    ...model,
    controls,
  };
};
