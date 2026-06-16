import type {
  ActiveEffectTextPresentation,
  EffectTextSourceMap,
} from "@optcg/types";
import {
  useEffect,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";

import type { ClientCardModel } from "../view-model.js";
import { TriggerBlock } from "optcg-card-rules";
import type { EffectSpotlightControls } from "./use-effect-spotlight.js";

import {
  EffectRulesText,
  renderMainSiteSearchLink,
} from "./EffectRulesText.js";

export interface EffectSpotlightProps {
  readonly card: ClientCardModel | undefined;
  readonly active: ActiveEffectTextPresentation | undefined;
  readonly timer?: EffectSpotlightTimer | undefined;
  readonly controls?: EffectSpotlightControls | undefined;
}

export interface EffectSpotlightTimer {
  readonly shownAtMs: number;
  readonly visibleUntilMs: number;
  readonly paused: boolean;
  readonly pinned: boolean;
  readonly animationKey: string;
}

interface SpotlightText {
  readonly text: string;
  readonly sourceMap: EffectTextSourceMap | undefined;
}

type SpotlightControlIconName =
  | "catchUp"
  | "next"
  | "pause"
  | "play"
  | "previous";

interface SpotlightControlButtonInput {
  readonly label: string;
  readonly icon: SpotlightControlIconName;
  readonly disabled?: boolean | undefined;
  readonly onClick: () => void;
}

const parentheticalReminderPattern = /\s*\([^)]*\)/gu;
type SpotlightTimerStyle = CSSProperties &
  Record<"--effect-spotlight-timer-progress", string>;

