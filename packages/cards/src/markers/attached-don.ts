import type { MarkerParser } from "../types.js";

export const parseAttachedDonMarker: MarkerParser = (input) => {
  const match = /^\[DON!!\s*x(?<count>[1-9]\d*)\]\s*(?<rest>.*)$/iu.exec(
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
  return {
    patch: {
      condition: {
        type: "attachedDonCount",
        target: { type: "self" },
        op: "gte",
        value: Number.parseInt(countText, 10),
      },
    },
    evidence: [
      "marker:attachedDon",
      "condition:attachedDonCount",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "target:thisCard",
    ],
    rest: rest?.trimStart() ?? "",
  };
};
