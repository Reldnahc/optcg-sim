import type { ConnectorParser } from "../types.js";
import { splitSourceByDelimiter } from "../source-slices.js";

export const parseSentenceConnector: ConnectorParser = (input) => {
  const sentenceDelimiter = /\.(?!\s+If you do,)\s+(?=[A-Z])/u;
  const split =
    input.source === undefined
      ? undefined
      : splitSourceByDelimiter(input.source, sentenceDelimiter, "sentence");
  const segments =
    split?.segments.map((segment) => segment.text) ??
    input.text
      .split(sentenceDelimiter)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);

  if (segments.length <= 1) {
    return undefined;
  }

  return {
    segments,
    ...(split === undefined ? {} : { sourceSegments: split.segments }),
    connectors: segments.map((_, index) => (index === 0 ? "always" : "then")),
    ...(split === undefined
      ? {}
      : {
          connectorSpans: split.delimiters.map((delimiter, index) => ({
            id: `span:connector:${delimiter.id}:${String(index)}`,
            role: "connector",
            start: delimiter.start,
            end: delimiter.end,
            text: delimiter.text,
            primitiveEvidence: ["connector:sentence"],
          })),
        }),
    evidence: ["connector:sentence"],
  };
};
