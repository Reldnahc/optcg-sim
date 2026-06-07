import type { ConnectorParser } from "../types.js";
import { splitSourceByDelimiter } from "../source-slices.js";

const andPattern =
  /\s*,?\s+and\s+(?!different card names\b|(?:Leader|Character|Event|Stage)s? effects\b|set it as active\b|rest them\b|\+\d+\s+(?:cost|power)\b|place them at the top(?: or bottom)?\b)/iu;

export const parseAndConnector: ConnectorParser = (input) => {
  const split =
    input.source === undefined
      ? undefined
      : splitSourceByDelimiter(input.source, andPattern, "and");
  const segments =
    split?.segments.map((segment) => segment.text.replace(/,$/u, "")) ??
    input.text
      .split(andPattern)
      .map((segment) => segment.trim().replace(/,$/u, ""))
      .filter((segment) => segment.length > 0);

  if (segments.length <= 1) {
    return undefined;
  }

  return {
    segments,
    ...(split === undefined ? {} : { sourceSegments: split.segments }),
    connectors: segments.map((_, index) => (index === 0 ? "always" : "then")),
    presentationMode: "joined",
    ...(split === undefined
      ? {}
      : {
          connectorSpans: split.delimiters.map((delimiter, index) => ({
            id: `span:connector:${delimiter.id}:${String(index)}`,
            role: "connector",
            start: delimiter.start,
            end: delimiter.end,
            text: delimiter.text,
            primitiveEvidence: ["connector:andOrdered"],
          })),
        }),
    evidence: ["connector:andOrdered"],
  };
};