const SpotlightControlIcon = ({
  icon,
}: {
  readonly icon: SpotlightControlIconName;
}): React.JSX.Element => {
  const paths = (() => {
    switch (icon) {
      case "catchUp":
        return ["M4 5v14l7-7z", "M11 5v14l7-7z", "M19 5h2v14h-2z"];
      case "next":
        return ["M6 5v14l9-7z", "M16 5h2v14h-2z"];
      case "pause":
        return ["M7 5h4v14H7z", "M13 5h4v14h-4z"];
      case "play":
        return ["M8 5v14l10-7z"];
      case "previous":
        return ["M6 5h2v14H6z", "M18 5v14l-9-7z"];
    }
  })();

  return (
    <svg
      className="effect-spotlight-control__icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
};

const spotlightTextWithoutReminders = (
  text: string,
  sourceMap: EffectTextSourceMap | undefined,
): SpotlightText => {
  const removedRanges = [...text.matchAll(parentheticalReminderPattern)].map(
    (match) => ({
      start: match.index,
      end: match.index + match[0].length,
    }),
  );
  if (removedRanges.length === 0) {
    return { text, sourceMap };
  }

  const kept = Array.from({ length: text.length }, () => true);
  for (const range of removedRanges) {
    for (let index = range.start; index < range.end; index += 1) {
      kept[index] = false;
    }
  }

  const prefixKeptCounts: number[] = [0];
  let displayText = "";
  for (let index = 0; index < text.length; index += 1) {
    if (kept[index] === true) {
      displayText += text[index] ?? "";
    }
    prefixKeptCounts.push(displayText.length);
  }

  if (sourceMap?.sourceText !== text) {
    return { text: displayText, sourceMap: undefined };
  }

  return {
    text: displayText,
    sourceMap: {
      ...sourceMap,
      sourceText: displayText,
      spans: sourceMap.spans.flatMap((span) => {
        const start = prefixKeptCounts[span.start] ?? displayText.length;
        const end = prefixKeptCounts[span.end] ?? displayText.length;
        if (end <= start) {
          return [];
        }
        return [
          {
            ...span,
            start,
            end,
            text: displayText.slice(start, end),
          },
        ];
      }),
    },
  };
};

const spotlightTimerStyle = (
  timer: EffectSpotlightTimer,
  nowMs: number,
): SpotlightTimerStyle => ({
  "--effect-spotlight-timer-progress": String(
    Number(spotlightTimerProgress(timer, nowMs).toFixed(3)),
  ),
});

const spotlightTimerProgress = (
  timer: EffectSpotlightTimer,
  nowMs: number,
): number => {
  const durationMs = Math.max(1, timer.visibleUntilMs - timer.shownAtMs);
  const remainingMs = timer.visibleUntilMs - nowMs;
  return Math.max(0, Math.min(1, remainingMs / durationMs));
};

const useSpotlightTimerNowMs = (
  timer: EffectSpotlightTimer | undefined,
): number => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const animationKey = timer?.animationKey;
  const paused = timer?.paused ?? false;
  const pinned = timer?.pinned ?? false;
  const shownAtMs = timer?.shownAtMs;
  const visibleUntilMs = timer?.visibleUntilMs;

  useEffect(() => {
    if (animationKey === undefined) {
      return;
    }

    const update = (intervalId?: number): void => {
      const nextNowMs = Date.now();
      setNowMs(nextNowMs);
      if (
        visibleUntilMs !== undefined &&
        intervalId !== undefined &&
        nextNowMs >= visibleUntilMs
      ) {
        window.clearInterval(intervalId);
      }
    };
    update();

    if (paused || pinned) {
      return;
    }

    const intervalId = window.setInterval(() => {
      update(intervalId);
    }, 50);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [animationKey, paused, pinned, shownAtMs, visibleUntilMs]);

  return nowMs;
};

export const EffectSpotlight = ({
  active,
  card,
  controls,
  timer,
}: EffectSpotlightProps): React.JSX.Element | null => {
  const timerNowMs = useSpotlightTimerNowMs(timer);
  if (controls === undefined && (card === undefined || active === undefined)) {
    return null;
  }
  const textKind = active?.textKind ?? "effect";
  const text =
    card === undefined
      ? undefined
      : textKind === "trigger"
        ? card.triggerText
        : card.effectText;
  const sourceMap =
    card === undefined
      ? undefined
      : textKind === "trigger"
        ? card.triggerTextSourceMap
        : card.effectTextSourceMap;
  const spotlightText =
    text === undefined
      ? undefined
      : spotlightTextWithoutReminders(text, sourceMap);
  const triggerSpotlightText =
    card === undefined || textKind === "trigger"
      ? undefined
      : card.triggerText === undefined
        ? undefined
        : spotlightTextWithoutReminders(
            card.triggerText,
            card.triggerTextSourceMap,
          );
  const controlClick =
    (handler: () => void) =>
    (event: MouseEvent<HTMLButtonElement>): void => {
      event.stopPropagation();
      handler();
    };
  const controlButton = ({
    disabled = false,
    icon,
    label,
    onClick,
  }: SpotlightControlButtonInput): React.JSX.Element => (
    <button
      type="button"
      className="effect-spotlight-control"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={controlClick(onClick)}
    >
      <SpotlightControlIcon icon={icon} />
    </button>
  );
  return (
    <aside
      className="effect-spotlight"
      aria-label={
        card === undefined ? "Spotlight playback" : `Resolving ${card.name}`
      }
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      {card === undefined || active === undefined ? null : (
        <div className="effect-spotlight-card">
          {card.imageUrl === undefined ? (
            <div className="effect-spotlight-card__placeholder">
              {card.name}
            </div>
          ) : (
            <img
              className="effect-spotlight-card__art"
              src={card.imageUrl}
              alt={card.name}
            />
          )}
          <div className="effect-spotlight-card__rules">
            <div className="effect-spotlight-card__main-rules">
              {spotlightText === undefined ? (
                <div className="effect-spotlight-card__fallback">
                  {card.name}
                </div>
              ) : (
                <EffectRulesText
                  text={spotlightText.text}
                  sourceMap={spotlightText.sourceMap}
                  activeSpanIds={active.activeSpanIds}
                  compact
                  preserveNewlines
                />
              )}
            </div>
            {triggerSpotlightText === undefined ? null : (
              <div className="effect-spotlight-card__trigger-rules">
                <TriggerBlock
                  text={triggerSpotlightText.text}
                  compact
                  renderSearchLink={renderMainSiteSearchLink}
                />
              </div>
            )}
          </div>
          {timer === undefined ? null : (
            <div
              key={timer.animationKey}
              className={`effect-spotlight-card__timer${
                timer.paused || timer.pinned ? " is-paused" : ""
              }`}
              data-effect-spotlight-timer={timer.animationKey}
              aria-hidden="true"
              style={spotlightTimerStyle(timer, timerNowMs)}
            >
              <div className="effect-spotlight-card__timer-fill" />
            </div>
          )}
        </div>
      )}
      {controls === undefined ? null : (
        <div
          className="effect-spotlight-controls"
          aria-label="Spotlight controls"
        >
          {controlButton({
            label: "Previous spotlight",
            icon: "previous",
            disabled: !controls.canRewind,
            onClick: controls.rewind,
          })}
          {controlButton({
            label: controls.paused ? "Play spotlight" : "Pause spotlight",
            icon: controls.paused ? "play" : "pause",
            onClick: controls.togglePaused,
          })}
          {controlButton({
            label: "Next spotlight",
            icon: "next",
            disabled: !controls.canStepForward,
            onClick: controls.stepForward,
          })}
          {controlButton({
            label: "Catch up spotlight",
            icon: "catchUp",
            onClick: controls.catchUp,
          })}
        </div>
      )}
    </aside>
  );
};
