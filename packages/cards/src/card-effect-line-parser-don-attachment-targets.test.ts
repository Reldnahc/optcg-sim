import { expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

it("parses rest target then rested-DON attachment to a named Leader as reusable sequence segments", () => {
  const result = parseCardEffectLine(
    "[On Play] Rest up to 1 of your opponent's Characters with a base cost of 6 or less. Then, give up to 3 rested DON!! cards to your [Roronoa Zoro] Leader.",
  );

  expect(result).toMatchObject({
    block: {
      category: "auto",
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "opponent",
                      zone: "characterArea",
                      filter: {
                        categories: ["character"],
                        baseCost: { max: 6 },
                      },
                    },
                  },
                },
                { effect: { type: "rest" } },
              ],
            },
          },
          {
            connector: "then",
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectCards",
                    filter: { categories: ["don"], state: "rested" },
                  },
                },
                {
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "self",
                      filter: {
                        categories: ["leader"],
                        names: ["Roronoa Zoro"],
                      },
                    },
                  },
                },
                { effect: { type: "attachSelectedDon" } },
              ],
            },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "entry:onPlay",
      "instruction:rest",
      "filter:cost",
      "instruction:attachDon",
      "filter:name",
      "composition:selectThenApply",
    ]),
  );
});

it("parses rested DON attachment to generic bracket-name card targets", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] [Once Per Turn] Give up to 1 rested DON!! card to 1 of your [Nami] cards.",
  );

  expect(result).toMatchObject({
    block: {
      category: "activate",
      trigger: { type: "activateMain" },
      oncePerTurn: true,
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectCards",
              zone: "costArea",
              filter: { categories: ["don"], state: "rested" },
            },
          },
          {
            effect: {
              type: "selectTargets",
              request: {
                zones: ["leaderArea", "characterArea"],
                filter: {
                  categories: ["leader", "character"],
                  names: ["Nami"],
                },
              },
            },
          },
          {
            effect: { type: "attachSelectedDon" },
          },
        ],
      },
    },
  });
  expect(result?.evidence).toEqual(
    expect.arrayContaining([
      "filter:name",
      "filter:category:leader",
      "filter:category:character",
      "composition:selectThenApply",
    ]),
  );
});

it("parses typed Leader-only rested DON attachment without requiring Character targets", () => {
  const result = parseCardEffectLine(
    "[On Play] Give up to 1 rested DON!! card to 1 of your {Supernovas} type Leader.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "onPlay" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectCards",
              zone: "costArea",
              filter: { categories: ["don"], state: "rested" },
            },
          },
          {
            effect: {
              type: "selectTargets",
              request: {
                player: "self",
                zone: "leaderArea",
                filter: {
                  categories: ["leader"],
                  typesAny: ["Supernovas"],
                },
              },
            },
          },
          {
            effect: {
              type: "attachSelectedDon",
              target: {
                type: "savedFieldObject",
                zone: "leaderArea",
                player: "self",
                filter: {
                  categories: ["leader"],
                  typesAny: ["Supernovas"],
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
      "filter:state:rested",
      "zone:leaderArea",
      "filter:type",
      "filter:category:leader",
    ]),
  );
});

it("parses typed Leader-only rested DON attachment without an explicit one-of prefix", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may trash this Character: Give up to 1 rested DON!! card to your {Land of Wano} type Leader.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: { type: "payCost", cost: { type: "trashSelf" } },
          },
          {
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectCards",
                    zone: "costArea",
                    filter: { categories: ["don"], state: "rested" },
                  },
                },
                {
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "self",
                      zone: "leaderArea",
                      filter: {
                        categories: ["leader"],
                        typesAny: ["Land of Wano"],
                      },
                    },
                  },
                },
                {
                  effect: {
                    type: "attachSelectedDon",
                    target: {
                      type: "savedFieldObject",
                      zone: "leaderArea",
                      player: "self",
                      filter: {
                        categories: ["leader"],
                        typesAny: ["Land of Wano"],
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
      "cost:trashSelf",
      "instruction:attachDon",
      "filter:state:rested",
      "zone:leaderArea",
      "filter:type",
      "filter:category:leader",
    ]),
  );
});

it("parses attribute Leader-only rested DON attachment", () => {
  const result = parseCardEffectLine(
    "[Activate: Main] You may rest this Character: Give up to 2 rested DON!! cards to your <Slash> attribute Leader.",
  );

  expect(result).toMatchObject({
    block: {
      trigger: { type: "activateMain" },
      effect: {
        type: "sequence",
        effects: [
          {
            effect: { type: "payCost", cost: { type: "restSelf" } },
          },
          {
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectCards",
                    zone: "costArea",
                    max: 2,
                    filter: { categories: ["don"], state: "rested" },
                  },
                },
                {
                  effect: {
                    type: "selectTargets",
                    request: {
                      player: "self",
                      zone: "leaderArea",
                      filter: {
                        categories: ["leader"],
                        attributesAny: ["slash"],
                      },
                    },
                  },
                },
                {
                  effect: {
                    type: "attachSelectedDon",
                    target: {
                      type: "savedFieldObject",
                      zone: "leaderArea",
                      player: "self",
                      filter: {
                        categories: ["leader"],
                        attributesAny: ["slash"],
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
      "cost:restSelf",
      "instruction:attachDon",
      "filter:state:rested",
      "zone:leaderArea",
      "filter:attribute",
      "filter:category:leader",
    ]),
  );
});
