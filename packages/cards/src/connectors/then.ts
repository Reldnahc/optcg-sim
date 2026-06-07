import type { ConnectorParser } from "../types.js";
import { splitSourceByDelimiter } from "../source-slices.js";

export const parseThenConnector: ConnectorParser = (input) => {
  const split =
    input.source === undefined
      ? undefined
      : splitSourceByDelimiter(input.source, /\s+Then,\s+/u, "then");
  const segments =
    split?.segments.map((segment) => segment.text) ??
    input.text
      .split(/\s+Then,\s+/)
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
            primitiveEvidence: ["connector:then"],
          })),
        }),
    evidence: ["connector:then"],
  };
};
