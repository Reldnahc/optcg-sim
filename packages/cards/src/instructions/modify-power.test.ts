import { describe, expect, it } from "vitest";

import {
  modifyPowerInstructionPrimitive,
  parseModifyPowerInstruction,
} from "./modify-power.js";

describe("modify power instruction parser", () => {
  it("defines modifyPower as an instruction parent that composes child primitives", () => {
    expect(modifyPowerInstructionPrimitive).toEqual({
      primitiveId: "instruction:modifyPower",
      childPrimitiveIds: [
        "cardinality:all",
        "cardinality:upTo",
        "target:opponentCharacters",
        "target:yourNamedCards",
        "target:yourCharacters",
        "target:yourLeaderOrCharacters",
        "target:yourLeader",
        "target:thisCharacter",
        "modifier:negativePower",
        "modifier:positivePower",
        "duration:thisBattle",
        "duration:thisTurn",
        "duration:selfNextTurnStart",
        "duration:opponentNextEndPhase",
        "duration:opponentNextRefreshPhase",
      ],
    });
  });

  it("parses up-to opponent Character negative power for this turn", () => {
    expect(
      parseModifyPowerInstruction({
        text: "give up to 1 of your opponent's Characters −1000 power during this turn.",
      }),
    ).toMatchObject({
      effect: {
        type: "modifyPower",
        target: {
          type: "choose",
          request: {
            chooser: "self",
            player: "opponent",
            zone: "characterArea",
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            filter: { categories: ["character"] },
          },
        },
        value: -1000,
        duration: { type: "thisTurn" },
      },
      evidence: [
        "instruction:modifyPower",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "filter:category:character",
        "modifier:negativePower",
        "duration:thisTurn",
      ],
      rest: "",
    });
  });

  it("parses target filter predicates independently from modify power text", () => {
    expect(
      parseModifyPowerInstruction({
        text: "give up to 1 of your opponent's Characters with a cost of 5 or less −1000 power during this turn.",
      }),
    ).toMatchObject({
      effect: {
        type: "modifyPower",
        target: {
          type: "choose",
          request: {
            filter: {
              categories: ["character"],
              cost: { max: 5 },
            },
          },
        },
      },
      evidence: [
        "instruction:modifyPower",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "filter:category:character",
        "filter:cost",
        "condition:comparator:lte",
        "condition:threshold:positiveInteger",
        "modifier:negativePower",
        "duration:thisTurn",
      ],
    });
  });

  it("parses opponent Leader or Character negative power with battle duration", () => {
    expect(
      parseModifyPowerInstruction({
        text: "Give up to 1 of your opponent's Leader or Character cards -2000 power during this battle.",
      }),
    ).toMatchObject({
      effect: {
        type: "modifyPower",
        target: {
          type: "chooseFromZones",
          request: {
            chooser: "self",
            player: "opponent",
            zones: ["leaderArea", "characterArea"],
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            filter: { categories: ["leader", "character"] },
          },
        },
        value: -2000,
        duration: { type: "thisBattle" },
      },
      evidence: [
        "instruction:modifyPower",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "target:opponentLeaderOrCharacters",
        "player:opponent",
        "filter:category:leader",
        "filter:category:character",
        "modifier:negativePower",
        "duration:thisBattle",
      ],
      rest: "",
    });
  });

  it("parses negative power with the reusable explicit field-effect duration family", () => {
    expect(
      parseModifyPowerInstruction({
        text: "Give up to 1 of your opponent's Characters -1000 power until the end of your opponent's next turn.",
      }),
    ).toMatchObject({
      effect: {
        type: "modifyPower",
        target: {
          type: "choose",
          request: {
            chooser: "self",
            player: "opponent",
            zone: "characterArea",
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            filter: { categories: ["character"] },
          },
        },
        value: -1000,
        duration: { type: "untilEndOfNextTurn", player: "opponent" },
      },
      evidence: [
        "instruction:modifyPower",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "player:opponent",
        "target:opponentCharacters",
        "filter:category:character",
        "modifier:negativePower",
        "duration:opponentNextEndPhase",
      ],
      rest: "",
    });
  });

  it("parses all opponent Character negative power as all target plus modifier primitives", () => {
    expect(
      parseModifyPowerInstruction({
        text: "Give all of your opponent's Characters −2000 power during this turn.",
      }),
    ).toMatchObject({
      effect: {
        type: "modifyPower",
        target: {
          type: "all",
          zone: "characterArea",
          player: "opponent",
          filter: { categories: ["character"] },
        },
        value: -2000,
        duration: { type: "thisTurn" },
      },
      evidence: [
        "instruction:modifyPower",
        "cardinality:all",
        "player:opponent",
        "zone:characterArea",
        "filter:category:character",
        "modifier:negativePower",
        "duration:thisTurn",
      ],
      rest: "",
    });
  });

  it("parses positive power for self Leader or Character targets during this turn", () => {
    expect(
      parseModifyPowerInstruction({
        text: "up to 1 of your Leader or Character cards gains +1000 power during this turn.",
      }),
    ).toMatchObject({
      effect: {
        type: "modifyPower",
        target: {
          type: "chooseFromZones",
          request: {
            chooser: "self",
            player: "self",
            zones: ["leaderArea", "characterArea"],
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            filter: { categories: ["leader", "character"] },
          },
        },
        value: 1000,
        duration: { type: "thisTurn" },
      },
      evidence: [
        "instruction:modifyPower",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "target:yourLeaderOrCharacters",
        "player:self",
        "filter:category:leader",
        "filter:category:character",
        "modifier:positivePower",
        "duration:thisTurn",
      ],
      rest: "",
    });
  });

  it("parses positive power for typed self Leader or Character targets", () => {
    expect(
      parseModifyPowerInstruction({
        text: "Up to 1 of your {Donquixote Pirates} type Leader or Character cards gains +2000 power during this battle.",
      }),
    ).toMatchObject({
      effect: {
        type: "modifyPower",
        target: {
          type: "chooseFromZones",
          request: {
            chooser: "self",
            player: "self",
            zones: ["leaderArea", "characterArea"],
            min: 0,
            max: 1,
            allowFewerIfUnavailable: true,
            filter: {
              categories: ["leader", "character"],
              typesAny: ["Donquixote Pirates"],
            },
          },
        },
        value: 2000,
        duration: { type: "thisBattle" },
      },
      evidence: [
        "instruction:modifyPower",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "target:yourLeaderOrCharacters",
        "player:self",
        "filter:type",
        "filter:category:leader",
        "filter:category:character",
        "modifier:positivePower",
        "duration:thisBattle",
      ],
      rest: "",
    });
  });

  it("parses positive power for typed self Character targets with parsed cardinality", () => {
    expect(
      parseModifyPowerInstruction({
        text: "Up to 3 of your {Admiral} type Characters gain +2000 power during this turn.",
      }),
    ).toMatchObject({
      effect: {
        type: "modifyPower",
        target: {
          type: "choose",
          request: {
            chooser: "self",
            player: "self",
            zone: "characterArea",
            min: 0,
            max: 3,
            allowFewerIfUnavailable: true,
            filter: {
              categories: ["character"],
              typesAny: ["Admiral"],
            },
          },
        },
        value: 2000,
        duration: { type: "thisTurn" },
      },
      evidence: [
        "instruction:modifyPower",
        "cardinality:upTo",
        "count:positiveInteger",
        "chooser:self:upTo",
        "target:yourCharacters",
        "player:self",
        "filter:category:character",
        "filter:type",
        "filter:category:character",
        "modifier:positivePower",
        "duration:thisTurn",
      ],
      rest: "",
    });
  });

  it("parses positive power for this Character during this turn", () => {
    expect(
      parseModifyPowerInstruction({
        text: "this Character gains +1000 power during this turn.",
      }),
    ).toMatchObject({
      effect: {
        type: "modifyPower",
        target: { type: "self" },
        value: 1000,
        duration: { type: "thisTurn" },
      },
      evidence: [
        "instruction:modifyPower",
        "target:thisCharacter",
        "modifier:positivePower",
        "duration:thisTurn",
      ],
      rest: "",
    });
  });
});
