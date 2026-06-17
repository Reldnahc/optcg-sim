import { describe, expect, it } from "vitest";

import {
  lifeMovementPrimitive,
  parseLifeMovementInstruction,
} from "./life-movement.js";

describe("life movement instruction parser", () => {
  it("groups Life movement shapes under the reusable moveCards primitive", () => {
    expect(lifeMovementPrimitive.primitiveId).toBe("instruction:moveCards");
    expect(lifeMovementPrimitive.matches.map((match) => match.id)).toContain(
      "add-up-to-n-cards-from-deck-top-to-life-top",
    );
  });

  it("parses exact deck top to Life top placement as the same moveCards primitive", () => {
    expect(
      parseLifeMovementInstruction({
        text: "Add 1 card from the top of your deck to the top of your Life cards.",
      }),
    ).toEqual({
      effect: {
        type: "moveCards",
        count: 1,
        from: { player: "self", zone: "deck", position: "top" },
        to: { player: "self", zone: "life", position: "top" },
        order: "original",
      },
      evidence: [
        "instruction:moveCards",
        "count:positiveInteger",
        "player:self",
        "zone:deck",
        "position:top",
        "destination:life",
        "order:original",
      ],
      rest: "",
    });
  });

  it("parses hand to Life top placement as select-then-move primitives", () => {
    expect(
      parseLifeMovementInstruction({
        text: "Add up to 1 card from your hand to the top of your Life cards.",
      }),
    ).toEqual({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              saveAs: "handSelection:self-hand-to-life-placement",
              visibility: "chooserOnly",
            },
            saveResultAs: "handSelection:self-hand-to-life-placement",
          },
          {
            connector: "ifPossible",
            effect: {
              type: "moveSelected",
              selection: "handSelection:self-hand-to-life-placement",
              from: "hand",
              to: "life",
              position: "top",
            },
          },
        ],
      },
      evidence: [
        "instruction:selectCards",
        "instruction:moveSelected",
        "cardinality:upTo",
        "count:positiveInteger",
        "player:self",
        "zone:hand",
        "destination:life",
        "position:top",
        "chooser:self:upTo",
        "composition:selectThenMove",
      ],
      rest: "",
    });
  });

  it("parses revealed hand to Life top placement as public select-then-move primitives", () => {
    expect(
      parseLifeMovementInstruction({
        text: "Reveal up to 1 {Supernovas} type Character card from your hand and add it to the top of your Life cards face-down.",
      }),
    ).toEqual({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "selectCards",
              zone: "hand",
              player: "self",
              chooser: "self",
              min: 0,
              max: 1,
              saveAs: "handSelection:self-hand-to-life-placement",
              visibility: "bothPlayers",
              filter: {
                categories: ["character"],
                typesAny: ["Supernovas"],
              },
            },
            saveResultAs: "handSelection:self-hand-to-life-placement",
          },
          {
            connector: "ifPossible",
            effect: {
              type: "moveSelected",
              selection: "handSelection:self-hand-to-life-placement",
              from: "hand",
              to: "life",
              position: "top",
            },
          },
        ],
      },
      evidence: [
        "instruction:selectCards",
        "instruction:moveSelected",
        "cardinality:upTo",
        "count:positiveInteger",
        "player:self",
        "zone:hand",
        "destination:life",
        "position:top",
        "filter:type",
        "filter:category:character",
        "reveal:bothPlayers",
        "chooser:self:upTo",
        "composition:selectThenMove",
      ],
      rest: "",
    });
  });

  it("parses top-or-bottom Life to hand as a reusable choice between moveCards bodies", () => {
    expect(
      parseLifeMovementInstruction({
        text: "add 1 card from the top or bottom of your Life cards to your hand.",
      }),
    ).toEqual({
      effect: {
        type: "choice",
        chooser: "self",
        min: 1,
        max: 1,
        options: [
          {
            id: "life-to-hand:top",
            label: "Top of Life",
            effect: {
              type: "moveCards",
              count: 1,
              from: { player: "self", zone: "life", position: "top" },
              to: { player: "self", zone: "hand" },
              order: "original",
            },
          },
          {
            id: "life-to-hand:bottom",
            label: "Bottom of Life",
            effect: {
              type: "moveCards",
              count: 1,
              from: { player: "self", zone: "life", position: "bottom" },
              to: { player: "self", zone: "hand" },
              order: "original",
            },
          },
        ],
      },
      evidence: [
        "instruction:moveCards",
        "count:positiveInteger",
        "player:self",
        "zone:life",
        "position:top",
        "position:bottom",
        "destination:hand",
        "order:original",
        "composition:chooseOne",
      ],
      rest: "",
    });
  });
});
