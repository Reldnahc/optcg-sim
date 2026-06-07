import type { EffectTextSourceMap, EffectTextSpanId } from "@optcg/types";
import { CardRulesText } from "optcg-card-rules";
import { Fragment } from "react";

import { splitTextByHighlightRanges } from "./effect-text-ranges.js";

export interface EffectRulesTextProps {
  readonly text: string;
  readonly sourceMap?: EffectTextSourceMap | undefined;
  readonly activeSpanIds?: readonly EffectTextSpanId[] | undefined;
  readonly compact?: boolean | undefined;
  readonly preserveNewlines?: boolean | undefined;
}

const renderedRulesText = (
  text: string,
  compact: boolean | undefined,
  preserveNewlines: boolean | undefined,
): React.JSX.Element => {
  if (preserveNewlines !== true || !text.includes("\n")) {
    return (
      <CardRulesText
        text={text}
        {...(compact === undefined ? {} : { compact })}
      />
    );
  }
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={`${String(index)}:${line}`}>
          <CardRulesText
            text={line}
            {...(compact === undefined ? {} : { compact })}
          />
          {index === lines.length - 1 ? null : <br />}
        </Fragment>
      ))}
    </>
  );
};

export const EffectRulesText = ({
  activeSpanIds = [],
  compact,
  preserveNewlines,
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
          {renderedRulesText(chunk.text, compact, preserveNewlines)}
        </span>
      ))}
    </div>
  );
};
