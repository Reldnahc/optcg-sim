import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses rested DON attachment to the selected DON owner's Leader or Character", () => {
  const result = parseCardEffectLine(
    "[When Attacking] Give up to 1 rested DON!! card to its owner's Leader or 1 of their Characters.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "whenAttacking" },
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultKinds: ["selectedTargets", "selectedCards:don"],
            effect: {
              type: "selectTargets",
              request: {
                chooser: "self",
                player: "anyPlayer",
                zone: "costArea",
                min: 0,
                max: 1,
                filter: { categories: ["don"], state: "rested" },
              },
            },
          },
          {
            saveResultKinds: ["selectedTargets"],
            effect: {
              type: "selectTargets",
              ownerConstraint: {
                type: "sameAsSavedReferenceOwner",
                selection: "donSelection:attach",
              },
              request: {
                chooser: "self",
                player: "anyPlayer",
                zones: ["leaderArea", "characterArea"],
                min: 1,
                max: 1,
                filter: { categories: ["leader", "character"] },
              },
            },
          },
          {
            effect: {
              type: "attachSelectedDon",
              targetOwner: "selectedDonOwner",
              sourceState: "rested",
              target: { type: "savedFieldObject", player: "anyPlayer" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:whenAttacking",
      "instruction:attachDon",
      "filter:state:rested",
      "reference:ownerOfSelected",
      "composition:selectThenApply",
    ]),
  );
});

it("parses owner-relative DON attachment bodies through the same selection shape", () => {
  const costAreaSource = parseCardEffectLine(
    "[On Play] Give up to 1 DON!! card from its owner's cost area to its owner's Leader or 1 of their Characters.",
  );
  const restedSource = parseCardEffectLine(
    "[On Play] Give up to 1 rested DON!! card to its owner's Leader or 1 of their Characters.",
  );

  expect(costAreaSource).toMatchObject({
    block: {
      effect: {
        type: "sequence",
        effects: [
          {
            id: "select:don-to-attach",
            saveResultKinds: ["selectedTargets", "selectedCards:don"],
            effect: {
              type: "selectTargets",
              request: {
                player: "anyPlayer",
                zone: "costArea",
                filter: { categories: ["don"] },
              },
            },
          },
          {
            id: "select:don-attach-target",
            saveResultKinds: ["selectedTargets"],
            effect: {
              type: "selectTargets",
              ownerConstraint: {
                type: "sameAsSavedReferenceOwner",
                selection: "donSelection:attach",
              },
              request: {
                player: "anyPlayer",
                zones: ["leaderArea", "characterArea"],
                filter: { categories: ["leader", "character"] },
              },
            },
          },
          {
            id: "attach:selected-don",
            effect: {
              type: "attachSelectedDon",
              targetOwner: "selectedDonOwner",
            },
          },
        ],
      },
    },
  });
  expect(restedSource).toMatchObject({
    block: {
      effect: {
        type: "sequence",
        effects: [
          {
            id: "select:don-to-attach",
            saveResultKinds: ["selectedTargets", "selectedCards:don"],
            effect: {
              type: "selectTargets",
              request: {
                player: "anyPlayer",
                zone: "costArea",
                filter: { categories: ["don"], state: "rested" },
              },
            },
          },
          {
            id: "select:don-attach-target",
            saveResultKinds: ["selectedTargets"],
          },
          {
            id: "attach:selected-don",
            effect: {
              type: "attachSelectedDon",
              sourceState: "rested",
              targetOwner: "selectedDonOwner",
            },
          },
        ],
      },
    },
  });
});

it("parses opponent rested DON attachment to opponent Characters", () => {
  const result = parseCardEffectLine(
    "[On Play] Give up to 3 of your opponent's rested DON!! cards to 1 of your opponent's Characters.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultKinds: ["selectedTargets", "selectedCards:don"],
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "costArea",
                min: 0,
                max: 3,
                filter: { categories: ["don"], state: "rested" },
              },
            },
          },
          {
            saveResultKinds: ["selectedTargets"],
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "characterArea",
                min: 1,
                max: 1,
                filter: { categories: ["character"] },
              },
            },
          },
          {
            effect: {
              type: "attachSelectedDon",
              sourceState: "rested",
              target: { type: "savedFieldObject", player: "opponent" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:attachDon",
      "player:opponent",
      "filter:state:rested",
      "composition:selectThenApply",
    ]),
  );
});

