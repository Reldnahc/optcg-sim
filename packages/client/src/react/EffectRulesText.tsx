import type { EffectTextSourceMap, EffectTextSpanId } from "@optcg/types";
import { CardRulesText } from "optcg-card-rules";

import { splitTextByHighlightRanges } from "./effect-text-ranges.js";

export interface EffectRulesTextProps {
  readonly text: string;
  readonly sourceMap?: EffectTextSourceMap | undefined;
  readonly activeSpanIds?: readonly EffectTextSpanId[] | undefined;
  readonly compact?: boolean | undefined;
}

export const EffectRulesText = ({
  activeSpanIds = [],
  compact,
  sourceMap,
  text,
}: EffectRulesTextProps): React.JSX.Element => {
  const active = new Set(activeSpanIds);
  const ranges =
    sourceMap?.sourceText === text
      ? sourceMap.spans
          .filter((span) => active.has(span.id))
          .map((span) => ({
            start: span.start,
            end: span.end,
            state: "active" as const,
          }))
      : [];
  const chunks = splitTextByHighlightRanges(text, ranges);
  return (
    <div className="effect-rules-text">
      {chunks.map((chunk, index) => (
        <span
          className={
            chunk.state === "normal"
              ? "effect-rules-span"
              : `effect-rules-span effect-rules-span--${chunk.state}`
          }
          key={`${String(index)}:${chunk.text}`}
        >
          <CardRulesText
            text={chunk.text}
            {...(compact === undefined ? {} : { compact })}
          />
        </span>
      ))}
    </div>
  );
};
