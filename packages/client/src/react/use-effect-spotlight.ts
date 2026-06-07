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
  readonly pendingDecisionId: DecisionId | string | undefined;
  readonly minimumDwellMs?: number | undefined;
  readonly graceMs?: number | undefined;
}

export const useEffectSpotlight = ({
  active,
  activeKey,
  activeMode = "live",
  graceMs = 800,
  minimumDwellMs = 2_000,
  pendingDecisionId,
}: UseEffectSpotlightInput): EffectSpotlightState | undefined => {
  const consumedResolvedKeys = useRef(new Set<string>());
  const resolvedActiveKey = useMemo(
    () =>
      active === undefined
        ? undefined
        : (activeKey ?? activePresentationKey(active)),
    [active, activeKey],
  );
  const effectiveActive =
    active !== undefined &&
    activeMode === "resolved" &&
    resolvedActiveKey !== undefined &&
    consumedResolvedKeys.current.has(resolvedActiveKey)
      ? undefined
      : active;
  const [model, setModel] = useState<EffectSpotlightState>();
  useEffect(() => {
    setModel((previous) =>
      effectSpotlightModel({
        nowMs: Date.now(),
        previous,
        minimumDwellMs,
        graceMs,
        active: effectiveActive,
        activeKey: resolvedActiveKey,
        activeMode,
        pendingDecisionId,
      }),
    );
  }, [
    activeMode,
    effectiveActive,
    graceMs,
    minimumDwellMs,
    pendingDecisionId,
    resolvedActiveKey,
  ]);
  useEffect(() => {
    if (
      model === undefined ||
      model.pinned ||
      (effectiveActive !== undefined && activeMode === "live")
    ) {
      return;
    }
    const delayMs = Math.max(0, model.visibleUntilMs - Date.now());
    const timeout = window.setTimeout(() => {
      if (model.activeMode === "resolved") {
        consumedResolvedKeys.current.add(model.activeKey);
      }
      setModel((previous) =>
        effectSpotlightModel({
          nowMs: Date.now(),
          previous,
          minimumDwellMs,
          graceMs,
          active: undefined,
          pendingDecisionId: undefined,
        }),
      );
    }, delayMs);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeMode, effectiveActive, graceMs, minimumDwellMs, model]);
  return model;
};
