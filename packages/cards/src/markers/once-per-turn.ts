import type { MarkerParser } from "../types.js";

export const parseOncePerTurnMarker: MarkerParser = (input) => {
  const text = "[Once Per Turn]";
  if (input.text !== text && !input.text.startsWith(`${text} `)) {
    return undefined;
  }

  return {
    patch: { oncePerTurn: true },
    evidence: ["marker:oncePerTurn"],
    rest: input.text.slice(text.length).trimStart(),
  };
};
