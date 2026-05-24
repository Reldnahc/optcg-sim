import type { ConnectorParser } from "../types.js";

export const parseAndConnector: ConnectorParser = (input) => {
  const segments = input.text
    .split(/\s+and\s+/i)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length <= 1) {
    return undefined;
  }

  return {
    segments,
    connectors: segments.map((_, index) => (index === 0 ? "always" : "then")),
    evidence: ["connector:andOrdered"],
  };
};
