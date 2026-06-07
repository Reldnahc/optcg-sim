import { useEffect, useMemo, useState } from "react";

import type {
  ActiveEffectTextPresentation,
  DecisionId,
  EffectTextSpanId,
} from "@optcg/types";

export interface EffectSpotlightState {
  readonly active: ActiveEffectTextPresentation;
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
  readonly pendingDecisionId: DecisionId | string | undefined;
}

const spanKey = (spanIds: readonly EffectTextSpanId[]): string =>
  spanIds.join("\n");

const sameActivePresentation = (
  previous: EffectSpotlightState,
  active: ActiveEffectTextPresentation,
): boolean =>
  previous.sourceInstanceId === String(active.source.instanceId) &&
  spanKey(previous.activeSpanIds) === spanKey(active.activeSpanIds);

export const effectSpotlightModel = ({
  active,
  graceMs,
  minimumDwellMs,
  nowMs,
  pendingDecisionId,
  previous,
}: EffectSpotlightModelInput): EffectSpotlightState | undefined => {
  if (active !== undefined) {
    if (previous !== undefined && sameActivePresentation(previous, active)) {
      return {
        ...previous,
        active,
        activeSpanIds: active.activeSpanIds,
        pinned: pendingDecisionId !== undefined,
      };
    }
    return {
      active,
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
  readonly pendingDecisionId: DecisionId | string | undefined;
  readonly minimumDwellMs?: number | undefined;
  readonly graceMs?: number | undefined;
}

export const useEffectSpotlight = ({
  active,
  graceMs = 800,
  minimumDwellMs = 2_000,
  pendingDecisionId,
}: UseEffectSpotlightInput): EffectSpotlightState | undefined => {
  const activeKey = useMemo(
    () =>
      active === undefined
        ? undefined
        : [
            String(active.source.instanceId),
            active.textKind ?? "",
            spanKey(active.activeSpanIds),
          ].join("|"),
    [active],
  );
  const [model, setModel] = useState<EffectSpotlightState>();
  useEffect(() => {
    setModel((previous) =>
      effectSpotlightModel({
        nowMs: Date.now(),
        previous,
        minimumDwellMs,
        graceMs,
        active,
        pendingDecisionId,
      }),
    );
  }, [active, activeKey, graceMs, minimumDwellMs, pendingDecisionId]);
  useEffect(() => {
    if (model === undefined || model.pinned || active !== undefined) {
      return;
    }
    const delayMs = Math.max(0, model.visibleUntilMs - Date.now());
    const timeout = window.setTimeout(() => {
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
  }, [active, graceMs, minimumDwellMs, model]);
  return model;
};
