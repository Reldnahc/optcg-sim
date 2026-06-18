import { describe, expect, it } from "vitest";

import { parseAndConnector, parseThenConnector } from "../connectors/index.js";
import {
  parseDonFieldCountCondition,
  parseHandCountCondition,
  parseLeaderNameCondition,
  parseOpponentRestedCharactersCondition,
  parseSourcePlayedThisTurnCondition,
} from "../conditions/index.js";
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
  parseConditionExpression,
} from "./composed-expression.js";

const plannedInstructions = [
  parseRestOpponentCharactersInstruction,
  parsePreventThatCharacterRefreshInstruction,
  parseYourLeaderPowerOpponentNextEndInstruction,
] as const;

describe("composed expression segment parsers", () => {
  it("parses shared-subject count conjunction conditions", () => {
    const result = parseConditionExpression(
      "you have 7 or more DON!! cards on your field and 5 or less cards in your hand",
      [parseDonFieldCountCondition, parseHandCountCondition],
    );

    expect(result).toMatchObject({
      condition: {
        type: "and",
        conditions: [
          { type: "fieldCount", player: "self" },
          { type: "handCount", player: "self" },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "composition:conditionAnd",
        "condition:donFieldCount",
        "condition:handCount",
      ]),
    );
  });

  it("parses shared-subject count disjunction conditions without splitting comparators", () => {
    const result = parseConditionExpression(
      "you have 0 DON!! cards on your field or 8 or more DON!! cards on your field",
      [parseDonFieldCountCondition],
    );

    expect(result).toMatchObject({
      condition: {
        type: "or",
        conditions: [
          { type: "fieldCount", player: "self", op: "eq", value: 0 },
          { type: "fieldCount", player: "self", op: "gte", value: 8 },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "composition:conditionOr",
        "condition:donFieldCount",
        "condition:threshold:nonNegativeInteger",
        "condition:threshold:positiveInteger",
      ]),
    );
  });

  it("parses shared-tail count disjunction conditions without coupling to one threshold", () => {
    const result = parseConditionExpression(
      "you have 0 or 3 or more DON!! cards on your field",
      [parseDonFieldCountCondition],
    );

    expect(result).toMatchObject({
      condition: {
        type: "or",
        conditions: [
          { type: "fieldCount", player: "self", op: "eq", value: 0 },
          { type: "fieldCount", player: "self", op: "gte", value: 3 },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "composition:conditionOr",
        "condition:donFieldCount",
        "condition:threshold:nonNegativeInteger",
        "condition:threshold:positiveInteger",
      ]),
    );
  });

  it("parses comma-and conjunction conditions without binding to one body", () => {
    const result = parseConditionExpression(
      "your Leader has the {Blackbeard Pirates} type, and this Character was played on this turn",
      [parseLeaderNameCondition, parseSourcePlayedThisTurnCondition],
    );

    expect(result).toMatchObject({
      condition: {
        type: "and",
        conditions: [
          { type: "hasCardInZone", zone: "leaderArea", player: "self" },
          { type: "sourcePlayedThisTurn" },
        ],
      },
      rest: "",
    });
    expect(result?.evidence).toEqual(
      expect.arrayContaining([
        "composition:conditionAnd",
        "condition:leaderIdentity",
        "condition:sourcePlayedThisTurn",
      ]),
    );
  });

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
              type: "sequence",
            },
          },
          {
            connector: "then",
            effect: {
              type: "cannotBecomeActive",
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
          type: "modifyPower",
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
        type: "modifyPower",
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
                    type: "sequence",
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "cannotBecomeActive",
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
                type: "modifyPower",
              },
            },
          },
        ],
      },
    });
  });
});
