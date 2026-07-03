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
import { battlePowerTone } from "./BattleArrowOverlay.js";

export type EffectSpotlightPresentation =
  | {
      readonly kind: "effectText";
      readonly active: ActiveEffectTextPresentation;
      readonly card: ClientCardModel;
    }
  | {
      readonly kind: "cardLink";
      readonly active?: ActiveEffectTextPresentation | undefined;
      readonly sourceCard: ClientCardModel;
      readonly relatedCards: readonly ClientCardModel[];
      readonly relationLabel: string;
      readonly tone: "combat" | "targeting";
      readonly sourcePower?: number | undefined;
      readonly relatedPowers?: readonly (number | undefined)[] | undefined;
    };

export interface EffectSpotlightTimer {
  readonly shownAtMs: number;
  readonly visibleUntilMs: number;
  readonly paused: boolean;
  readonly pinned: boolean;
  readonly animationKey: string;
}

export interface EffectSpotlightProps {
  readonly presentation: EffectSpotlightPresentation | undefined;
  readonly timer?: EffectSpotlightTimer | undefined;
  readonly controls?: EffectSpotlightControls | undefined;
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

    if (paused) {
      return;
    }

    const intervalId = window.setInterval(() => {
      update(intervalId);
    }, 50);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [animationKey, paused, shownAtMs, visibleUntilMs]);

  return nowMs;
};

const SpotlightCardTimer = ({
  timer,
  timerNowMs,
}: {
  readonly timer: EffectSpotlightTimer | undefined;
  readonly timerNowMs: number;
}): React.JSX.Element | null =>
  timer === undefined ? null : (
    <div
      key={timer.animationKey}
      className={`effect-spotlight-card__timer${
        timer.paused ? " is-paused" : ""
      }`}
      data-effect-spotlight-timer={timer.animationKey}
      aria-hidden="true"
      style={spotlightTimerStyle(timer, timerNowMs)}
    >
      <div className="effect-spotlight-card__timer-fill" />
    </div>
  );

const SpotlightCardFace = ({
  card,
  className,
}: {
  readonly card: ClientCardModel;
  readonly className: string;
}): React.JSX.Element => (
  <div className={className}>
    {card.imageUrl === undefined ? (
      <div className="effect-spotlight-card__placeholder">{card.name}</div>
    ) : (
      <img
        className="effect-spotlight-card__art"
        src={card.imageUrl}
        alt={card.name}
      />
    )}
  </div>
);

const LinkedCardPowerValue = ({
  power,
  showIncrease,
}: {
  readonly power: number | undefined;
  readonly showIncrease?: boolean | undefined;
}): React.JSX.Element | null =>
  power === undefined ? null : (
    <span
      className={`effect-spotlight-link-power__value battle-arrow-power-value is-${battlePowerTone(power)}`}
    >
      {showIncrease && power > 0 ? `+${String(power)}` : power}
    </span>
  );

const linkedCardLabel = (
  card: ClientCardModel,
  power: number | undefined,
  showIncrease: boolean = false,
): string =>
  power === undefined
    ? card.name
    : `${card.name} ${
        showIncrease && power > 0 ? `+${String(power)}` : String(power)
      }`;

