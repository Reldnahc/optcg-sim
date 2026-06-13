import { describe, expect, it } from "vitest";

import { parseCardEffectLine } from "./card-effect-line-parser.js";

describe("OP14 all-field stat gain parsing", () => {
  it("decomposes all typed Leader and Character stat gains into zone-specific primitives", () => {
    const result = parseCardEffectLine(
      "[Main] All of your {Fish-Man} or {Merfolk} type Leader and Character cards gain +1000 power during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "main" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "modifyPower",
                target: {
                  type: "all",
                  player: "self",
                  zone: "leaderArea",
                  filter: {
                    categories: ["leader"],
                    typesAny: ["Fish-Man", "Merfolk"],
                  },
                },
                value: 1000,
                duration: { type: "thisTurn" },
              },
            },
            {
              connector: "always",
              effect: {
                type: "modifyPower",
                target: {
                  type: "all",
                  player: "self",
                  zone: "characterArea",
                  filter: {
                    categories: ["character"],
                    typesAny: ["Fish-Man", "Merfolk"],
                  },
                },
                value: 1000,
                duration: { type: "thisTurn" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:eventMain",
        "instruction:modifyPower",
        "cardinality:all",
        "zone:leaderArea",
        "zone:characterArea",
        "filter:type",
        "duration:thisTurn",
      ]),
    );
  });

  it("decomposes your Leader and all Character stat gains into zone-specific primitives", () => {
    const result = parseCardEffectLine(
      "[Main] Your Leader and all of your Characters gain +1000 power during this turn.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "main" },
        effect: {
          type: "sequence",
          effects: [
            {
              connector: "always",
              effect: {
                type: "modifyPower",
                target: { type: "myLeader" },
                value: 1000,
                duration: { type: "thisTurn" },
              },
            },
            {
              connector: "always",
              effect: {
                type: "modifyPower",
                target: {
                  type: "all",
                  player: "self",
                  zone: "characterArea",
                  filter: { categories: ["character"] },
                },
                value: 1000,
                duration: { type: "thisTurn" },
              },
            },
          ],
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:eventMain",
        "instruction:modifyPower",
        "target:yourLeader",
        "cardinality:all",
        "zone:characterArea",
        "duration:thisTurn",
      ]),
    );
  });

  it("parses all typed Character cost gains through opponent next End Phase", () => {
    const result = parseCardEffectLine(
      "[On K.O.] All of your {Thriller Bark Pirates} type Characters gain +4 cost until the end of your opponent's next End Phase.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onKO" },
        effect: {
          type: "modifyCost",
          player: "self",
          target: {
            type: "all",
            player: "self",
            zone: "characterArea",
            filter: {
              categories: ["character"],
              typesAny: ["Thriller Bark Pirates"],
            },
          },
          value: 4,
          duration: { type: "untilEndOfNextTurn", player: "opponent" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onKO",
        "instruction:modifyCost",
        "cardinality:all",
        "filter:type",
        "modifier:positiveCost",
        "duration:opponentNextEndPhase",
      ]),
    );
  });

  it("parses all named-or-typed Character power gains through opponent next End Phase", () => {
    const result = parseCardEffectLine(
      "[On Play] All of your [Donquixote Rosinante] and {Heart Pirates} type Characters gain +1000 power until the end of your opponent's next End Phase.",
    );

    expect(result).toMatchObject({
      block: {
        category: "auto",
        trigger: { type: "onPlay" },
        effect: {
          type: "modifyPower",
          target: {
            type: "all",
            player: "self",
            zone: "characterArea",
            filter: {
              categories: ["character"],
              anyOf: [
                { names: ["Donquixote Rosinante"] },
                { typesAny: ["Heart Pirates"] },
              ],
            },
          },
          value: 1000,
          duration: { type: "untilEndOfNextTurn", player: "opponent" },
        },
      },
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "entry:onPlay",
        "instruction:modifyPower",
        "cardinality:all",
        "filter:anyOf",
        "filter:name",
        "filter:type",
        "duration:opponentNextEndPhase",
      ]),
    );
  });
});
