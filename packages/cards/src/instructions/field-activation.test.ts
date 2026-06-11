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
});
