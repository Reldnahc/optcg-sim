import { describe, expect, it } from "vitest";

import { parseSetFieldActiveInstruction } from "./field-activation.js";

describe("field activation instruction parser", () => {
  it("parses this Character activation as a self-target activate primitive", () => {
    expect(
      parseSetFieldActiveInstruction({
        text: "Set this Character as active.",
      }),
    ).toEqual({
      effect: {
        type: "activate",
        target: { type: "self" },
      },
      evidence: [
        "instruction:activate",
        "target:thisCharacter",
        "state:active",
      ],
      rest: "",
    });
  });

  it("parses delayed this Character activation as a delayed self-target activate primitive", () => {
    expect(
      parseSetFieldActiveInstruction({
        text: "Set this Character as active at the end of this turn.",
      }),
    ).toEqual({
      effect: {
        type: "delayed",
        timing: { type: "endOfTurn", turn: "current" },
        effect: {
          type: "activate",
          target: { type: "self" },
        },
      },
      evidence: [
        "instruction:activate",
        "target:thisCharacter",
        "state:active",
        "duration:endOfTurn",
        "composition:delayed",
      ],
      rest: "",
    });
  });

  it("parses mass leader and character activation as reusable activate targets", () => {
    expect(
      parseSetFieldActiveInstruction({
        text: "set your Leader and all of your Characters as active.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: { type: "activate", target: { type: "myLeader" } },
          },
          {
            connector: "always",
            effect: {
              type: "activate",
              target: {
                type: "all",
                player: "self",
                zone: "characterArea",
                filter: { categories: ["character"] },
              },
            },
          },
        ],
      },
      evidence: [
        "instruction:activate",
        "target:yourLeader",
        "cardinality:all",
        "player:self",
        "zone:characterArea",
        "filter:category:character",
        "state:active",
        "composition:sequence",
      ],
      rest: "",
    });
  });

  it("parses typed Leader or Character activation as a reusable saved target", () => {
    expect(
      parseSetFieldActiveInstruction({
        text: "Set up to 1 of your {East Blue} type Leader or Character cards with a cost of 6 or less as active.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "targetSelection:set-field-active",
            effect: {
              type: "selectTargets",
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
                  categories: ["leader", "character"],
                  typesAny: ["East Blue"],
                  cost: { max: 6 },
                },
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "activate",
              target: {
                type: "savedFieldObject",
                zones: ["leaderArea", "characterArea"],
                player: "self",
              },
            },
          },
        ],
      },
      evidence: [
        "instruction:activate",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "target:yourLeaderOrCharacters",
        "player:self",
        "filter:type",
        "filter:category:leader",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "state:active",
        "composition:selectThenApply",
      ],
      rest: "",
    });
  });

  it("parses typed Character activation without an explicit owner phrase", () => {
    expect(
      parseSetFieldActiveInstruction({
        text: "set up to 1 {Egghead} type Character with a cost of 5 or less as active.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "targetSelection:set-field-active",
            effect: {
              type: "selectTargets",
              request: {
                player: "self",
                zone: "characterArea",
                min: 0,
                max: 1,
                filter: {
                  categories: ["character"],
                  typesAny: ["Egghead"],
                  cost: { max: 5 },
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
      evidence: [
        "instruction:activate",
        "cardinality:upTo",
        "count:positiveInteger",
        "player:self",
        "chooser:self:upTo",
        "zone:characterArea",
        "filter:type",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "state:active",
        "composition:selectThenApply",
      ],
      rest: "",
    });
  });

  it("parses colored Stage activation as a reusable saved target", () => {
    expect(
      parseSetFieldActiveInstruction({
        text: "set up to 1 of your purple Stages as active.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "targetSelection:set-field-active",
            effect: {
              type: "selectTargets",
              request: {
                timing: "onResolution",
                chooser: "self",
                player: "self",
                zone: "stageArea",
                min: 0,
                max: 1,
                filter: {
                  categories: ["stage"],
                  colorsAny: ["purple"],
                },
              },
            },
          },
          {
            effect: {
              type: "activate",
              target: {
                type: "savedFieldObject",
                zone: "stageArea",
                player: "self",
              },
            },
          },
        ],
      },
      evidence: [
        "instruction:activate",
        "cardinality:upTo",
        "count:positiveInteger",
        "player:self",
        "chooser:self:upTo",
        "zone:stageArea",
        "filter:color",
        "filter:category:stage",
        "state:active",
        "composition:selectThenApply",
      ],
      rest: "",
    });
  });

  it("parses typed Leader activation as a filtered leader-area activate primitive", () => {
    expect(
      parseSetFieldActiveInstruction({
        text: "Set your {Fish-Man} type Leader as active.",
      }),
    ).toMatchObject({
      effect: {
        type: "activate",
        target: {
          type: "all",
          player: "self",
          zone: "leaderArea",
          filter: {
            categories: ["leader"],
            typesAny: ["Fish-Man"],
          },
        },
      },
      evidence: [
        "instruction:activate",
        "target:yourLeader",
        "player:self",
        "zone:leaderArea",
        "filter:category:leader",
        "filter:type",
        "state:active",
      ],
      rest: "",
    });
  });

  it("parses named Leader activation before or after the Leader noun", () => {
    for (const text of [
      "Set your Leader [Yamato] as active.",
      "Set your [Yamato] Leader as active.",
    ]) {
      expect(parseSetFieldActiveInstruction({ text })).toMatchObject({
        effect: {
          type: "activate",
          target: {
            type: "all",
            player: "self",
            zone: "leaderArea",
            filter: {
              categories: ["leader"],
              names: ["Yamato"],
            },
          },
        },
        evidence: [
          "instruction:activate",
          "target:yourLeader",
          "player:self",
          "zone:leaderArea",
          "filter:category:leader",
          "filter:name",
          "state:active",
        ],
        rest: "",
      });
    }
  });

  it("parses cardinality named Leader activation as a reusable saved target", () => {
    expect(
      parseSetFieldActiveInstruction({
        text: "Set up to 1 of your [Uta] Leader as active.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            saveResultAs: "targetSelection:set-field-active",
            effect: {
              type: "selectTargets",
              request: {
                timing: "onResolution",
                chooser: "self",
                zone: "leaderArea",
                player: "self",
                filter: {
                  categories: ["leader"],
                  names: ["Uta"],
                },
                min: 0,
                max: 1,
                allowFewerIfUnavailable: true,
                visibility: "public",
              },
            },
          },
          {
            connector: "then",
            effect: {
              type: "activate",
              target: {
                type: "savedFieldObject",
                zone: "leaderArea",
                player: "self",
              },
            },
          },
        ],
      },
      evidence: [
        "instruction:activate",
        "cardinality:upTo",
        "count:positiveInteger",
        "player:self",
        "chooser:self:upTo",
        "zone:leaderArea",
        "filter:category:leader",
        "filter:name",
        "state:active",
        "composition:selectThenApply",
      ],
      rest: "",
    });
  });

  it("parses named field-card activation as a reusable saved target", () => {
    expect(
      parseSetFieldActiveInstruction({
        text: "set up to 1 of your [Foxy] cards as active.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            saveResultAs: "targetSelection:set-field-active",
            effect: {
              type: "selectTargets",
              request: {
                player: "self",
                zones: ["leaderArea", "characterArea"],
                min: 0,
                max: 1,
                filter: { names: ["Foxy"] },
              },
            },
          },
          {
            effect: {
              type: "activate",
              target: {
                type: "savedFieldObject",
                zones: ["leaderArea", "characterArea"],
                player: "self",
              },
            },
          },
        ],
      },
      evidence: [
        "instruction:activate",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "target:yourNamedCards",
        "player:self",
        "filter:name",
        "state:active",
        "composition:selectThenApply",
      ],
      rest: "",
    });
  });

  it("parses compound Character and DON activation through reusable activation primitives", () => {
    const result = parseSetFieldActiveInstruction({
      text: "Set up to 1 of your {Fish-Man} or {Merfolk} type Characters and up to 1 of your DON!! cards as active.",
    });

    expect(result).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "sequence",
            },
          },
          {
            connector: "then",
            effect: {
              type: "sequence",
            },
          },
        ],
      },
    });
    const [fieldActivation, donActivation] =
      result?.effect.type === "sequence" ? result.effect.effects : [];
    expect(fieldActivation?.effect).toMatchObject({
      type: "sequence",
      effects: [
        {
          effect: {
            type: "selectTargets",
            request: {
              zone: "characterArea",
              player: "self",
              filter: {
                categories: ["character"],
                typesAny: ["Fish-Man", "Merfolk"],
              },
            },
          },
        },
        { effect: { type: "activate" } },
      ],
    });
    expect(donActivation?.effect).toMatchObject({
      type: "sequence",
      effects: [
        {
          effect: {
            type: "selectTargets",
            request: {
              zone: "costArea",
              player: "self",
              filter: { categories: ["don"], state: "rested" },
            },
          },
        },
        { effect: { type: "activate" } },
      ],
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "instruction:activate",
        "composition:compoundActivation",
        "filter:type",
        "target:yourDonCards",
        "composition:selectThenApply",
      ]),
    );
  });
});
