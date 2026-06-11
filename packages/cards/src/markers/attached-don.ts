import type { MarkerParser } from "../types.js";
import { sourceSpan, trimSource } from "../source-slices.js";

export const parseAttachedDonMarker: MarkerParser = (input) => {
  const match = /^\[DON!!\s*x(?<count>[1-9]\d*)\]\s*(?<rest>[\s\S]*)$/iu.exec(
    input.text,
  );
  if (match === null) {
    return undefined;
  }
  const countText = match.groups?.["count"];
  if (countText === undefined) {
    return undefined;
  }

  const rest = match.groups?.["rest"];
  const markerSource =
    input.source === undefined
      ? undefined
      : trimSource({
          text: input.text.slice(0, match[0].length - (rest?.length ?? 0)),
          rawText: input.text.slice(0, match[0].length - (rest?.length ?? 0)),
          start: input.source.start,
          end: input.source.start + match[0].length - (rest?.length ?? 0),
        });
  const evidence = [
    "marker:attachedDon",
    "condition:attachedDonCount",
    "condition:comparator:gte",
    "condition:threshold:positiveInteger",
    "target:thisCard",
  ] as const;
  return {
    patch: {
      condition: {
        type: "attachedDonCount",
        target: { type: "self" },
        op: "gte",
        value: Number.parseInt(countText, 10),
      },
    },
    evidence,
    rest: rest?.trimStart() ?? "",
    ...(markerSource === undefined
      ? {}
      : {
          presentationSpans: [
            sourceSpan(
              "span:marker:attachedDon",
              "marker",
              markerSource,
              evidence,
            ),
          ],
        }),
  };
};
