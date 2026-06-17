import { describe, expect, it } from "vitest";

import {
  parseFieldCostReductionInstruction,
  parseTargetedModifyCostInstruction,
} from "./modify-cost/index.js";

describe("modify cost instruction parser", () => {
  it("parses targeted positive cost modifiers over your Characters", () => {
    expect(
      parseTargetedModifyCostInstruction({
        text: "up to 1 of your Characters gains +2 cost until the end of your opponent's next End Phase.",
      }),
    ).toEqual({
      effect: {
        type: "modifyCost",
        player: "self",
        target: {
          type: "choose",
          request: {
            timing: "onResolution",
            chooser: "self",
            player: "self",
            zone: "characterArea",
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            visibility: "public",
            filter: { categories: ["character"] },
          },
        },
        value: 2,
        duration: { type: "untilEndOfNextTurn", player: "opponent" },
      },
      evidence: [
        "instruction:modifyCost",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "target:yourCharacters",
        "player:self",
        "filter:category:character",
        "modifier:positiveCost",
        "count:positiveInteger",
        "duration:opponentNextEndPhase",
      ],
      rest: "",
    });
  });

  it("parses targeted positive cost modifiers during this turn", () => {
    expect(
      parseTargetedModifyCostInstruction({
        text: "up to 1 of your Characters gains +2 cost during this turn.",
      }),
    ).toMatchObject({
      effect: {
        type: "modifyCost",
        player: "self",
        value: 2,
        duration: { type: "thisTurn" },
      },
      evidence: [
        "instruction:modifyCost",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "target:yourCharacters",
        "player:self",
        "filter:category:character",
        "modifier:positiveCost",
        "count:positiveInteger",
        "duration:thisTurn",
      ],
      rest: "",
    });
  });

  it("parses targeted cost reductions with printed en-dash modifiers", () => {
    expect(
      parseFieldCostReductionInstruction(
        {
          text: "Give up to 1 of your opponent's Characters –2 cost during this turn.",
        },
        {
          condition: undefined,
          requireExplicitDuration: true,
        },
      ),
    ).toMatchObject({
      effect: {
        type: "modifyCost",
        player: "self",
        value: -2,
        duration: { type: "thisTurn" },
      },
      evidence: [
        "instruction:modifyCost",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "filter:category:character",
        "modifier:costReduction",
        "count:positiveInteger",
        "duration:thisTurn",
      ],
      rest: "",
    });
  });

  it("parses named field card targets for targeted positive cost modifiers", () => {
    expect(
      parseTargetedModifyCostInstruction({
        text: "up to 1 of your [Kouzuki Momonosuke] gains +20 cost during this turn.",
      }),
    ).toMatchObject({
      effect: {
        type: "modifyCost",
        player: "self",
        target: {
          type: "chooseFromZones",
          request: {
            chooser: "self",
            player: "self",
            zones: ["leaderArea", "characterArea"],
            min: 0,
            max: 1,
            filter: { names: ["Kouzuki Momonosuke"] },
          },
        },
        value: 20,
        duration: { type: "thisTurn" },
      },
      evidence: [
        "instruction:modifyCost",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "target:yourNamedCards",
        "player:self",
        "filter:name",
        "modifier:positiveCost",
        "count:positiveInteger",
        "duration:thisTurn",
      ],
      rest: "",
    });
  });

  it("parses this Character positive cost modifiers with explicit field duration", () => {
    expect(
      parseTargetedModifyCostInstruction({
        text: "this Character gains +2 cost until the end of your opponent's next End Phase.",
      }),
    ).toMatchObject({
      effect: {
        type: "modifyCost",
        player: "self",
        target: { type: "self" },
        value: 2,
        duration: { type: "untilEndOfNextTurn", player: "opponent" },
      },
      evidence: [
        "instruction:modifyCost",
        "target:thisCharacter",
        "modifier:positiveCost",
        "count:positiveInteger",
        "duration:opponentNextEndPhase",
      ],
      rest: "",
    });
  });

  it("parses attached DON scaled positive cost modifiers through reusable dynamic values", () => {
    expect(
      parseTargetedModifyCostInstruction({
        text: "this Character gains +1 cost during this turn for every DON!! card given to this Character.",
      }),
    ).toMatchObject({
      effect: {
        type: "modifyCost",
        player: "self",
        target: { type: "self" },
        value: {
          type: "countAttachedDon",
          target: { type: "self" },
          per: 1,
          multiplier: 1,
        },
        duration: { type: "thisTurn" },
      },
      evidence: [
        "instruction:modifyCost",
        "target:thisCharacter",
        "modifier:positiveCost",
        "count:positiveInteger",
        "duration:thisTurn",
        "value:dynamic:attachedDonCount",
        "target:thisCharacter",
      ],
      rest: "",
    });
  });

  it("parses trash-count scaled positive cost modifiers through reusable dynamic values", () => {
    expect(
      parseTargetedModifyCostInstruction({
        text: "this Character gains +1 cost during this turn for every 5 Events in your trash.",
      }),
    ).toMatchObject({
      effect: {
        type: "modifyCost",
        player: "self",
        target: { type: "self" },
        value: {
          type: "countMatchingZoneCards",
          player: "self",
          zone: "trash",
          filter: { categories: ["event"] },
          per: 5,
          multiplier: 1,
        },
        duration: { type: "thisTurn" },
      },
      evidence: [
        "instruction:modifyCost",
        "target:thisCharacter",
        "modifier:positiveCost",
        "count:positiveInteger",
        "duration:thisTurn",
        "value:dynamic:matchingZoneCards",
        "zone:trash",
        "filter:category:event",
      ],
      rest: "",
    });
  });
});
