import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("permanent dynamic trash-batch parser", () => {
  it("parses leader-type conditional power gain per trash batch as a dynamic value", () => {
    const result = parseCardEffectLine(
      "If your Leader has the {Blackbeard Pirates} type, this Character gains +1000 power for every 4 cards in your trash.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "modifyPower",
          target: { type: "self" },
          value: {
            type: "countMatchingZoneCards",
            player: "self",
            zone: "trash",
            per: 4,
            multiplier: 1000,
          },
          duration: {
            type: "whileConditionTrue",
            condition: {
              type: "hasCardInZone",
              zone: "leaderArea",
              player: "self",
              filter: {
                categories: ["leader"],
                typesAny: ["Blackbeard Pirates"],
              },
            },
          },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitPermanent",
        "condition:leaderIdentity",
        "filter:type",
        "instruction:modifyPower",
        "target:thisCharacter",
        "modifier:positivePower",
        "value:dynamic:matchingZoneCards",
        "zone:trash",
      ]),
    );
  });

  it("parses leader type-includes power and cost gains per trash batch as separate modifiers", () => {
    const result = parseCardEffectLine(
      'If your Leader\'s type includes "CP", this Character gains +1000 power and +2 cost for every 5 cards in your trash.',
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "modifyPower",
                target: { type: "self" },
                value: {
                  type: "countMatchingZoneCards",
                  player: "self",
                  zone: "trash",
                  per: 5,
                  multiplier: 1000,
                },
              },
            },
            {
              connector: "always",
              effect: {
                type: "modifyCost",
                target: { type: "self" },
                value: {
                  type: "countMatchingZoneCards",
                  player: "self",
                  zone: "trash",
                  per: 5,
                  multiplier: 2,
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "condition:leaderIdentity",
        "filter:type",
        "instruction:modifyPower",
        "instruction:modifyCost",
        "modifier:positivePower",
        "modifier:positiveCost",
        "value:dynamic:matchingZoneCards",
      ]),
    );
  });

  it("parses leader-type conditional keyword and cost gains per trash batch as separate modifiers", () => {
    const result = parseCardEffectLine(
      "If your Leader has the {Blackbeard Pirates} type, this Character gains [Blocker] and +1 cost for every 4 cards in your trash.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "giveKeyword",
                target: { type: "self" },
                keyword: "blocker",
              },
            },
            {
              connector: "always",
              effect: {
                type: "modifyCost",
                target: { type: "self" },
                value: {
                  type: "countMatchingZoneCards",
                  player: "self",
                  zone: "trash",
                  per: 4,
                  multiplier: 1,
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "condition:leaderIdentity",
        "filter:type",
        "instruction:giveKeyword",
        "instruction:modifyCost",
        "keyword:anySupported",
        "modifier:positiveCost",
        "value:dynamic:matchingZoneCards",
        "zone:trash",
      ]),
    );
  });

  it("parses filtered trash batches as the same dynamic power value primitive", () => {
    const result = parseCardEffectLine(
      "This Character gains +1000 power for every 5 Events in your trash.",
    );

    expect(result).toMatchObject({
      block: {
        category: "permanent",
        trigger: { type: "permanent" },
        effect: {
          type: "modifyPower",
          target: { type: "self" },
          value: {
            type: "countMatchingZoneCards",
            player: "self",
            zone: "trash",
            filter: { categories: ["event"] },
            per: 5,
            multiplier: 1000,
          },
          duration: { type: "whileSourceOnField" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:implicitPermanent",
        "instruction:modifyPower",
        "target:thisCharacter",
        "modifier:positivePower",
        "value:dynamic:matchingZoneCards",
        "zone:trash",
        "filter:category:event",
      ]),
    );
  });
});
