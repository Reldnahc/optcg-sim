import type { MarkerParser } from "../types.js";
import { consumeSourcePrefix, sourceSpan } from "../source-slices.js";

export const parseOncePerTurnMarker: MarkerParser = (input) => {
  const text = "[Once Per Turn]";
  if (input.text !== text && !input.text.startsWith(`${text} `)) {
    return undefined;
  }
  const consumed = input.source
    ? consumeSourcePrefix(input.source, text)
    : undefined;

  return {
    patch: { oncePerTurn: true },
    evidence: ["marker:oncePerTurn"],
    rest: input.text.slice(text.length).trimStart(),
    ...(consumed === undefined
      ? {}
      : {
          presentationSpans: [
            sourceSpan("span:marker:oncePerTurn", "marker", consumed.consumed, [
              "marker:oncePerTurn",
            ]),
          ],
        }),
  };
};
