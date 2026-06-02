import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect line parser targeted trash composition", () => {
  it("parses On Play selected opponent Character trash through wrapper/body composition", () => {
    expect(
      parseCardEffectLine(
        "[On Play] Trash up to 1 of your opponent's Characters with 6000 power or less.",
      ),
    ).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        sourcePresencePolicy: "mustRemainInSameZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              saveResultAs: "selected:trash-target",
              effect: {
                type: "selectTargets",
                request: {
                  timing: "onResolution",
                  chooser: "self",
                  player: "opponent",
                  zone: "characterArea",
                  min: 0,
                  max: 1,
                  allowFewerIfUnavailable: true,
                  visibility: "public",
                  filter: {
                    categories: ["character"],
                    currentPower: { max: 6000 },
                  },
                },
              },
            },
            {
              connector: "then",
              effect: {
                type: "trash",
                target: {
                  type: "savedFieldObject",
                  binding: {
                    family: "selectedTargets",
                    saveResultAs: "selected:trash-target",
                  },
                  zone: "characterArea",
                  player: "opponent",
                  visibility: "publicOnly",
                  onFailure: "failClosed",
                },
              },
            },
          ],
        },
      },
      evidence: [
        "entry:onPlay",
        "sourcePresence:mustRemain",
        "instruction:trash",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "filter:category:character",
        "filter:currentPower",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "composition:selectThenApply",
        "composition:entryExpression",
      ],
    });
  });
});
