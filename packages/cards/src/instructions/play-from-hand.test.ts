import { describe, expect, it } from "vitest";

import { parsePlayFromHandInstruction } from "./play-from-hand.js";

describe("play from hand instruction parser", () => {
  it("parses play from hand as source-zone plus shared predicates", () => {
    expect(
      parsePlayFromHandInstruction({
        text: "Play up to 1 black {Five Elders} type Character card with a cost equal to or less than the number of DON!! cards on your field from your hand.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "handSelection:play-from-hand",
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              filter: {
                colorsAny: ["black"],
                categories: ["character"],
                typesAny: ["Five Elders"],
                custom: "costLteSelfDonFieldCount",
              },
              saveAs: "handSelection:play-from-hand",
              visibility: "chooserOnly",
            },
          },
          {
            connector: "ifPossible",
            effect: {
              type: "playSelected",
              selection: "handSelection:play-from-hand",
              ignoreCost: true,
            },
          },
        ],
      },
      evidence: [
        "instruction:playSelected",
        "cardinality:upTo",
        "count:positiveInteger",
        "zone:hand",
        "player:self",
        "chooser:self:upTo",
        "filter:color",
        "filter:type",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "valueSource:donFieldCount:self",
        "composition:selectThenPlay",
      ],
      rest: "",
    });
  });

  it("parses play from hand rested as reusable play-selected entry state", () => {
    expect(
      parsePlayFromHandInstruction({
        text: "Play up to 1 Character card with a cost of 5 or less from your hand rested.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              filter: {
                categories: ["character"],
                cost: { max: 5 },
              },
            },
          },
          {
            effect: {
              type: "playSelected",
              selection: "handSelection:play-from-hand",
              ignoreCost: true,
              enterRested: true,
            },
          },
        ],
      },
      evidence: [
        "instruction:playSelected",
        "cardinality:upTo",
        "count:positiveInteger",
        "zone:hand",
        "player:self",
        "chooser:self:upTo",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "state:rested",
        "composition:selectThenPlay",
      ],
      rest: "",
    });
  });

  it("parses play from hand with a reusable power range predicate", () => {
    expect(
      parsePlayFromHandInstruction({
        text: "Play up to 1 {Big Mom Pirates} type Character card with 6000 to 8000 power from your hand.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              filter: {
                categories: ["character"],
                typesAny: ["Big Mom Pirates"],
                power: { min: 6000, max: 8000 },
              },
            },
          },
          {
            effect: {
              type: "playSelected",
              selection: "handSelection:play-from-hand",
              ignoreCost: true,
            },
          },
        ],
      },
      evidence: [
        "instruction:playSelected",
        "cardinality:upTo",
        "count:positiveInteger",
        "zone:hand",
        "player:self",
        "chooser:self:upTo",
        "filter:type",
        "filter:category:character",
        "filter:power",
        "condition:comparator:gte",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "condition:threshold:positiveInteger",
        "composition:selectThenPlay",
      ],
      rest: "",
    });
  });

  it("parses opponent play from their hand as opponent-owned hand selection", () => {
    expect(
      parsePlayFromHandInstruction({
        text: "your opponent plays up to 1 Character card with a cost of 4 or less from their hand.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "handSelection:play-from-hand",
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "opponent",
              chooser: "opponent",
              min: 0,
              max: 1,
              filter: {
                categories: ["character"],
                cost: { max: 4 },
              },
              saveAs: "handSelection:play-from-hand",
              visibility: "chooserOnly",
            },
          },
          {
            connector: "ifPossible",
            effect: {
              type: "playSelected",
              selection: "handSelection:play-from-hand",
              ignoreCost: true,
              player: "opponent",
            },
          },
        ],
      },
      evidence: [
        "instruction:playSelected",
        "cardinality:upTo",
        "count:positiveInteger",
        "zone:hand",
        "player:opponent",
        "chooser:opponent",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "composition:selectThenPlay",
      ],
      rest: "",
    });
  });

  it("parses play from hand with separated type-or-attribute alternatives and shared suffix filters", () => {
    expect(
      parsePlayFromHandInstruction({
        text: "play up to 1 {Muggy Kingdom} type or <Slash> attribute Character card with a cost of 4 or less other than [Dracule Mihawk] from your hand rested.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              filter: {
                anyOf: [
                  { typesAny: ["Muggy Kingdom"] },
                  { attributesAny: ["slash"] },
                ],
                categories: ["character"],
                cost: { max: 4 },
                nameNot: ["Dracule Mihawk"],
              },
            },
          },
          {
            effect: {
              type: "playSelected",
              selection: "handSelection:play-from-hand",
              ignoreCost: true,
              enterRested: true,
            },
          },
        ],
      },
      rest: "",
    });
  });

  it("parses play from hand with multiple type alternatives and shared suffix filters", () => {
    expect(
      parsePlayFromHandInstruction({
        text: "Play up to 1 {Alabasta} or {Straw Hat Crew} type Character card with a cost of 5 or less from your hand.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              filter: {
                categories: ["character"],
                typesAny: ["Alabasta", "Straw Hat Crew"],
                cost: { max: 5 },
              },
            },
          },
          {
            effect: {
              type: "playSelected",
              selection: "handSelection:play-from-hand",
              ignoreCost: true,
            },
          },
        ],
      },
      evidence: [
        "instruction:playSelected",
        "cardinality:upTo",
        "count:positiveInteger",
        "zone:hand",
        "player:self",
        "chooser:self:upTo",
        "filter:type",
        "filter:type",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "composition:selectThenPlay",
      ],
      rest: "",
    });
  });

  it("parses play from hand with owner-scoped color/type-or-name alternatives", () => {
    expect(
      parsePlayFromHandInstruction({
        text: "Play up to 1 of your yellow {Straw Hat Crew} type Character cards or [Sanji] with a cost of 5 or less from your hand.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              filter: {
                anyOf: [
                  {
                    colorsAny: ["yellow"],
                    categories: ["character"],
                    typesAny: ["Straw Hat Crew"],
                  },
                  {
                    names: ["Sanji"],
                    cost: { max: 5 },
                  },
                ],
              },
            },
          },
          {
            effect: {
              type: "playSelected",
              selection: "handSelection:play-from-hand",
              ignoreCost: true,
            },
          },
        ],
      },
      evidence: [
        "instruction:playSelected",
        "cardinality:upTo",
        "count:positiveInteger",
        "zone:hand",
        "player:self",
        "chooser:self:upTo",
        "filter:anyOf",
        "filter:color",
        "filter:type",
        "filter:category:character",
        "filter:name",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "composition:selectThenPlay",
      ],
      rest: "",
    });
  });

  it("parses play from hand with separately quantified OR alternatives", () => {
    expect(
      parsePlayFromHandInstruction({
        text: "Play up to 1 [Heavenly Warriors] with a cost of 1 or up to 1 {Vassals} type Character card with a cost of 1 from your hand.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              filter: {
                anyOf: [
                  {
                    names: ["Heavenly Warriors"],
                    cost: { op: "eq", value: 1 },
                  },
                  {
                    categories: ["character"],
                    typesAny: ["Vassals"],
                    cost: { op: "eq", value: 1 },
                  },
                ],
              },
            },
          },
          {
            effect: {
              type: "playSelected",
              selection: "handSelection:play-from-hand",
              ignoreCost: true,
            },
          },
        ],
      },
      rest: "",
    });
    expect(
      parsePlayFromHandInstruction({
        text: "Play up to 1 [Heavenly Warriors] with a cost of 1 or up to 1 {Vassals} type Character card with a cost of 1 from your hand.",
      })?.evidence,
    ).toEqual(
      expect.arrayContaining([
        "instruction:playSelected",
        "filter:anyOf",
        "filter:name",
        "filter:type",
        "filter:category:character",
        "filter:cost",
        "composition:selectThenPlay",
      ]),
    );
  });

  it("parses hand-or-trash play with separately quantified OR alternatives", () => {
    const result = parsePlayFromHandInstruction({
      text: "Play up to 1 {Revolutionary Army} type Character card with a cost of 6 or less other than [Koala] or up to 1 [Nico Robin] with a cost of 6 or less from your hand or trash.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "choice",
        options: [
          {
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectCards",
                    zone: "hand",
                    filter: {
                      anyOf: [
                        {
                          categories: ["character"],
                          typesAny: ["Revolutionary Army"],
                          cost: { max: 6 },
                          nameNot: ["Koala"],
                        },
                        {
                          names: ["Nico Robin"],
                          cost: { max: 6 },
                        },
                      ],
                    },
                  },
                },
                { effect: { type: "playSelected" } },
              ],
            },
          },
          {
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectCards",
                    zone: "trash",
                    filter: {
                      anyOf: [
                        {
                          categories: ["character"],
                          typesAny: ["Revolutionary Army"],
                          cost: { max: 6 },
                          nameNot: ["Koala"],
                        },
                        {
                          names: ["Nico Robin"],
                          cost: { max: 6 },
                        },
                      ],
                    },
                  },
                },
                { effect: { type: "playSelected" } },
              ],
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:playSelected",
        "zone:hand",
        "zone:trash",
        "filter:anyOf",
        "filter:type",
        "filter:name",
        "filter:nameNot",
        "composition:chooseOne",
      ]),
    );
  });

  it("parses repeated hand-or-trash plays with independent quantified filters", () => {
    const result = parsePlayFromHandInstruction({
      text: "play up to 1 {Thriller Bark Pirates} type Character card with a cost of 6 or less and up to 1 {Thriller Bark Pirates} type Character card with a cost of 4 or less from your hand or trash.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "choice",
              options: [
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
                            typesAny: ["Thriller Bark Pirates"],
                            cost: { max: 6 },
                          },
                        },
                      },
                      { effect: { type: "playSelected" } },
                    ],
                  },
                },
                {
                  effect: {
                    type: "sequence",
                    effects: [
                      {
                        effect: {
                          type: "selectCards",
                          zone: "trash",
                          filter: {
                            categories: ["character"],
                            typesAny: ["Thriller Bark Pirates"],
                            cost: { max: 6 },
                          },
                        },
                      },
                      { effect: { type: "playSelected" } },
                    ],
                  },
                },
              ],
            },
          },
          {
            connector: "then",
            effect: {
              type: "choice",
              options: [
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
                            typesAny: ["Thriller Bark Pirates"],
                            cost: { max: 4 },
                          },
                        },
                      },
                      { effect: { type: "playSelected" } },
                    ],
                  },
                },
                {
                  effect: {
                    type: "sequence",
                    effects: [
                      {
                        effect: {
                          type: "selectCards",
                          zone: "trash",
                          filter: {
                            categories: ["character"],
                            typesAny: ["Thriller Bark Pirates"],
                            cost: { max: 4 },
                          },
                        },
                      },
                      { effect: { type: "playSelected" } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:playSelected",
        "expression:sequence",
        "zone:hand",
        "zone:trash",
        "filter:type",
        "filter:cost",
        "composition:chooseOne",
      ]),
    );
  });

  it("parses hand-or-trash play with comma-or name alternatives and shared predicates", () => {
    const result = parsePlayFromHandInstruction({
      text: "play up to 1 [Sabo], [Portgas.D.Ace], or [Monkey.D.Luffy] with a cost of 2 from your hand or trash.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "choice",
        options: [
          {
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectCards",
                    zone: "hand",
                    filter: {
                      anyOf: [
                        { names: ["Sabo"] },
                        { names: ["Portgas.D.Ace"] },
                        { names: ["Monkey.D.Luffy"] },
                      ],
                      cost: { op: "eq", value: 2 },
                    },
                  },
                },
                { effect: { type: "playSelected" } },
              ],
            },
          },
          {
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectCards",
                    zone: "trash",
                    filter: {
                      anyOf: [
                        { names: ["Sabo"] },
                        { names: ["Portgas.D.Ace"] },
                        { names: ["Monkey.D.Luffy"] },
                      ],
                      cost: { op: "eq", value: 2 },
                    },
                  },
                },
                { effect: { type: "playSelected" } },
              ],
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:playSelected",
        "zone:hand",
        "zone:trash",
        "filter:anyOf",
        "filter:name",
        "filter:cost",
        "composition:chooseOne",
      ]),
    );
  });

  it("parses each named hand play as independent optional play selections", () => {
    const result = parsePlayFromHandInstruction({
      text: "Play up to 1 each of [Sabo], [Portgas.D.Ace], and [Monkey.D.Luffy] with a cost of 2 from your hand.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            effect: {
              type: "sequence",
              effects: [
                {
                  effect: {
                    type: "selectCards",
                    zone: "hand",
                    min: 0,
                    max: 1,
                    filter: { names: ["Sabo"], cost: { op: "eq", value: 2 } },
                  },
                },
                { effect: { type: "playSelected", ignoreCost: true } },
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
                    zone: "hand",
                    filter: {
                      names: ["Portgas.D.Ace"],
                      cost: { op: "eq", value: 2 },
                    },
                  },
                },
                { effect: { type: "playSelected", ignoreCost: true } },
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
                    zone: "hand",
                    filter: {
                      names: ["Monkey.D.Luffy"],
                      cost: { op: "eq", value: 2 },
                    },
                  },
                },
                { effect: { type: "playSelected", ignoreCost: true } },
              ],
            },
          },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:playSelected",
        "expression:sequence",
        "cardinality:upTo",
        "zone:hand",
        "filter:name",
        "filter:cost",
        "composition:selectThenPlay",
      ]),
    );
  });
});
