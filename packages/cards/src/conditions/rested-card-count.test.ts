import { expect, it } from "vitest";

import { parseRestedCardCountCondition } from "./rested-card-count.js";

it("parses rested card thresholds as a reusable self field-count primitive", () => {
  expect(
    parseRestedCardCountCondition({
      text: "you have 8 or more rested cards",
    }),
  ).toEqual({
    condition: {
      type: "fieldCount",
      player: "self",
      filter: { state: "rested" },
      op: "gte",
      value: 8,
    },
    evidence: [
      "condition:fieldCount",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "player:self",
      "filter:state:rested",
    ],
    rest: "",
  });
});
