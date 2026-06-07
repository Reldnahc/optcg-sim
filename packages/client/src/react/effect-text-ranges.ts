export interface HighlightRange {
  readonly start: number;
  readonly end: number;
  readonly state: "active" | "resolved" | "skipped";
}

export interface TextChunk {
  readonly text: string;
  readonly state: "normal" | HighlightRange["state"];
}

export const splitTextByHighlightRanges = (
  text: string,
  ranges: readonly HighlightRange[],
): TextChunk[] => {
  const sorted = [...ranges]
    .filter(
      (range) =>
        range.start >= 0 && range.end > range.start && range.end <= text.length,
    )
    .sort((a, b) => a.start - b.start);
  const chunks: TextChunk[] = [];
  let cursor = 0;
  for (const range of sorted) {
    if (range.start < cursor) {
      continue;
    }
    if (range.start > cursor) {
      chunks.push({ text: text.slice(cursor, range.start), state: "normal" });
    }
    chunks.push({
      text: text.slice(range.start, range.end),
      state: range.state,
    });
    cursor = range.end;
  }
  if (cursor < text.length) {
    chunks.push({ text: text.slice(cursor), state: "normal" });
  }
  return chunks;
};
