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
    ],
  };

export const parseTrashFromHandInstruction: InstructionParser = (input) =>
  parsePrimitivePattern(input, trashFromHandPrimitive);
