import { describe, expect, it } from "vitest";

import { conditionParsers } from "../card-effect-line-parser/parser-groups.js";
import { parseConditionFromSet } from "./groups.js";

describe("turn-window condition parser", () => {
  it.each([
    [
      "your opponent's turn",
      { type: "opponentTurn" },
      "condition:opponentTurn",
    ],
    [
      "it's your opponent's turn",
      { type: "opponentTurn" },
      "condition:opponentTurn",
    ],
    [
      "it is your opponent's turn",
      { type: "opponentTurn" },
      "condition:opponentTurn",
    ],
    ["your turn", { type: "yourTurn" }, "condition:yourTurn"],
    ["it's your turn", { type: "yourTurn" }, "condition:yourTurn"],
    ["it is your turn", { type: "yourTurn" }, "condition:yourTurn"],
  ] as const)(
    "parses %s as a reusable condition primitive",
    (text, condition, evidence) => {
      expect(parseConditionFromSet({ text }, conditionParsers)).toEqual({
        condition,
        evidence: [evidence],
        rest: "",
      });
    },
  );
});
