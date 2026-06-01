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

  it("parses adjacent circled DON and rest-self costs before a search body", () => {
    const result = parseCardEffectLine(
      "[Activate: Main] ➀ (You may rest the specified number of DON!! cards in your cost area.) You may rest this Character: Look at 5 cards from the top of your deck; reveal up to 1 {Supernovas} type card and add it to your hand. Then, place the rest at the bottom of your deck in any order.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "activateMain" },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "payCost",
                cost: {
                  type: "sequence",
                  optional: true,
                  costs: [
                    { type: "restDon", count: 1, chooser: "self" },
                    { type: "restSelf" },
                  ],
                },
              },
            },
            {
              effect: {
                type: "search",
                request: {
                  zone: "deck",
                  player: "self",
                  lookCount: 5,
                  filter: { typesAny: ["Supernovas"] },
                  min: 0,
                  max: 1,
                  destination: "hand",
                  revealTo: "bothPlayers",
                  remainingCards: {
                    destination: "deck",
                    position: "bottom",
                    order: "ownerChoice",
                  },
                },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toContain("composition:costSequence");
    expect(result?.evidence).toContain("cost:restDon");
    expect(result?.evidence).toContain("cost:restSelf");
    expect(result?.evidence).toContain("instruction:search");
  });

  it("parses return-to-owner-hand cost into play-from-hand rested body", () => {
    const result = parseCardEffectLine(
      "[On Play] You may return 1 of your Characters to the owner's hand: Play up to 1 Character card with a cost of 5 or less from your hand rested.",
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
            { effect: { type: "bounce", destination: "hand" } },
            {
              effect: {
                type: "sequence",
                effects: [
                  {
                    effect: {
                      type: "selectCards",
                      zone: "hand",
                      filter: {
                        categories: ["character"],
                        cost: { max: 5 },
                      },
                    },
                  },
                  {
                    effect: {
                      type: "playSelected",
                      ignoreCost: true,
                      enterRested: true,
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toContain("cost:returnToOwnerHand");
    expect(result?.evidence).toContain("instruction:playSelected");
    expect(result?.evidence).toContain("state:rested");
  });

  it("parses filtered return-to-owner-hand cost into reusable character activation body", () => {
    const result = parseCardEffectLine(
      "[DON!! x1] [When Attacking] [Once Per Turn] You may return 1 of your Characters with a cost of 2 or more to the owner's hand: Set up to 1 of your Characters with 7000 power or less as active.",
    );

    expect(result).toMatchObject({
      block: {
        trigger: { type: "whenAttacking" },
        oncePerTurn: true,
        condition: {
          type: "attachedDonCount",
          target: { type: "self" },
          op: "gte",
          value: 1,
        },
        effect: {
          type: "sequence",
          effects: [
            {
              effect: {
                type: "selectTargets",
                request: {
                  player: "self",
                  zone: "characterArea",
                  filter: {
                    categories: ["character"],
                    cost: { min: 2 },
                  },
                },
              },
            },
            {
              effect: { type: "bounce", destination: "hand" },
            },
            {
              effect: {
                type: "sequence",
                effects: [
                  {
                    effect: {
                      type: "selectTargets",
                      request: {
                        player: "self",
                        zone: "characterArea",
                        filter: {
                          categories: ["character"],
                          currentPower: { max: 7000 },
                        },
                      },
                    },
                  },
                  {
                    effect: {
                      type: "activate",
                      target: {
                        type: "savedFieldObject",
                        zone: "characterArea",
                        player: "self",
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
    expect(result?.evidence).toContain("marker:attachedDon");
    expect(result?.evidence).toContain("marker:oncePerTurn");
    expect(result?.evidence).toContain("cost:returnToOwnerHand");
    expect(result?.evidence).toContain("filter:cost");
    expect(result?.evidence).toContain("condition:comparator:gte");
    expect(result?.evidence).toContain("instruction:activate");
    expect(result?.evidence).toContain("filter:currentPower");
    expect(result?.evidence).toContain("condition:comparator:lte");
  });
});
