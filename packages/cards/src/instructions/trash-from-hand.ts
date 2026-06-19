import {
  parsePrimitivePattern,
  type PrimitivePatternDefinition,
} from "../primitive-patterns.js";
import type { InstructionParseResult, InstructionParser } from "../types.js";

export const trashFromHandPrimitive: PrimitivePatternDefinition<InstructionParseResult> =
  {
    primitiveId: "instruction:trashFromHand",
    matches: [
      {
        id: "trash-n-cards-from-your-hand",
        pattern: /^trash (?<count>[1-9]\d*) cards? from your hand\.?$/i,
        build: (groups) => ({
          effect: {
            type: "trashFromHand",
            count: Number.parseInt(groups["count"] ?? "", 10),
            player: "self",
            chooser: "self",
          },
          evidence: [
            "instruction:trashFromHand",
            "count:positiveInteger",
            "player:self",
            "chooser:self",
          ],
          rest: "",
        }),
      },
      {
        id: "trash-up-to-n-cards-from-your-hand",
        pattern: /^trash up to (?<count>[1-9]\d*) cards? from your hand\.?$/i,
        build: (groups) => ({
          effect: {
            type: "trashFromHand",
            count: Number.parseInt(groups["count"] ?? "", 10),
            min: 0,
            player: "self",
            chooser: "self",
          },
          evidence: [
            "instruction:trashFromHand",
            "cardinality:upTo",
            "count:positiveInteger",
            "player:self",
            "chooser:self",
          ],
          rest: "",
        }),
      },
      {
        id: "trash-n-cards-from-your-opponents-hand",
        pattern:
          /^trash (?<count>[1-9]\d*) cards? from your opponent's hand\.?$/i,
        build: (groups) => ({
          effect: {
            type: "trashFromHand",
            count: Number.parseInt(groups["count"] ?? "", 10),
            player: "opponent",
            chooser: "opponent",
          },
          evidence: [
            "instruction:trashFromHand",
            "count:positiveInteger",
            "player:opponent",
            "chooser:opponent",
          ],
          rest: "",
        }),
      },
      {
        id: "opponent-trashes-n-cards-from-their-hand",
        pattern:
          /^your opponent trashes (?<count>[1-9]\d*) cards? from their hand\.?$/i,
        build: (groups) => ({
          effect: {
            type: "trashFromHand",
            count: Number.parseInt(groups["count"] ?? "", 10),
            player: "opponent",
            chooser: "opponent",
          },
          evidence: [
            "instruction:trashFromHand",
            "count:positiveInteger",
            "player:opponent",
            "chooser:opponent",
          ],
          rest: "",
        }),
      },
      {
        id: "opponent-chooses-n-cards-from-their-hand-and-trashes-them",
        pattern:
          /^your opponent chooses (?<count>[1-9]\d*) cards? from their hand and trashes (?:it|them)\.?$/i,
        build: (groups) => ({
          effect: {
            type: "trashFromHand",
            count: Number.parseInt(groups["count"] ?? "", 10),
            player: "opponent",
            chooser: "opponent",
          },
          evidence: [
            "instruction:trashFromHand",
            "count:positiveInteger",
            "player:opponent",
            "chooser:opponent",
          ],
          rest: "",
        }),
      },
      {
        id: "opponent-chooses-n-cards-from-your-hand-then-trash",
        pattern:
          /^your opponent chooses (?<count>[1-9]\d*) cards? from your hand;\s*trash (?:that|those) cards?\.?$/i,
        build: (groups) => ({
          effect: {
            type: "trashFromHand",
            count: Number.parseInt(groups["count"] ?? "", 10),
            player: "self",
            chooser: "opponent",
          },
          evidence: [
            "instruction:trashFromHand",
            "count:positiveInteger",
            "player:self",
            "chooser:opponent",
          ],
          rest: "",
        }),
      },
      {
        id: "trash-all-cards-from-your-hand",
        pattern: /^trash all cards from your hand\.?$/i,
        build: () => ({
          effect: {
            type: "trashFromHandUntilCount",
            player: "self",
            chooser: "self",
            handCount: 0,
          },
          evidence: [
            "instruction:trashFromHandUntilCount",
            "condition:handCount",
            "condition:comparator:eq",
            "condition:threshold:nonNegativeInteger",
            "player:self",
            "chooser:self",
          ],
          rest: "",
        }),
      },
      {
        id: "both-players-trash-from-hand-until-count",
        pattern:
          /^you and your opponent trash cards from your hands until you each have (?<count>\d+) cards in your hands\.?$/i,
        build: (groups) => {
          const handCount = Number.parseInt(groups["count"] ?? "", 10);
          return {
            effect: {
              type: "sequence",
              effects: [
                {
                  connector: "always",
                  effect: {
                    type: "trashFromHandUntilCount",
                    player: "self",
                    chooser: "self",
                    handCount,
                  },
                },
                {
                  connector: "then",
                  effect: {
                    type: "trashFromHandUntilCount",
                    player: "opponent",
                    chooser: "opponent",
                    handCount,
                  },
                },
              ],
            },
            evidence: [
              "instruction:trashFromHandUntilCount",
              "composition:sequence",
              "condition:handCount",
              "condition:comparator:eq",
              "condition:threshold:nonNegativeInteger",
              "player:self",
              "chooser:self",
              "player:opponent",
              "chooser:opponent",
            ],
            rest: "",
          };
        },
      },
      {
        id: "trash-from-hand-until-count",
        pattern:
          /^trash cards from your hand until you have (?<count>\d+) cards in your hand\.?$/i,
        build: (groups) => ({
          effect: {
            type: "trashFromHandUntilCount",
            player: "self",
            chooser: "self",
            handCount: Number.parseInt(groups["count"] ?? "", 10),
          },
          evidence: [
            "instruction:trashFromHandUntilCount",
            "condition:handCount",
            "condition:comparator:eq",
            "condition:threshold:nonNegativeInteger",
            "player:self",
            "chooser:self",
          ],
          rest: "",
        }),
      },
    ],
  };

export const parseTrashFromHandInstruction: InstructionParser = (input) =>
  parsePrimitivePattern(input, trashFromHandPrimitive);
