import { describe, expect, it } from "vitest";

import { selectedRefreshLockExpressionParser } from "./selected-refresh-lock.js";

describe("selected refresh-lock expression parser", () => {
  it("parses up-to-one-each selected opponent Leader and Character refresh locks as split selections", () => {
    const result = selectedRefreshLockExpressionParser({
      text: "Select up to 1 each of your opponent's rested Leader and Character cards. The selected cards will not become active in your opponent's next Refresh Phase.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "selected:refresh-lock-leader-target",
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zones: ["leaderArea"],
                min: 0,
                max: 1,
                filter: { categories: ["leader"], state: "rested" },
              },
            },
          },
          {
            connector: "then",
            saveResultAs: "selected:refresh-lock-character-target",
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zones: ["characterArea"],
                min: 0,
                max: 1,
                filter: { categories: ["character"], state: "rested" },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "cannotBecomeActive",
              target: {
                binding: {
                  saveResultAs: "selected:refresh-lock-leader-target",
                },
              },
              duration: { type: "untilStartOfNextTurn", player: "opponent" },
            },
          },
          {
            connector: "then",
            effect: {
              type: "cannotBecomeActive",
              target: {
                binding: {
                  saveResultAs: "selected:refresh-lock-character-target",
                },
              },
              duration: { type: "untilStartOfNextTurn", player: "opponent" },
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:selectTargets",
        "composition:selectThenApply",
        "instruction:preventActivation",
        "target:opponentLeader",
        "target:opponentCharacters",
        "filter:state:rested",
        "duration:opponentNextRefreshPhase",
      ]),
    );
  });
});
