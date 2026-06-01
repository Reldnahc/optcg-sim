import { expect, it } from "vitest";

import { parseSelfFieldCountCondition } from "./self-field-count.js";

it("parses self field-count thresholds with reusable card filters", () => {
  expect(
    parseSelfFieldCountCondition({
      text: "you have 2 or less Characters",
    }),
  ).toEqual({
    condition: {
      type: "fieldCount",
      player: "self",
      filter: { categories: ["character"] },
      op: "lte",
      value: 2,
    },
    evidence: [
      "condition:fieldCount",
      "condition:comparator:lte",
      "condition:threshold:positiveInteger",
      "player:self",
      "filter:category:character",
    ],
    rest: "",
  });
});
