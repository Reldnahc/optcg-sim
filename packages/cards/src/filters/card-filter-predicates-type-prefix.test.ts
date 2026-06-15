import { expect, it } from "vitest";

import { parseCardFilterPredicates } from "./card-filter-predicates.js";

it("parses type predicates with an article after another predicate", () => {
  expect(
    parseCardFilterPredicates(
      { text: "7000 power or more and the {Kid Pirates} type" },
      { powerSemantics: "current" },
    ),
  ).toEqual({
    filter: {
      currentPower: { min: 7000 },
      typesAny: ["Kid Pirates"],
    },
    evidence: [
      "filter:currentPower",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "filter:type",
    ],
    rest: "",
  });
});
