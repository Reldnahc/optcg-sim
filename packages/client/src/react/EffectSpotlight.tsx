import type {
  ActiveEffectTextPresentation,
  EffectTextSourceMap,
} from "@optcg/types";

import type { ClientCardModel } from "../view-model.js";
import { EffectRulesText } from "./EffectRulesText.js";

export interface EffectSpotlightProps {
  readonly card: ClientCardModel | undefined;
  readonly active: ActiveEffectTextPresentation | undefined;
}

interface SpotlightText {
  readonly text: string;
  readonly sourceMap: EffectTextSourceMap | undefined;
}

const parentheticalReminderPattern = /\s*\([^)]*\)/gu;

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

export const EffectSpotlight = ({
  active,
  card,
}: EffectSpotlightProps): React.JSX.Element | null => {
  if (card === undefined || active === undefined) {
    return null;
  }
  const textKind = active.textKind ?? "effect";
  const text = textKind === "trigger" ? card.triggerText : card.effectText;
  const sourceMap =
    textKind === "trigger"
      ? card.triggerTextSourceMap
      : card.effectTextSourceMap;
  const spotlightText =
    text === undefined
      ? undefined
      : spotlightTextWithoutReminders(text, sourceMap);
  const triggerSpotlightText =
    textKind === "trigger" || card.triggerText === undefined
      ? undefined
      : spotlightTextWithoutReminders(
          card.triggerText,
          card.triggerTextSourceMap,
        );
  return (
    <aside className="effect-spotlight" aria-label={`Resolving ${card.name}`}>
      <div className="effect-spotlight-card">
        {card.imageUrl === undefined ? (
          <div className="effect-spotlight-card__placeholder">{card.name}</div>
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
              <EffectRulesText
                text={triggerSpotlightText.text}
                sourceMap={triggerSpotlightText.sourceMap}
                compact
                preserveNewlines
              />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
