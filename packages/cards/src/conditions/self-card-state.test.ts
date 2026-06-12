import { expect, it } from "vitest";

import { parseSelfCardStateCondition } from "./self-card-state.js";

it("parses this Character rested state as a reusable card-state condition", () => {
  expect(
    parseSelfCardStateCondition({ text: "this Character is rested" }),
  ).toEqual({
    condition: {
      type: "cardState",
      target: { type: "self" },
      state: "rested",
    },
    evidence: ["condition:cardState", "target:thisCharacter", "state:rested"],
    rest: "",
  });
});
