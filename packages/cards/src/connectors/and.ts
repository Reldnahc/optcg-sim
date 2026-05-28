import type { ConnectorParser } from "../types.js";

export const parseAndConnector: ConnectorParser = (input) => {
  const segments = input.text
    .split(
      /\s*,?\s+and\s+(?!different card names\b|set it as active\b|rest them\b|\+\d+\s+cost\b|place them at the top or bottom\b)/i,
    )
    .map((segment) => segment.trim().replace(/,$/u, ""))
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
