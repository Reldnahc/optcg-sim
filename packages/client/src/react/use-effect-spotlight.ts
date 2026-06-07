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

export const queuedResolvedSpotlightSources = ({
  consumedKeys,
  currentKey,
  previousQueue,
  sources,
}: {
  readonly consumedKeys: ReadonlySet<string>;
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
      !queuedKeys.has(source.key)
    ) {
      next ??= [...previousQueue];
      next.push(source);
      queuedKeys.add(source.key);
    }
  }
  return next ?? previousQueue;
};

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

export interface UseEffectSpotlightInput {
  readonly active: ActiveEffectTextPresentation | undefined;
  readonly activeKey?: string | undefined;
  readonly activeMode?: "live" | "resolved" | undefined;
  readonly activeSources?: readonly EffectSpotlightActiveSourceInput[];
  readonly pendingDecisionId: DecisionId | string | undefined;
  readonly minimumDwellMs?: number | undefined;
  readonly graceMs?: number | undefined;
}

export const useEffectSpotlight = ({
  active,
  activeKey,
  activeMode = "live",
  activeSources,
  graceMs = 800,
  minimumDwellMs = 2_000,
  pendingDecisionId,
}: UseEffectSpotlightInput): EffectSpotlightState | undefined => {
  const consumedResolvedKeys = useRef(new Set<string>());
  const [resolvedQueue, setResolvedQueue] = useState<
    EffectSpotlightActiveSourceInput[]
  >([]);
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
  const liveSource = normalizedSources.find((source) => source.mode === "live");
  const effectiveActive = liveSource?.active;
  const effectiveActiveKey = liveSource?.key;
  const effectiveActiveMode = liveSource?.mode ?? activeMode;
  const [model, setModel] = useState<EffectSpotlightState>();
  useEffect(() => {
    const currentKey = model?.activeMode === "resolved" ? model.activeKey : "";
    setResolvedQueue((previous) => {
      const next = queuedResolvedSpotlightSources({
        consumedKeys: consumedResolvedKeys.current,
        currentKey,
        previousQueue: previous,
        sources: normalizedSources,
      });
      return next === previous ? previous : [...next];
    });
  }, [model?.activeKey, model?.activeMode, normalizedSources]);
  useEffect(() => {
    if (liveSource !== undefined) {
      setResolvedQueue([]);
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
        pendingDecisionId,
      }),
    );
  }, [
    effectiveActive,
    effectiveActiveKey,
    effectiveActiveMode,
    graceMs,
    liveSource,
    minimumDwellMs,
    pendingDecisionId,
  ]);
  useEffect(() => {
    if (
      liveSource !== undefined ||
      pendingDecisionId !== undefined ||
      model !== undefined ||
      resolvedQueue.length === 0
    ) {
      return;
    }
    const next = resolvedQueue[0];
    if (next === undefined) {
      return;
    }
    setResolvedQueue((previous) => previous.slice(1));
    setModel(
      effectSpotlightModel({
        nowMs: Date.now(),
        previous: undefined,
        minimumDwellMs,
        graceMs,
        active: next.active,
        activeKey: next.key,
        activeMode: "resolved",
        pendingDecisionId: undefined,
      }),
    );
  }, [
    graceMs,
    liveSource,
    minimumDwellMs,
    model,
    pendingDecisionId,
    resolvedQueue,
  ]);
  useEffect(() => {
    if (
      model === undefined ||
      model.pinned ||
      (effectiveActive !== undefined && effectiveActiveMode === "live")
    ) {
      return;
    }
    const delayMs = Math.max(0, model.visibleUntilMs - Date.now());
    const timeout = window.setTimeout(() => {
      if (model.activeMode === "resolved") {
        consumedResolvedKeys.current.add(model.activeKey);
      }
      setModel((previous) =>
        previous?.activeKey === model.activeKey ? undefined : previous,
      );
    }, delayMs);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [effectiveActive, effectiveActiveMode, model]);
  return model;
};
