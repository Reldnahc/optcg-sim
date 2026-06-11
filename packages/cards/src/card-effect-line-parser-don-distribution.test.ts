import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses target-first rested DON distribution as a saved-target loop", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may rest this Character: Give up to 2 of your Characters with 6000 base power up to 2 rested DON!! cards each.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      sourcePresencePolicy: "mustRemainInSameZone",
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
              type: "sequence",
              effects: [
                {
                  id: "select:distributed-don-attach-targets",
                  connector: "always",
                  saveResultAs: "targetSelection:distributed-attach-don",
                  effect: {
                    type: "selectTargets",
                    request: {
                      timing: "onResolution",
                      chooser: "self",
                      player: "self",
                      zone: "characterArea",
                      filter: {
                        categories: ["character"],
                        power: { op: "eq", value: 6000 },
                      },
                      min: 0,
                      max: 2,
                      allowFewerIfUnavailable: true,
                      visibility: "public",
                    },
                  },
                },
                {
                  id: "for-each:distributed-don-attach-target",
                  connector: "then",
                  effect: {
                    type: "forEachSavedTarget",
                    selection: "targetSelection:distributed-attach-don",
                    saveCurrentAs:
                      "targetSelection:distributed-attach-don-current",
                    effect: {
                      type: "sequence",
                      effects: [
                        {
                          id: "select:rested-don",
                          connector: "always",
                          saveResultAs: "donSelection:attach",
                          effect: {
                            type: "selectCards",
                            zone: "costArea",
                            player: "self",
                            chooser: "self",
                            min: 0,
                            max: 2,
                            filter: { categories: ["don"], state: "rested" },
                            saveAs: "donSelection:attach",
                            visibility: "bothPlayers",
                          },
                        },
                        {
                          id: "attach:selected-don-to-current-target",
                          connector: "then",
                          effect: {
                            type: "attachSelectedDon",
                            selection: "donSelection:attach",
                            target: {
                              type: "savedFieldObject",
                              binding: {
                                family: "forEachSavedTarget",
                                saveResultAs:
                                  "targetSelection:distributed-attach-don-current",
                              },
                              zone: "characterArea",
                              player: "self",
                              filter: {
                                categories: ["character"],
                                power: { op: "eq", value: 6000 },
                              },
                              visibility: "publicOnly",
                              onFailure: "failClosed",
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "composition:optionalCostedEffect",
      "composition:forEachSavedTarget",
      "instruction:selectTargets",
      "instruction:selectCards",
      "instruction:attachDon",
      "filter:category:character",
      "filter:power",
      "filter:category:don",
      "filter:state:rested",
    ]),
  );
});

it("parses distributed rested DON attachment with different target filters and quantities", () => {
  const result = parseCardEffectLine(
    "[On Play] Give up to 3 of your {Straw Hat Crew} type Characters up to 1 rested DON!! card each.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectTargets",
              request: {
                max: 3,
                filter: {
                  categories: ["character"],
                  typesAny: ["Straw Hat Crew"],
                },
              },
            },
          },
          {
            effect: {
              type: "forEachSavedTarget",
              effect: {
                type: "sequence",
                effects: [
                  {
                    effect: {
                      type: "selectCards",
                      max: 1,
                      filter: { categories: ["don"], state: "rested" },
                    },
                  },
                  { effect: { type: "attachSelectedDon" } },
                ],
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "composition:forEachSavedTarget",
      "filter:type",
      "filter:category:character",
    ]),
  );
});
