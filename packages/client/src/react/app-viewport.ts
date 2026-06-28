import { useEffect, useState, type CSSProperties } from "react";

export interface AppViewportMetrics {
  readonly width: number;
  readonly height: number;
}

export interface AppViewportWindow {
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly visualViewport?:
    | {
        readonly width: number;
        readonly height: number;
      }
    | null
    | undefined;
}

export type AppViewportCssVariables = CSSProperties &
  Record<"--app-viewport-width" | "--app-viewport-height", string>;

const finitePositiveNumber = (value: number): number | undefined =>
  Number.isFinite(value) && value > 0 ? value : undefined;

export const appViewportMetricsFromWindow = (
  source: AppViewportWindow,
): AppViewportMetrics => ({
  width:
    finitePositiveNumber(source.visualViewport?.width ?? 0) ??
    finitePositiveNumber(source.innerWidth) ??
    0,
  height:
    finitePositiveNumber(source.visualViewport?.height ?? 0) ??
    finitePositiveNumber(source.innerHeight) ??
    0,
});

export const appViewportCssVariables = (
  metrics: AppViewportMetrics,
): AppViewportCssVariables => ({
  "--app-viewport-width": `${String(metrics.width)}px`,
  "--app-viewport-height": `${String(metrics.height)}px`,
});

export const currentAppViewportMetrics = (): AppViewportMetrics | undefined =>
  typeof window === "undefined"
    ? undefined
    : appViewportMetricsFromWindow(window);

export const subscribeAppViewportChanges = (
  onChange: (metrics: AppViewportMetrics) => void,
): (() => void) => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  let animationFrameId: number | undefined;
  let settleTimeoutId: number | undefined;
  const visualViewport =
    "visualViewport" in window ? window.visualViewport : null;
  const emit = (): void => {
    const metrics = currentAppViewportMetrics();
    if (metrics !== undefined) {
      onChange(metrics);
    }
  };
  const schedule = (): void => {
    if (animationFrameId !== undefined) {
      window.cancelAnimationFrame(animationFrameId);
    }
    if (settleTimeoutId !== undefined) {
      window.clearTimeout(settleTimeoutId);
    }
    animationFrameId = window.requestAnimationFrame(() => {
      animationFrameId = undefined;
      emit();
    });
    settleTimeoutId = window.setTimeout(() => {
      settleTimeoutId = undefined;
      emit();
    }, 150);
  };

  schedule();
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  if (visualViewport !== null) {
    visualViewport.addEventListener("resize", schedule);
    visualViewport.addEventListener("scroll", schedule);
  }

  return () => {
    if (animationFrameId !== undefined) {
      window.cancelAnimationFrame(animationFrameId);
    }
    if (settleTimeoutId !== undefined) {
      window.clearTimeout(settleTimeoutId);
    }
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
    if (visualViewport !== null) {
      visualViewport.removeEventListener("resize", schedule);
      visualViewport.removeEventListener("scroll", schedule);
    }
  };
};

export const useAppViewportCssVariables =
  (): Partial<AppViewportCssVariables> => {
    const [metrics, setMetrics] = useState<AppViewportMetrics | undefined>(() =>
      currentAppViewportMetrics(),
    );

    useEffect(() => subscribeAppViewportChanges(setMetrics), []);

    return metrics === undefined ? {} : appViewportCssVariables(metrics);
  };
