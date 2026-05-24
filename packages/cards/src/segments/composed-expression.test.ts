import { describe, expect, it } from "vitest";

import { parseAndConnector, parseThenConnector } from "../connectors/index.js";
import { parseOpponentRestedCharactersCondition } from "../conditions/index.js";
import { parseExpression } from "../expression-parser.js";
import {
  parsePreventThatCharacterRefreshInstruction,
  parseRestOpponentCharactersInstruction,
  parseYourLeaderPowerOpponentNextEndInstruction,
} from "../instructions/index.js";
import {
  conditionalBlockExpressionParser,
  conditionalExpressionSegmentParser,
  instructionExpressionSegmentParser,
} from "./composed-expression.js";

const plannedInstructions = [
  parseRestOpponentCharactersInstruction,
  parsePreventThatCharacterRefreshInstruction,
  parseYourLeaderPowerOpponentNextEndInstruction,
] as const;

describe("composed expression segment parsers", () => {
  it("parses a nested and sequence without requiring a full-line template", () => {
    expect(
      instructionExpressionSegmentParser({
        connectors: [parseAndConnector],
        instructions: plannedInstructions,
      })({
        text: "Rest up to 1 of your opponent's Characters and that Character will not become active in your opponent's next Refresh Phase.",
      }),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "custom",
              handler: "planned:restOpponentCharacters",
            },
          },
          {
            connector: "then",
            effect: {
              type: "custom",
              handler: "planned:preventThatCharacterOpponentNextRefresh",
            },
          },
        ],
      },
    });
  });

  it("parses a conditional segment with separate condition and body parsers", () => {
    expect(
      conditionalExpressionSegmentParser({
        conditions: [parseOpponentRestedCharactersCondition],
        connectors: [parseAndConnector],
        instructions: plannedInstructions,
      })({
        text: "if your opponent has 2 or more rested Characters, your Leader gains +2000 power until the end of your opponent's next End Phase.",
      }),
    ).toMatchObject({
      effect: {
        type: "conditional",
        if: {
          type: "fieldCount",
          player: "opponent",
          op: "gte",
          value: 2,
        },
        then: {
          type: "custom",
          handler: "planned:yourLeaderPowerOpponentNextEnd",
        },
      },
    });
  });

  it("parses a top-level conditional expression into a block condition and body effect", () => {
    expect(
      conditionalBlockExpressionParser({
        conditions: [parseOpponentRestedCharactersCondition],
        connectors: [parseAndConnector],
        instructions: plannedInstructions,
      })({
        text: "if your opponent has 2 or more rested Characters, your Leader gains +2000 power until the end of your opponent's next End Phase.",
      }),
    ).toMatchObject({
      blockPatch: {
        condition: {
          type: "fieldCount",
          player: "opponent",
          op: "gte",
          value: 2,
        },
      },
      effect: {
        type: "custom",
        handler: "planned:yourLeaderPowerOpponentNextEnd",
      },
    });
  });

  it("integrates nested and plus conditional segments under outer connectors", () => {
    expect(
      parseExpression(
        "Rest up to 1 of your opponent's Characters and that Character will not become active in your opponent's next Refresh Phase. Then, if your opponent has 2 or more rested Characters, your Leader gains +2000 power until the end of your opponent's next End Phase.",
        {
          connectors: [parseThenConnector, parseAndConnector],
          segments: [
            conditionalExpressionSegmentParser({
              conditions: [parseOpponentRestedCharactersCondition],
              connectors: [parseAndConnector],
              instructions: plannedInstructions,
            }),
            instructionExpressionSegmentParser({
              connectors: [parseAndConnector],
              instructions: plannedInstructions,
            }),
          ],
        },
      ),
    ).toMatchObject({
      effect: {
        type: "sequence",
        effects: [
          {
            connector: "always",
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "custom",
                    handler: "planned:restOpponentCharacters",
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "custom",
                    handler: "planned:preventThatCharacterOpponentNextRefresh",
                  },
                },
              ],
            },
          },
          {
            connector: "then",
            effect: {
              type: "conditional",
              then: {
                type: "custom",
                handler: "planned:yourLeaderPowerOpponentNextEnd",
              },
            },
          },
        ],
      },
    });
  });
});
