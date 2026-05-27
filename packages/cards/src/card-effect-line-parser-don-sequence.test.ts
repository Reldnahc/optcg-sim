import { expect, it } from "vitest";

import {
  parseCardEffectLine,
  parseCardEffectLineDetailed,
} from "./card-effect-line-parser.js";

it("parses DON deck-size rules text as legality metadata without a runtime block", () => {
  const result = parseCardEffectLineDetailed(
    "Under the rules of this game, your DON!! deck consists of 6 cards.",
  );

  expect(result).toEqual({
    ok: true,
    value: {
      kind: "metadata",
      metadata: {
        type: "deckRestriction",
        restriction: {
          type: "donDeckSize",
          count: 6,
        },
      },
      evidence: [
        "deckRestriction:ignored",
        "deckRestriction:donDeckSize",
        "filter:category:don",
        "zone:donDeck",
        "count:positiveInteger",
      ],
    },
  });
});

it("parses activate-main turn-count DON ramp and rested-DON attach compositionally", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] If it is your second turn or later, add up to 1 DON!! card from your DON!! deck and set it as active, and add up to 4 additional DON!! cards and rest them. Then, give up to 4 rested DON!! cards to 1 of your Characters.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      sourcePresencePolicy: "mustRemainInSameZone",
      condition: {
        type: "turnCount",
        player: "self",
        op: "gte",
        value: 2,
      },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "moveCards",
                    min: 0,
                    count: 1,
                    from: {
                      player: "self",
                      zone: "donDeck",
                      position: "top",
                    },
                    to: { player: "self", zone: "costArea" },
                    order: "original",
                    destinationState: "active",
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "moveCards",
                    min: 0,
                    count: 4,
                    from: {
                      player: "self",
                      zone: "donDeck",
                      position: "top",
                    },
                    to: { player: "self", zone: "costArea" },
                    order: "original",
                    destinationState: "rested",
                  },
                },
              ],
            },
          },
          {
            connector: "then",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  saveResultAs: "donSelection:attach",
                  effect: {
                    type: "selectCards",
                    zone: "costArea",
                    player: "self",
                    chooser: "self",
                    min: 0,
                    max: 4,
                    filter: { categories: ["don"], state: "rested" },
                    saveAs: "donSelection:attach",
                    visibility: "bothPlayers",
                  },
                },
                {
                  connector: "ifYouDo",
                  saveResultAs: "targetSelection:attach-don",
                  effect: {
                    type: "selectTargets",
                    request: {
                      timing: "onResolution",
                      chooser: "self",
                      zone: "characterArea",
                      player: "self",
                      filter: { categories: ["character"] },
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
                      zone: "characterArea",
                      player: "self",
                      filter: { categories: ["character"] },
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
      "condition:turnCount",
      "condition:comparator:gte",
      "condition:threshold:positiveInteger",
      "instruction:moveCards",
      "zone:donDeck",
      "destination:costArea",
      "state:active",
      "state:rested",
      "instruction:selectCards",
      "instruction:attachDon",
      "filter:category:don",
      "filter:category:character",
      "filter:state:rested",
      "composition:selectThenApply",
    ]),
  );
});
