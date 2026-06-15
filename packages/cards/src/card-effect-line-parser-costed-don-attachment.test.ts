import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses activate-main hand-to-deck-top cost into rested-DON leader-or-character attachment", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] You may place 1 card from your hand at the top of your deck: Give up to 2 rested DON!! cards to your Leader or 1 of your Characters.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
              cost: {
                type: "moveCards",
                count: 1,
                chooser: "self",
                from: { player: "self", zone: "hand" },
                to: { player: "self", zone: "deck", position: "top" },
                order: "chooserChoice",
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  saveResultAs: "donSelection:attach",
                  saveResultKinds: ["selectedCards:don"],
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
                  connector: "ifYouDo",
                  saveResultAs: "targetSelection:attach-don",
                  saveResultKinds: ["selectedTargets"],
                  effect: {
                    type: "selectTargets",
                    request: {
                      timing: "onResolution",
                      chooser: "self",
                      zones: ["leaderArea", "characterArea"],
                      player: "self",
                      filter: { categories: ["leader", "character"] },
                      min: 1,
                      max: 1,
                      allowFewerIfUnavailable: false,
                      visibility: "public",
                    },
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "attachSelectedDon",
                    selection: "donSelection:attach",
                    target: {
                      type: "savedFieldObject",
                      binding: {
                        family: "selectedTargets",
                        saveResultAs: "targetSelection:attach-don",
                      },
                      zones: ["leaderArea", "characterArea"],
                      player: "self",
                      filter: { categories: ["leader", "character"] },
                      visibility: "publicOnly",
                      onFailure: "failClosed",
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
      "entry:activateMain",
      "marker:oncePerTurn",
      "composition:optionalCostedEffect",
      "cost:moveCards",
      "zone:hand",
      "destination:deck",
      "position:top",
      "instruction:selectCards",
      "instruction:attachDon",
      "zone:leaderArea",
      "zone:characterArea",
      "filter:category:leader",
      "filter:category:character",
      "filter:state:rested",
      "composition:selectThenApply",
    ]),
  );
});

it("parses activate-main trash-to-deck-bottom cost into rested-DON attachment", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] You may place 1 card from your trash at the bottom of your deck: Give up to 1 rested DON!! card to your Leader or 1 of your Characters.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      sourcePresencePolicy: "mustRemainInSameZone",
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "paidCost",
            effect: {
              type: "payCost",
              cost: {
                type: "moveCards",
                count: 1,
                chooser: "self",
                from: { player: "self", zone: "trash" },
                to: { player: "self", zone: "deck", position: "bottom" },
                order: "chooserChoice",
                optional: true,
              },
            },
          },
          {
            connector: "ifYouDo",
            effect: {
              type: "sequence",
              effects: [
                {
                  saveResultKinds: ["selectedCards:don"],
                  effect: {
                    type: "selectCards",
                    zone: "costArea",
                    player: "self",
                    max: 1,
                    filter: { categories: ["don"], state: "rested" },
                  },
                },
                {
                  saveResultKinds: ["selectedTargets"],
                  effect: {
                    type: "selectTargets",
                    request: {
                      zones: ["leaderArea", "characterArea"],
                      player: "self",
                      filter: { categories: ["leader", "character"] },
                    },
                  },
                },
                {
                  effect: { type: "attachSelectedDon" },
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
      "entry:activateMain",
      "marker:oncePerTurn",
      "composition:optionalCostedEffect",
      "cost:moveCards",
      "zone:trash",
      "destination:deck",
      "position:bottom",
      "instruction:selectCards",
      "instruction:attachDon",
      "filter:category:don",
      "filter:category:leader",
      "filter:category:character",
      "composition:selectThenApply",
    ]),
  );
});
