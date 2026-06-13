import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("card effect Counter power parser", () => {
  it("parses Counter conditional power over own Leader or Character card targets", () => {
    const result = parseCardEffectLine(
      "[Counter] If your Leader is [Imu], up to 1 of your Leader or Character cards gains +4000 power during this battle.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "counter" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        condition: {
          type: "hasCardInZone",
          zone: "leaderArea",
          player: "self",
          filter: { categories: ["leader"], names: ["Imu"] },
        },
        effect: {
          type: "modifyPower",
          target: {
            type: "chooseFromZones",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              zones: ["leaderArea", "characterArea"],
              min: 0,
              max: 1,
              allowFewerIfUnavailable: true,
              visibility: "public",
              filter: { categories: ["leader", "character"] },
            },
          },
          value: 4000,
          duration: { type: "thisBattle" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:eventCounter",
        "condition:leaderIdentity",
        "instruction:modifyPower",
        "target:yourLeaderOrCharacters",
        "cardinality:upTo",
        "modifier:positivePower",
        "duration:thisBattle",
      ]),
    );
  });

  it("parses Counter power over a named self field card target", () => {
    const result = parseCardEffectLine(
      "[Counter] Up to 1 of your [Enel] cards gains +2000 power during this battle.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "counter" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "modifyPower",
          target: {
            type: "chooseFromZones",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              zones: ["leaderArea", "characterArea"],
              min: 0,
              max: 1,
              allowFewerIfUnavailable: true,
              visibility: "public",
              filter: { names: ["Enel"] },
            },
          },
          value: 2000,
          duration: { type: "thisBattle" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:eventCounter",
        "instruction:modifyPower",
        "target:yourNamedCards",
        "filter:name",
        "cardinality:upTo",
        "modifier:positivePower",
        "duration:thisBattle",
      ]),
    );
  });

  it("parses Counter power over self Character-or-named-card targets", () => {
    const result = parseCardEffectLine(
      "[Counter] Up to 1 of your Characters or [Silvers Rayleigh] gains +2000 power during this battle.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "counter" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "modifyPower",
          target: {
            type: "chooseFromZones",
            request: {
              timing: "onResolution",
              chooser: "self",
              player: "self",
              zones: ["leaderArea", "characterArea"],
              min: 0,
              max: 1,
              allowFewerIfUnavailable: true,
              visibility: "public",
              filter: {
                anyOf: [
                  { categories: ["character"] },
                  { names: ["Silvers Rayleigh"] },
                ],
              },
            },
          },
          value: 2000,
          duration: { type: "thisBattle" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:eventCounter",
        "instruction:modifyPower",
        "target:yourCharacters",
        "target:yourNamedCards",
        "filter:anyOf",
        "filter:category:character",
        "filter:name",
        "cardinality:upTo",
        "modifier:positivePower",
        "duration:thisBattle",
      ]),
    );
  });

  it("parses Counter power followed by conditional trash-to-hand selection", () => {
    const result = parseCardEffectLine(
      "[Counter] Up to 1 of your Leader or Character cards gains +1000 power during this battle. Then, if you have 10 or more cards in your trash, add up to 1 black Character card with a cost of 3 or less from your trash to your hand.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "counter" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "modifyPower",
                target: { type: "chooseFromZones" },
                value: 1000,
                duration: { type: "thisBattle" },
              },
            },
            {
              connector: "then",
              effect: {
                type: "conditional",
                if: {
                  type: "trashCount",
                  player: "self",
                  op: "gte",
                  value: 10,
                },
                then: {
                  type: "sequence",
                  effects: [
                    {
                      connector: "always",
                      effect: {
                        type: "selectCards",
                        zone: "trash",
                        player: "self",
                        chooser: "self",
                        min: 0,
                        max: 1,
                        filter: {
                          colorsAny: ["black"],
                          categories: ["character"],
                          cost: { max: 3 },
                        },
                        saveAs: "trashSelection:addToHand",
                        visibility: "bothPlayers",
                      },
                    },
                    {
                      connector: "then",
                      effect: {
                        type: "moveSelected",
                        selection: "trashSelection:addToHand",
                        from: "trash",
                        to: "hand",
                      },
                    },
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
        "entry:eventCounter",
        "instruction:modifyPower",
        "target:yourLeaderOrCharacters",
        "expression:conditional",
        "condition:trashCount",
        "condition:comparator:gte",
        "instruction:moveSelected",
        "zone:trash",
        "destination:hand",
        "filter:color",
        "filter:category:character",
        "filter:cost",
      ]),
    );
  });
});