const relatedCardsLabel = (
  relatedCards: readonly ClientCardModel[],
  relatedPowers: readonly (number | undefined)[] | undefined,
  overflowCount: number,
): string => {
  const visibleNames = relatedCards.map((card, index) =>
    linkedCardLabel(card, relatedPowers?.[index]),
  );
  const overflowLabel =
    overflowCount <= 0 ? undefined : `${String(overflowCount)} more`;
  const labels =
    overflowLabel === undefined
      ? visibleNames
      : [...visibleNames, overflowLabel];
  if (labels.length === 0) {
    return "no visible related cards";
  }
  if (labels.length === 1) {
    return labels[0] ?? "no visible related cards";
  }
  if (labels.length === 2) {
    return `${labels[0] ?? ""} and ${labels[1] ?? ""}`;
  }
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1) ?? ""}`;
};

const cardLinkSpotlightAriaLabel = ({
  relatedCards,
  relatedPowers,
  relationLabel,
  sourceCard,
  sourcePower,
}: {
  readonly relatedCards: readonly ClientCardModel[];
  readonly relatedPowers: readonly (number | undefined)[] | undefined;
  readonly relationLabel: string;
  readonly sourceCard: ClientCardModel;
  readonly sourcePower: number | undefined;
}): string =>
  `Linked card spotlight: ${linkedCardLabel(
    sourceCard,
    sourcePower,
    relationLabel === "counters",
  )} ${relationLabel} ${relatedCardsLabel(
    relatedCards.slice(0, maxVisibleRelatedCards),
    relatedPowers,
    Math.max(0, relatedCards.length - maxVisibleRelatedCards),
  )}`;

const SpotlightRulesPanel = ({
  active,
  card,
  className,
  spotlightText,
  triggerSpotlightText,
}: {
  readonly active: ActiveEffectTextPresentation;
  readonly card: ClientCardModel;
  readonly className: string;
  readonly spotlightText: SpotlightText | undefined;
  readonly triggerSpotlightText?: SpotlightText | undefined;
}): React.JSX.Element => (
  <div className={className}>
    <div className="effect-spotlight-card__main-rules">
      {spotlightText === undefined ? (
        <div className="effect-spotlight-card__fallback">{card.name}</div>
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
);

const maxVisibleRelatedCards = 5;

const relatedSlotClassName = (index: number): string =>
  `effect-spotlight-link-card effect-spotlight-link-card--related is-related-slot-${String(
    index,
  )}`;

const LinkedCardsSpotlightCard = ({
  active,
  relatedCards,
  relatedPowers,
  relationLabel,
  sourceCard,
  sourcePower,
  spotlightText,
  timer,
  timerNowMs,
  tone,
}: {
  readonly active: ActiveEffectTextPresentation | undefined;
  readonly relatedCards: readonly ClientCardModel[];
  readonly relatedPowers: readonly (number | undefined)[] | undefined;
  readonly relationLabel: string;
  readonly sourceCard: ClientCardModel;
  readonly sourcePower: number | undefined;
  readonly spotlightText: SpotlightText | undefined;
  readonly timer: EffectSpotlightTimer | undefined;
  readonly timerNowMs: number;
  readonly tone: "combat" | "targeting";
}): React.JSX.Element => {
  const visibleRelatedCards = relatedCards.slice(0, maxVisibleRelatedCards);
  const visibleRelatedPowers = relatedPowers?.slice(0, maxVisibleRelatedCards);
  const overflowCount = Math.max(
    0,
    relatedCards.length - maxVisibleRelatedCards,
  );
  const singleRelatedPower =
    visibleRelatedCards.length === 1 ? visibleRelatedPowers?.[0] : undefined;
  const showSourcePowerIncrease = relationLabel === "counters";
  return (
    <div
      className="effect-spotlight-card effect-spotlight-card--linked"
      data-card-link-tone={tone}
    >
      <div className="effect-spotlight-link-frame">
        <div
          className="effect-spotlight-link"
          data-card-link-tone={tone}
          data-related-count={relatedCards.length}
          aria-hidden="true"
        >
          <SpotlightCardFace
            card={sourceCard}
            className="effect-spotlight-link-card effect-spotlight-link-card--source"
          />
          <div className="effect-spotlight-link-relation">
            <LinkedCardPowerValue
              power={sourcePower}
              showIncrease={showSourcePowerIncrease}
            />
            <span className="effect-spotlight-link-direction">
              <span className="effect-spotlight-link-direction__label">
                {relationLabel}
              </span>
              <svg
                className="effect-spotlight-link-direction__arrow"
                viewBox="0 0 84 28"
                focusable="false"
                aria-hidden="true"
              >
                <path d="M4 14h64" />
                <path d="M56 5l20 9-20 9" />
              </svg>
            </span>
            <LinkedCardPowerValue power={singleRelatedPower} />
          </div>
          <div
            className="effect-spotlight-link-related-cards"
            data-related-count={relatedCards.length}
            data-visible-related-count={visibleRelatedCards.length}
          >
            {visibleRelatedCards.map((relatedCard, index) => (
              <SpotlightCardFace
                key={`${String(relatedCard.instanceId)}:${String(index)}`}
                card={relatedCard}
                className={relatedSlotClassName(index)}
              />
            ))}
            {overflowCount === 0 ? null : (
              <div className="effect-spotlight-link-overflow">
                +{String(overflowCount)}
              </div>
            )}
          </div>
        </div>
        {active === undefined ? null : (
          <SpotlightRulesPanel
            active={active}
            card={sourceCard}
            className="effect-spotlight-link-rules"
            spotlightText={spotlightText}
          />
        )}
      </div>
      <SpotlightCardTimer timer={timer} timerNowMs={timerNowMs} />
    </div>
  );
};

export const EffectSpotlight = ({
  controls,
  presentation,
  timer,
}: EffectSpotlightProps): React.JSX.Element | null => {
  const timerNowMs = useSpotlightTimerNowMs(timer);
  const active =
    presentation?.kind === "effectText"
      ? presentation.active
      : presentation?.kind === "cardLink"
        ? presentation.active
        : undefined;
  const card =
    presentation?.kind === "effectText"
      ? presentation.card
      : presentation?.kind === "cardLink"
        ? presentation.sourceCard
        : undefined;
  if (controls === undefined && presentation === undefined) {
    return null;
  }
  const spotlightClassName = [
    "effect-spotlight",
    presentation?.kind === "cardLink" ? "effect-spotlight--linked" : "",
  ]
    .filter(Boolean)
    .join(" ");
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
  const ariaLabel =
    presentation === undefined
      ? "Spotlight playback"
      : presentation.kind === "cardLink"
        ? cardLinkSpotlightAriaLabel({
            relatedCards: presentation.relatedCards,
            relatedPowers: presentation.relatedPowers,
            relationLabel: presentation.relationLabel,
            sourceCard: presentation.sourceCard,
            sourcePower: presentation.sourcePower,
          })
        : `Resolving ${presentation.card.name}`;
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
      className={spotlightClassName}
      aria-label={ariaLabel}
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      {presentation?.kind === "cardLink" ? (
        <LinkedCardsSpotlightCard
          active={presentation.active}
          relatedCards={presentation.relatedCards}
          relatedPowers={presentation.relatedPowers}
          relationLabel={presentation.relationLabel}
          sourceCard={presentation.sourceCard}
          sourcePower={presentation.sourcePower}
          spotlightText={spotlightText}
          timer={timer}
          timerNowMs={timerNowMs}
          tone={presentation.tone}
        />
      ) : card === undefined || active === undefined ? null : (
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
          <SpotlightRulesPanel
            active={active}
            card={card}
            className="effect-spotlight-card__rules"
            spotlightText={spotlightText}
            triggerSpotlightText={triggerSpotlightText}
          />
          <SpotlightCardTimer timer={timer} timerNowMs={timerNowMs} />
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
