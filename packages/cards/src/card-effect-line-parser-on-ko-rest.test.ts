import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("On K.O. rest parsing", () => {
  it("parses source Character card from trash to hand as reusable source movement", () => {
    const result = parseCardEffectLine(
      "[On K.O.] Add this Character card from your trash to your hand.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onKO" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "moveCards",
          count: 1,
          from: {
            player: "self",
            zone: "trash",
            source: "effectSource",
          },
          to: { player: "self", zone: "hand" },
          order: "original",
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onKO",
        "sourcePresence:resolveFromDestination",
        "instruction:moveCards",
        "target:thisCharacter",
        "zone:trash",
        "destination:hand",
      ]),
    );
  });

  it("parses target predicates through reusable target/filter primitives", () => {
    const result = parseCardEffectLine(
      "[On K.O.] Rest up to 1 of your opponent's Leader or Character cards with a cost of 7 or less.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onKO" },
        sourcePresencePolicy: "resolveFromDestinationZone",
        effect: {
          type: "rest",
          target: {
            type: "chooseFromZones",
            request: {
              chooser: "self",
              player: "opponent",
              zones: ["leaderArea", "characterArea"],
              min: 0,
              max: 1,
              allowFewerIfUnavailable: true,
              visibility: "public",
              filter: {
                anyOf: [
                  { categories: ["leader"] },
                  { categories: ["character"], cost: { max: 7 } },
                ],
              },
            },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onKO",
        "sourcePresence:resolveFromDestination",
        "instruction:rest",
        "target:opponentLeaderOrCharacters",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
      ]),
    );
  });
});