it("parses currently-given DON attachment as attached-DON source selection", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may rest this Stage: Give up to 1 of your currently given DON!! cards to 1 of your {Straw Hat Crew} type Characters.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
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
                  saveResultKinds: ["selectedTargets", "selectedCards:don"],
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "self",
                      zone: "costArea",
                      filter: { categories: ["don"], state: "attached" },
                    },
                  },
                },
                {
                  saveResultKinds: ["selectedTargets"],
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "self",
                      zone: "characterArea",
                      filter: {
                        categories: ["character"],
                        typesAny: ["Straw Hat Crew"],
                      },
                    },
                  },
                },
                {
                  effect: {
                    type: "attachSelectedDon",
                    target: {
                      type: "savedFieldObject",
                      player: "self",
                      zone: "characterArea",
                      filter: {
                        categories: ["character"],
                        typesAny: ["Straw Hat Crew"],
                      },
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
      "cost:restSelf",
      "instruction:attachDon",
      "zone:costArea",
      "filter:state:attached",
      "filter:type",
      "composition:selectThenApply",
    ]),
  );
});

it("parses rested DON attachment to a named self Leader target", () => {
  const result = parseCardEffectLine(
    "[On Play] Give up to 2 rested DON!! cards to your [Trafalgar Law] Leader.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultKinds: ["selectedCards:don"],
            effect: {
              type: "selectCards",
              zone: "costArea",
              player: "self",
              filter: { categories: ["don"], state: "rested" },
            },
          },
          {
            saveResultKinds: ["selectedTargets"],
            effect: {
              type: "selectTargets",
              request: {
                player: "self",
                zones: ["leaderArea", "characterArea"],
                filter: { categories: ["leader"], names: ["Trafalgar Law"] },
                min: 1,
                max: 1,
              },
            },
          },
          {
            effect: {
              type: "attachSelectedDon",
              sourceState: "rested",
              target: {
                type: "savedFieldObject",
                filter: { categories: ["leader"], names: ["Trafalgar Law"] },
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:attachDon",
      "zone:leaderArea",
      "filter:category:leader",
      "filter:name",
      "composition:selectThenApply",
    ]),
  );
});

it("parses opponent cost-area DON attachment without requiring a rested source", () => {
  const result = parseCardEffectLine(
    "[On Play] Give up to 2 DON!! cards from your opponent's cost area to 1 of your opponent's Characters.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultKinds: ["selectedTargets", "selectedCards:don"],
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "costArea",
                min: 0,
                max: 2,
                filter: { categories: ["don"] },
              },
            },
          },
          {
            saveResultKinds: ["selectedTargets"],
            effect: {
              type: "selectTargets",
              request: {
                player: "opponent",
                zone: "characterArea",
                min: 1,
                max: 1,
                filter: { categories: ["character"] },
              },
            },
          },
          {
            effect: {
              type: "attachSelectedDon",
              target: { type: "savedFieldObject", player: "opponent" },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:attachDon",
      "player:opponent",
      "zone:costArea",
      "composition:selectThenApply",
    ]),
  );
});

it("parses rested DON attachment to type-including Leader or Character targets", () => {
  const result = parseCardEffectLine(
    '[When Attacking] Give up to 1 rested DON!! card to your Leader with a type including "Whitebeard Pirates" or 1 Character with a type including "Whitebeard Pirates".',
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "whenAttacking" },
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultKinds: ["selectedCards:don"],
            effect: {
              type: "selectCards",
              zone: "costArea",
              player: "self",
              min: 0,
              max: 1,
              filter: { categories: ["don"], state: "rested" },
            },
          },
          {
            saveResultKinds: ["selectedTargets"],
            effect: {
              type: "selectTargets",
              request: {
                player: "self",
                zones: ["leaderArea", "characterArea"],
                min: 1,
                max: 1,
                filter: {
                  categories: ["leader", "character"],
                  typesIncludeAny: ["Whitebeard Pirates"],
                },
              },
            },
          },
          {
            effect: {
              type: "attachSelectedDon",
              target: {
                type: "savedFieldObject",
                player: "self",
                zones: ["leaderArea", "characterArea"],
                filter: {
                  categories: ["leader", "character"],
                  typesIncludeAny: ["Whitebeard Pirates"],
                },
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:whenAttacking",
      "instruction:attachDon",
      "filter:state:rested",
      "filter:type",
      "filter:category:leader",
      "filter:category:character",
      "composition:selectThenApply",
    ]),
  );
});

it("parses rested DON attachment to another type-including Leader or Character target", () => {
  const result = parseCardEffectLine(
    '[On Play] Give up to 2 rested DON!! cards to your Leader with a type including "Navy" or 1 Character with a type including "Navy".',
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultKinds: ["selectedCards:don"],
            effect: {
              type: "selectCards",
              max: 2,
              filter: { categories: ["don"], state: "rested" },
            },
          },
          {
            saveResultKinds: ["selectedTargets"],
            effect: {
              type: "selectTargets",
              request: {
                zones: ["leaderArea", "characterArea"],
                filter: {
                  categories: ["leader", "character"],
                  typesIncludeAny: ["Navy"],
                },
              },
            },
          },
          {
            effect: {
              type: "attachSelectedDon",
              target: {
                filter: {
                  categories: ["leader", "character"],
                  typesIncludeAny: ["Navy"],
                },
              },
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:attachDon",
      "filter:type",
      "filter:category:leader",
      "filter:category:character",
    ]),
  );
});
