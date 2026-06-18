import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses rest-self Stage cost into typed own field power gain", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may rest this Stage: Up to 1 {Straw Hat Crew} type Leader or Character card on your field gains +1000 power during this turn.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
              cost: { type: "restSelf", optional: true },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "modifyPower",
              target: {
                type: "chooseFromZones",
                request: {
                  player: "self",
                  zones: ["leaderArea", "characterArea"],
                  filter: {
                    categories: ["leader", "character"],
                    typesAny: ["Straw Hat Crew"],
                  },
                },
              },
              value: 1000,
              duration: { type: "thisTurn" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:activateMain",
      "composition:optionalCostedEffect",
      "cost:restSelf",
      "target:thisCard",
      "instruction:modifyPower",
      "target:yourLeaderOrCharacters",
      "filter:type",
      "filter:category:leader",
      "filter:category:character",
      "modifier:positivePower",
      "duration:thisTurn",
    ]),
  );
});
