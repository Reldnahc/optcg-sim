import { expect, it } from "vitest";

import { parseCardFilterPredicates } from "./card-filter-predicates.js";

it("parses threshold-before-stat power predicates", () => {
  expect(
    parseCardFilterPredicates(
      { text: "Character with 5000 or more power" },
      { powerSemantics: "current" },
    ),
  ).toEqual({
    filter: {
      categories: ["character"],
      currentPower: { min: 5000 },
    },
    evidence: [
      "filter:category:character",
      "filter:currentPower",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
    ],
    rest: "",
  });
});
