import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("warlords parser primitives", () => {
  it("parses DON attachment marker, circled DON cost, and reveal-top play-rested primitives", () => {
    const result = parseCardEffectLine(
      "[DON!! x2] [When Attacking] ➀ (You may rest the specified number of DON!! cards in your cost area.): Reveal 1 card from the top of your deck. If that card is a {The Seven Warlords of the Sea} type Character card with a cost of 4 or less, you may play that card rested.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "whenAttacking" },
        condition: {
          type: "attachedDonCount",
          target: { type: "self" },
          op: "gte",
          value: 2,
        },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "payCost",
                cost: { type: "restDon", count: 1, chooser: "self" },
              },
            },
            {
              effect: {
                type: "sequence",
                effects: [
                  { effect: { type: "revealTop", count: 1 } },
                  {
                    effect: {
                      type: "selectFromSet",
                      filter: {
                        categories: ["character"],
                        typesAny: ["The Seven Warlords of the Sea"],
                        cost: { max: 4 },
                      },
                    },
                  },
                  {
                    effect: {
                      type: "playSelected",
                      enterRested: true,
                      ignoreCost: true,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toContain("marker:attachedDon");
    expect(result?.evidence).toContain("cost:restDon");
    expect(result?.evidence).toContain("instruction:revealTop");
    expect(result?.evidence).toContain("instruction:selectFromSet");
    expect(result?.evidence).toContain("instruction:playSelected");
  });

  it("parses return-to-owner-hand cost and body as reusable selection and bounce primitives", () => {
    const result = parseCardEffectLine(
      "[On Play] You may return 1 of your Characters to the owner's hand: If your Leader has the {The Seven Warlords of the Sea} type, return up to 1 Character with a cost of 4 or less to the owner's hand.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "selectTargets",
                request: {
                  player: "self",
                  zone: "characterArea",
                  filter: { categories: ["character"] },
                },
              },
            },
            {
              effect: { type: "bounce", destination: "hand" },
            },
            {
              effect: {
                type: "conditional",
                if: {
                  type: "hasCardInZone",
                  zone: "leaderArea",
                  player: "self",
                  filter: {
                    categories: ["leader"],
                    typesAny: ["The Seven Warlords of the Sea"],
                  },
                },
                then: {
                  type: "sequence",
                  effects: [
                    {
                      effect: {
                        type: "selectTargets",
                        request: {
                          player: "anyPlayer",
                          zone: "characterArea",
                          filter: {
                            categories: ["character"],
                            cost: { max: 4 },
                          },
                        },
                      },
                    },
                    {
                      effect: { type: "bounce", destination: "hand" },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toContain("cost:returnToOwnerHand");
    expect(result?.evidence).toContain("condition:leaderIdentity");
    expect(result?.evidence).toContain("instruction:returnToOwnerHand");
    expect(result?.evidence).toContain("destination:ownerHand");
  });

  it("parses unqualified return-to-owner-hand targets as either player's Characters", () => {
    const result = parseCardEffectLine(
      "[On Play] ① (You may rest the specified number of DON!! cards in your cost area.): Return up to 1 Character with a cost of 2 or less to the owner's hand.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "onPlay" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "payCost",
                cost: { type: "restDon", count: 1, chooser: "self" },
              },
            },
            {
              effect: {
                type: "sequence",
                effects: [
                  {
                    effect: {
                      type: "selectTargets",
                      request: {
                        player: "anyPlayer",
                        zone: "characterArea",
                        filter: {
                          categories: ["character"],
                          cost: { max: 2 },
                        },
                      },
                    },
                  },
                  {
                    effect: {
                      type: "bounce",
                      destination: "hand",
                      target: {
                        type: "savedFieldObject",
                        player: "anyPlayer",
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
    expect(result?.evidence).toContain("player:any");
    expect(result?.evidence).toContain("destination:ownerHand");
  });
});
