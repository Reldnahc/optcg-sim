import type { ConnectorParser } from "../types.js";

export const parseSyntheticThenConnector: ConnectorParser = (input) => {
  const parts = input.text.split(/\s+Then,\s+/);
  if (parts.length <= 1) {
    return undefined;
  }

  return {
    segments: parts,
    connectors: parts.map((_, index) => (index === 0 ? "always" : "then")),
    evidence: ["connector:then"],
  };
};
