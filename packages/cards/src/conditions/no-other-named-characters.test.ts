import { expect, it } from "vitest";

import { parseNoOtherNamedCharactersCondition } from "./no-other-named-characters.js";

it("parses no-other named Characters as a reusable self field-count primitive", () => {
  expect(
    parseNoOtherNamedCharactersCondition({
      text: "you have no other [Cavendish] Characters",
    }),
  ).toEqual({
    condition: {
      type: "fieldCount",
      player: "self",
      filter: {
        categories: ["character"],
        names: ["Cavendish"],
        excludeSelf: true,
      },
      op: "eq",
      value: 0,
    },
    evidence: [
      "condition:fieldCount",
      "player:self",
      "zone:characterArea",
      "filter:category:character",
      "filter:name",
      "filter:excludeSelf",
      "condition:comparator:eq",
      "condition:threshold:nonNegativeInteger",
    ],
    rest: "",
  });
});
