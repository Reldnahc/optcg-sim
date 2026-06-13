import type { MarkerParser } from "../types.js";
import { consumeSourcePrefix, sourceSpan } from "../source-slices.js";

export const parseOncePerTurnMarker: MarkerParser = (input) => {
  const text = "[Once Per Turn]";
  const prose = /^Once per turn,?\s+/iu.exec(input.text);
  if (input.text !== text && !input.text.startsWith(`${text} `)) {
    if (prose === null) {
      return undefined;
    }
    return {
      patch: { oncePerTurn: true },
      evidence: ["marker:oncePerTurn"],
      rest: input.text.slice(prose[0].length).trimStart(),
    };
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
